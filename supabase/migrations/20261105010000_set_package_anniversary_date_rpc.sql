-- SuperAdmin override for a package instance's anniversary date.
--
-- package_instances.next_renewal_date is the END of the package's current
-- hours window (fn_package_used_minutes, v_package_burndown, the client portal
-- hours RPCs and the usage-alert trigger all read it). It is set once at
-- insert by set_default_renewal_date() (start_date + 1 year) and thereafter
-- only moves via the Renew dialog, so there was no sanctioned way to correct
-- it for an agreed non-standard term. Editing the column directly is unsafe
-- for three reasons this function handles in one transaction:
--   1. package_renewal_periods.period_end for the OPEN period must equal
--      next_renewal_date (verified 0 mismatches across 86 active instances,
--      2026-11-05), so it is moved in step.
--   2. package_instances.hours_used is a stored value recomputed only on
--      time-entry writes (tg_recalc_package_hours_used). A window change
--      alone would leave it stale, so it is recomputed here, for the
--      instance and its parent (a parent's hours roll up its children).
--   3. Every change needs an audit trail: who, when, old, new, and why.
--
-- The window START is deliberately not editable here (start_renewal_date /
-- start_date are history). Only the end moves.

CREATE OR REPLACE FUNCTION public.set_package_anniversary_date(
  p_instance_id bigint,
  p_new_date date,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_pi           public.package_instances%ROWTYPE;
  v_period_start date;
  v_old_date     date;
  v_reason       text := btrim(coalesce(p_reason, ''));
  v_target       bigint;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only SuperAdmins can change a package anniversary date'
      USING ERRCODE = '42501';
  END IF;

  IF p_instance_id IS NULL OR p_new_date IS NULL THEN
    RAISE EXCEPTION 'Package instance and new anniversary date are required'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pi
  FROM public.package_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package instance % not found', p_instance_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_pi.is_complete THEN
    RAISE EXCEPTION 'The anniversary date of a completed package cannot be changed'
      USING ERRCODE = '22023';
  END IF;

  v_period_start := COALESCE(v_pi.start_renewal_date, v_pi.start_date);
  v_old_date     := v_pi.next_renewal_date;

  IF p_new_date <= v_period_start THEN
    RAISE EXCEPTION 'The anniversary must be after the period start (%)', v_period_start
      USING ERRCODE = '22023';
  END IF;

  IF p_new_date > (v_period_start + interval '3 years')::date THEN
    RAISE EXCEPTION 'The anniversary can be at most 3 years after the period start (%)', v_period_start
      USING ERRCODE = '22023';
  END IF;

  IF v_old_date IS NOT DISTINCT FROM p_new_date THEN
    RAISE EXCEPTION 'The anniversary date is already %', p_new_date
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.package_instances
  SET next_renewal_date = p_new_date
  WHERE id = p_instance_id;

  -- Keep the open period's end in step (invariant: period_end = next_renewal_date).
  UPDATE public.package_renewal_periods
  SET period_end = p_new_date
  WHERE package_instance_id = p_instance_id
    AND closed_at IS NULL;

  -- Recompute the stored hours for this instance and its parent, using the
  -- same formula as tg_recalc_package_hours_used() (own minutes + children's).
  FOR v_target IN
    SELECT x FROM unnest(ARRAY[p_instance_id, v_pi.parent_instance_id]) AS x WHERE x IS NOT NULL
  LOOP
    UPDATE public.package_instances pi
    SET hours_used = (
      public.fn_package_used_minutes(pi.id)
      + COALESCE((
          SELECT SUM(public.fn_package_used_minutes(child.id))
          FROM public.package_instances child
          WHERE child.parent_instance_id = pi.id
        ), 0)
    ) / 60.0
    WHERE pi.id = v_target;
  END LOOP;

  INSERT INTO public.client_audit_log
    (tenant_id, actor_user_id, action, entity_type, entity_id, details, before_data, after_data)
  VALUES (
    v_pi.tenant_id,
    v_actor,
    'anniversary_date_override',
    'package_instances',
    p_instance_id::text,
    jsonb_build_object(
      'reason', v_reason,
      'period_start', v_period_start,
      'period_days', (p_new_date - v_period_start)
    ),
    jsonb_build_object('next_renewal_date', v_old_date),
    jsonb_build_object('next_renewal_date', p_new_date)
  );

  RETURN jsonb_build_object(
    'package_instance_id', p_instance_id,
    'previous_date', v_old_date,
    'new_date', p_new_date,
    'period_start', v_period_start,
    'period_days', (p_new_date - v_period_start)
  );
END;
$function$;

COMMENT ON FUNCTION public.set_package_anniversary_date(bigint, date, text) IS
  'SuperAdmin-only override of a package instance''s anniversary (next_renewal_date = end of the current hours window). Moves the open renewal period''s period_end in step, recomputes stored hours_used for the instance and its parent, and writes a client_audit_log row (action anniversary_date_override). The window start is not editable. See docs/audit-log/entries/2026-11-05-package-anniversary-date-override.md.';

REVOKE ALL ON FUNCTION public.set_package_anniversary_date(bigint, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_package_anniversary_date(bigint, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_package_anniversary_date(bigint, date, text) TO authenticated;
