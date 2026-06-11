
-- =========================================================================
-- Bug 1: rpc_get_package_usage — billable-only filter + hardening
-- Bug 2: package_instances.hours_used — trigger + backfill
-- Single transaction.
-- =========================================================================

/* ============================================================
   ROLLBACK REFERENCE — pre-change DDL for rpc_get_package_usage
   (captured verbatim from pg_get_functiondef before this migration)
   ------------------------------------------------------------
   CREATE OR REPLACE FUNCTION public.rpc_get_package_usage(p_client_id bigint, p_client_package_id bigint)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
   AS $function$
   ... (132-line prior body; see migration 20260309112219) ...
   $function$;
   To rollback:
     1. Restore the prior CREATE OR REPLACE FUNCTION body above.
     2. DROP TRIGGER IF EXISTS trg_recalc_package_hours_used ON public.time_entries;
     3. DROP FUNCTION IF EXISTS public.tg_recalc_package_hours_used();
     4. Optional: UPDATE public.package_instances SET hours_used = NULL;
   ============================================================ */

-- ---------------------------------------------------------------------
-- Step 1: Replay rpc_get_package_usage with billable-only filter,
-- split non-billable breakdown into separate unfiltered SELECT,
-- and harden search_path to ''.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_package_usage(p_client_id bigint, p_client_package_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_included_minutes integer;
  v_used_minutes bigint;
  v_trailing_30d_minutes bigint;
  v_used_percent numeric;
  v_remaining_minutes bigint;
  v_forecast_days numeric;
  v_daily_rate numeric;
  v_manual_total bigint;
  v_timer_total bigint;
  v_calendar_total bigint;
  v_manual_30d bigint;
  v_timer_30d bigint;
  v_calendar_30d bigint;
  v_billable_total bigint;
  v_non_billable_total bigint;
  v_renewal_start timestamptz;
  v_renewal_end timestamptz;
BEGIN
  -- Get package instance details
  SELECT pi.tenant_id, pi.package_id,
    COALESCE(pi.included_minutes, COALESCE(pi.hours_included, p.total_hours, 0) * 60),
    COALESCE(pi.next_renewal_date, pi.start_date::date + interval '1 year'),
    (COALESCE(pi.next_renewal_date, pi.start_date::date + interval '1 year') - interval '1 year')
  INTO v_tenant_id, v_package_id, v_included_minutes, v_renewal_end, v_renewal_start
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = p_client_package_id
    AND pi.tenant_id = p_client_id
    AND pi.is_complete = false;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'package_not_found');
  END IF;

  -- Access gate: Vivacity staff OR connected tenant members
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.connected_tenants
      WHERE user_uuid = auth.uid() AND tenant_id = v_tenant_id
    ) THEN
      RETURN jsonb_build_object('error', 'access_denied');
    END IF;
  END IF;

  -- Block A1: billable-only totals + by-source breakdown (renewal year + parent/child rollup)
  SELECT
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual'   THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer'    THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_used_minutes, v_manual_total, v_timer_total, v_calendar_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_id = p_client_package_id
      OR te.package_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.start_at >= v_renewal_start
    AND te.start_at <  v_renewal_end
    AND te.is_billable = true;

  -- Block A2: billable / non-billable breakdown — UNFILTERED so the badge still works
  SELECT
    COALESCE(SUM(CASE WHEN te.is_billable = true  THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.is_billable = false THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_billable_total, v_non_billable_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_id = p_client_package_id
      OR te.package_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.start_at >= v_renewal_start
    AND te.start_at <  v_renewal_end;

  -- Block B: trailing 30 days, billable-only
  SELECT
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual'   THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer'    THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_trailing_30d_minutes, v_manual_30d, v_timer_30d, v_calendar_30d
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_id = p_client_package_id
      OR te.package_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.start_at >= (now() - interval '30 days')
    AND te.start_at >= v_renewal_start
    AND te.start_at <  v_renewal_end
    AND te.is_billable = true;

  -- Add hours_added bonus
  v_included_minutes := v_included_minutes + COALESCE((
    SELECT COALESCE(hours_added, 0) * 60 FROM public.package_instances WHERE id = p_client_package_id
  ), 0);

  v_remaining_minutes := v_included_minutes - v_used_minutes;

  IF v_included_minutes > 0 THEN
    v_used_percent := ROUND((v_used_minutes::numeric / v_included_minutes::numeric) * 100, 1);
  ELSE
    v_used_percent := 0;
  END IF;

  v_daily_rate := v_trailing_30d_minutes::numeric / 30.0;

  IF v_daily_rate > 0 AND v_remaining_minutes > 0 THEN
    v_forecast_days := ROUND(v_remaining_minutes::numeric / v_daily_rate, 0);
  ELSE
    v_forecast_days := NULL;
  END IF;

  RETURN jsonb_build_object(
    'included_minutes', v_included_minutes,
    'used_minutes', v_used_minutes,
    'remaining_minutes', v_remaining_minutes,
    'used_percent', v_used_percent,
    'trailing_30d_minutes', v_trailing_30d_minutes,
    'daily_rate_minutes', ROUND(v_daily_rate, 1),
    'forecast_days_to_zero', v_forecast_days,
    'package_id', v_package_id,
    'manual_minutes_total', v_manual_total,
    'timer_minutes_total', v_timer_total,
    'calendar_minutes_total', v_calendar_total,
    'manual_minutes_30d', v_manual_30d,
    'timer_minutes_30d', v_timer_30d,
    'calendar_minutes_30d', v_calendar_30d,
    'billable_minutes_total', v_billable_total,
    'non_billable_minutes_total', v_non_billable_total
  );
END;
$function$;

-- Step 2: lock down execute privilege
REVOKE ALL ON FUNCTION public.rpc_get_package_usage(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_package_usage(bigint, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- Step 3: Trigger function — maintain package_instances.hours_used
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_recalc_package_hours_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_affected bigint[] := ARRAY[]::bigint[];
  v_parent   bigint;
  v_id       bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.package_instance_id IS NOT NULL THEN
      v_affected := ARRAY[NEW.package_instance_id];
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.package_instance_id IS NOT NULL THEN
      v_affected := ARRAY[OLD.package_instance_id];
    END IF;
  ELSE -- UPDATE
    IF NEW.package_instance_id IS NOT NULL THEN
      v_affected := array_append(v_affected, NEW.package_instance_id);
    END IF;
    IF OLD.package_instance_id IS NOT NULL
       AND OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id THEN
      v_affected := array_append(v_affected, OLD.package_instance_id);
    END IF;
  END IF;

  IF array_length(v_affected, 1) IS NULL THEN
    RETURN NULL; -- nothing to recalc
  END IF;

  FOREACH v_id IN ARRAY v_affected LOOP
    -- Recompute the affected instance (own + any children rolled up)
    UPDATE public.package_instances pi
    SET hours_used = COALESCE((
      SELECT SUM(te.duration_minutes) FILTER (WHERE te.is_billable = true)
      FROM public.time_entries te
      WHERE te.package_instance_id = pi.id
         OR te.package_instance_id IN (
              SELECT child.id FROM public.package_instances child
              WHERE child.parent_instance_id = pi.id
            )
    ), 0) / 60.0
    WHERE pi.id = v_id;

    -- If this instance has a parent, recompute the parent too
    SELECT parent_instance_id INTO v_parent
    FROM public.package_instances WHERE id = v_id;

    IF v_parent IS NOT NULL THEN
      UPDATE public.package_instances pi
      SET hours_used = COALESCE((
        SELECT SUM(te.duration_minutes) FILTER (WHERE te.is_billable = true)
        FROM public.time_entries te
        WHERE te.package_instance_id = pi.id
           OR te.package_instance_id IN (
                SELECT child.id FROM public.package_instances child
                WHERE child.parent_instance_id = pi.id
              )
      ), 0) / 60.0
      WHERE pi.id = v_parent;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_recalc_package_hours_used() FROM PUBLIC;

-- ---------------------------------------------------------------------
-- Step 4: Trigger
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_recalc_package_hours_used ON public.time_entries;
CREATE TRIGGER trg_recalc_package_hours_used
AFTER INSERT OR DELETE OR UPDATE OF duration_minutes, is_billable, package_instance_id
ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_package_hours_used();

-- ---------------------------------------------------------------------
-- Step 5: Backfill
-- ---------------------------------------------------------------------

-- Pass 1: direct billable totals per instance
UPDATE public.package_instances pi
SET hours_used = COALESCE(agg.mins, 0) / 60.0
FROM (
  SELECT package_instance_id, SUM(duration_minutes) FILTER (WHERE is_billable = true) AS mins
  FROM public.time_entries
  WHERE package_instance_id IS NOT NULL
  GROUP BY package_instance_id
) agg
WHERE pi.id = agg.package_instance_id;

-- Any instance with no time_entries: NULL -> 0
UPDATE public.package_instances SET hours_used = 0 WHERE hours_used IS NULL;

-- Pass 2: roll children's billable usage into parents
UPDATE public.package_instances parent
SET hours_used = COALESCE((
  SELECT SUM(te.duration_minutes) FILTER (WHERE te.is_billable = true)
  FROM public.time_entries te
  WHERE te.package_instance_id = parent.id
     OR te.package_instance_id IN (
          SELECT child.id FROM public.package_instances child
          WHERE child.parent_instance_id = parent.id
        )
), 0) / 60.0
WHERE EXISTS (
  SELECT 1 FROM public.package_instances child WHERE child.parent_instance_id = parent.id
);
