-- Security remediation, 2026-09-11: four cross-tenant isolation findings surfaced
-- during TOM P0.1 evidence work (PR #1182), independently re-verified live before
-- fixing. See docs/audit-log/entries/2026-09-11-tenant-package-security-fixes.md.

-- 1. v_client_package_dashboard: no tenant predicate on its final SELECT, granted
--    SELECT to anon AND authenticated -- unauthenticated cross-tenant read.
--    The only legitimate consumer (get_client_package_dashboard RPC via
--    use-client-package-dashboard.ts) already enforces app.user_can_access_tenant()
--    and never queries the raw view. Confirmed zero frontend .from() callers.
--    Safe to revoke direct access entirely.
REVOKE SELECT ON public.v_client_package_dashboard FROM anon, authenticated;

-- 2. v_package_burndown: same no-tenant-filter gap, granted SELECT to authenticated,
--    and IS called directly by TenantTimeTrackerBar.tsx with only a client-supplied
--    .eq('tenant_id', ...) filter -- no real security since a caller can omit it.
--    Add a safe RPC wrapper mirroring get_client_package_dashboard's pattern;
--    the frontend caller is migrated to this RPC in the same PR as this migration.
CREATE OR REPLACE FUNCTION public.get_package_burndown(
  p_tenant_id bigint,
  p_package_instance_ids bigint[] DEFAULT NULL
)
RETURNS TABLE(
  tenant_id bigint,
  package_instance_id bigint,
  included_minutes bigint,
  used_minutes bigint,
  remaining_minutes bigint,
  percent_used numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
  SELECT
    pi.tenant_id,
    pi.id AS package_instance_id,
    COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0) AS included_minutes,
    COALESCE(ts.used_minutes, 0::bigint) AS used_minutes,
    COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0) - COALESCE(ts.used_minutes, 0::bigint) AS remaining_minutes,
    CASE
      WHEN (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0)) = 0 THEN 0::numeric
      ELSE round(COALESCE(ts.used_minutes, 0::bigint)::numeric / (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0))::numeric * 100::numeric, 1)
    END AS percent_used
  FROM public.package_instances pi
    LEFT JOIN LATERAL (
      SELECT prp.carried_in_minutes
      FROM public.package_renewal_periods prp
      WHERE prp.package_instance_id = pi.id AND prp.closed_at IS NULL
      ORDER BY prp.period_number DESC
      LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE((
        SELECT sum(tea.allocated_minutes)
        FROM public.time_entry_allocations tea
        JOIN public.time_entries te ON te.id = tea.time_entry_id
        WHERE tea.package_instance_id = pi.id AND te.is_billable = true AND te.work_type <> 'carry_over'
          AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
          AND te.start_at < COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
      ), 0::bigint) + COALESCE((
        SELECT sum(te.duration_minutes)
        FROM public.time_entries te
        WHERE te.package_instance_id = pi.id AND te.is_billable = true AND te.work_type <> 'carry_over'
          AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
          AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
          AND te.start_at < COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
      ), 0::bigint) AS used_minutes
    ) ts ON true
  WHERE pi.is_complete = false
    AND pi.tenant_id = p_tenant_id
    AND app.user_can_access_tenant(p_tenant_id)
    AND (p_package_instance_ids IS NULL OR pi.id = ANY (p_package_instance_ids));
$function$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default -- revoke that before
-- granting narrowly, otherwise anon inherits access through PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_package_burndown(bigint, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_package_burndown(bigint, bigint[]) TO authenticated;

REVOKE SELECT ON public.v_package_burndown FROM authenticated;

-- 3. start_client_package: SECURITY DEFINER, EXECUTE granted to authenticated,
--    zero authorization check in the body -- any authenticated caller could start
--    a package for any tenant_id. Adds the same app.user_can_access_tenant() check
--    used elsewhere; body otherwise byte-identical to the live definition.
CREATE OR REPLACE FUNCTION public.start_client_package(p_tenant_id bigint, p_package_id bigint, p_assigned_csc_user_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_package_instance_id bigint;
  v_included_minutes integer;
  v_pkg_type text;
  v_pkg_name text;
  v_pkg_slug text;
  v_stream text;
  v_existing_name text;
  v_existing_stream text;
  v_billing_type text;
  v_billing_category text;
  v_stage RECORD;
  v_stage_instance_id bigint;
BEGIN
  IF NOT app.user_can_access_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.skip_stage_seed', 'on', true);

  SELECT COALESCE(total_hours, 0) * 60, package_type, name, slug
    INTO v_included_minutes, v_pkg_type, v_pkg_name, v_pkg_slug
    FROM public.packages
   WHERE id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found', p_package_id;
  END IF;

  v_stream := public.fn_package_stream(p_package_id);

  IF v_pkg_name LIKE 'KS%' OR v_pkg_name LIKE 'KickStart%' OR v_pkg_slug LIKE '%ks%' THEN
    v_billing_type := 'non_billable'; v_billing_category := NULL;
  ELSIF v_pkg_name LIKE 'M-GTO%' THEN
    v_billing_type := 'billable'; v_billing_category := 'other';
  ELSIF v_pkg_name LIKE 'M-%' AND (
      v_pkg_slug LIKE '%-rc' OR v_pkg_slug LIKE '%-gc'
      OR v_pkg_slug LIKE '%-dc' OR v_pkg_slug LIKE '%-sac'
      OR v_pkg_slug LIKE '%-bc'
  ) THEN
    v_billing_type := 'billable'; v_billing_category := 'membership_cricos';
  ELSIF v_pkg_name LIKE 'M-%' THEN
    v_billing_type := 'billable'; v_billing_category := 'membership_rto';
  ELSE
    v_billing_type := 'billable'; v_billing_category := 'other';
  END IF;

  SELECT p.name, public.fn_package_stream(p.id)
    INTO v_existing_name, v_existing_stream
    FROM public.package_instances pi
    JOIN public.packages p ON p.id = pi.package_id
   WHERE pi.tenant_id = p_tenant_id
     AND pi.is_complete = false
     AND pi.parent_instance_id IS NULL
     AND COALESCE(pi.membership_state, 'active') <> 'cancelled'
     AND p.package_type = v_pkg_type
     AND (
           public.fn_package_stream(p.id) = 'generic'
        OR v_stream = 'generic'
        OR public.fn_package_stream(p.id) = v_stream
     )
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'DUPLICATE_PACKAGE_TYPE: tenant % already has an active % (% stream) package: %. Cancel or complete it first.',
      p_tenant_id, v_pkg_type, v_existing_stream, v_existing_name
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.package_instances (
    tenant_id, package_id, start_date, is_complete, is_active, clo_id,
    manager_id, included_minutes, billing_type, billing_category
  ) VALUES (
    p_tenant_id, p_package_id, CURRENT_DATE, false, true, 0,
    p_assigned_csc_user_id, v_included_minutes, v_billing_type, v_billing_category
  )
  RETURNING id INTO v_package_instance_id;

  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM public.package_stages ps
     WHERE ps.package_id = p_package_id
     ORDER BY ps.sort_order
  LOOP
    INSERT INTO public.stage_instances (
      stage_id, packageinstance_id, stage_sortorder, status, is_recurring
    ) VALUES (
      v_stage.stage_id::integer, v_package_instance_id, v_stage.sort_order,
      'not_started', v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'not_started'
      FROM public.staff_tasks st
     WHERE st.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id, v_stage_instance_id, 0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day')
                ELSE NULL
           END
      FROM public.client_tasks ct
     WHERE ct.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
      FROM public.emails e
     WHERE e.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
      FROM public.documents d
     WHERE d.stage = v_stage.stage_id::integer
        OR EXISTS (
          SELECT 1 FROM public.document_stage_links dsl
          WHERE dsl.document_id = d.id
            AND dsl.stage_id = v_stage.stage_id::integer
        );
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, auth.uid(), 'package_started', 'package_instances',
    v_package_instance_id::text,
    jsonb_build_object(
      'package_id', p_package_id,
      'assigned_csc_user_id', p_assigned_csc_user_id,
      'stream', v_stream,
      'billing_type', v_billing_type,
      'billing_category', v_billing_category
    )
  );

  RETURN v_package_instance_id;
END;
$function$;

-- 4. transition_membership_state: same SECURITY DEFINER gap -- any authenticated
--    caller could force any package instance's membership state. Adds the same
--    check, right after the tenant_id is looked up and before the mutation.
CREATE OR REPLACE FUNCTION public.transition_membership_state(p_instance_id bigint, p_new_state text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_state text;
  v_tenant_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dd_membership_state WHERE value = p_new_state) THEN
    RAISE EXCEPTION 'Invalid membership state: %', p_new_state;
  END IF;

  SELECT membership_state, tenant_id INTO v_old_state, v_tenant_id
  FROM package_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package instance % not found', p_instance_id;
  END IF;

  IF NOT app.user_can_access_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant' USING ERRCODE = '42501';
  END IF;

  UPDATE package_instances
  SET membership_state = p_new_state,
      is_complete = (p_new_state IN ('complete', 'cancelled')),
      is_active = (p_new_state NOT IN ('complete', 'cancelled')),
      end_date = CASE WHEN p_new_state IN ('complete', 'cancelled') THEN COALESCE(end_date, now()) ELSE end_date END
  WHERE id = p_instance_id;

  INSERT INTO package_instance_state_log (package_instance_id, old_state, new_state, reason, changed_by)
  VALUES (p_instance_id, v_old_state, p_new_state, p_reason, auth.uid());

  IF p_new_state = 'warning' THEN
    UPDATE tenants SET status = 'warning' WHERE id = v_tenant_id;
  END IF;
END;
$function$;

-- 5. get_tenant_user_capacity: caller-supplied p_caller_id overrode auth.uid() in its
--    own access check -- a genuine identity-spoofing bypass. No frontend caller ever
--    passes it (confirmed: useUserCapacity.ts only ever passes p_tenant_id), so the
--    parameter is dropped entirely rather than just defaulted away. Changing arity
--    requires DROP FUNCTION first -- CREATE OR REPLACE would create a second overload.
DROP FUNCTION IF EXISTS public.get_tenant_user_capacity(bigint, uuid);

CREATE FUNCTION public.get_tenant_user_capacity(p_tenant_id bigint)
 RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, v_caller) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  WITH tu AS (
    SELECT COUNT(*)::int AS n
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND (relationship_role IS NULL
           OR relationship_role NOT IN ('primary_contact','secondary_contact'))
  ),
  inv AS (
    SELECT COUNT(*)::int AS n
    FROM public.user_invitations
    WHERE tenant_id = p_tenant_id
      AND status IN ('pending','sent')
      AND expires_at > now()
      AND (relationship_role IS NULL
           OR relationship_role NOT IN ('primary_contact','secondary_contact'))
  ),
  pkg AS (
    SELECT
      MAX(p.user_limit)                       AS max_limit,
      bool_or(p.user_limit IS NULL)           AS has_unlimited,
      bool_or(pi.is_unlimited_override)       AS has_override,
      COUNT(*)                                AS active_count
    FROM public.package_instances pi
    JOIN public.packages p ON p.id = pi.package_id
    WHERE pi.tenant_id          = p_tenant_id
      AND pi.is_complete        = false
      AND pi.parent_instance_id IS NULL
  )
  SELECT
    (tu.n + inv.n)::int AS used,
    CASE
      WHEN pkg.active_count = 0 THEN 5
      WHEN pkg.has_override     THEN NULL
      WHEN pkg.has_unlimited    THEN NULL
      ELSE pkg.max_limit
    END::int AS "limit",
    CASE
      WHEN pkg.active_count = 0 THEN false
      ELSE COALESCE(pkg.has_override, false) OR COALESCE(pkg.has_unlimited, false)
    END AS is_unlimited
  FROM tu, inv, pkg;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_user_capacity(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_user_capacity(bigint) TO authenticated;
