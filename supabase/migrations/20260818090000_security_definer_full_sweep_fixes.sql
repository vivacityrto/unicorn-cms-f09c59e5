-- Full SECURITY DEFINER sweep (2026-08-18): 35 functions found via a
-- refined classification query (SECURITY DEFINER, non-trigger, non-boolean,
-- no recognizable internal auth check pattern) narrowed from ~450 advisor
-- flags to ~68 live candidates, then confirmed via two independent
-- investigation agents plus this session's own re-verification of every
-- pg_get_functiondef() body and every real frontend/edge-function caller.
--
-- Two remedies, chosen per function based on whether a legitimate
-- authenticated caller exists:
--
-- 1. REVOKE EXECUTE FROM authenticated, anon -- for functions with NO
--    legitimate direct-authenticated-caller path (dead code, cron-only,
--    internal-helper-only, or already reached exclusively through a
--    service-role edge function). service_role/postgres keep EXECUTE.
--
-- 2. CREATE OR REPLACE FUNCTION adding an internal authorization guard --
--    for functions with a real, confirmed frontend caller that must keep
--    working. Guards reuse the same helpers already used correctly
--    elsewhere in this schema: public.has_tenant_access_safe(tenant_id,
--    user_id) for tenant-scoped data, public.is_vivacity_team_safe(user_id)
--    for internal-staff-only tools, or a plain auth.uid() = p_user_id check
--    for "my X" personal-scope RPCs. No function's argument list or return
--    type changes, so DROP FUNCTION first is not required here.
--
-- See docs/audit-log/entries/2026-08-18-security-definer-full-sweep.md for
-- the full per-function exploit writeup.

-- ============================================================
-- PART 1: REVOKE -- no legitimate authenticated/anon caller found
-- ============================================================

-- Write, no caller found anywhere (frontend or edge functions): any
-- authenticated user could force-overwrite any tenant's org_type
-- classification.
REVOKE EXECUTE ON FUNCTION public.derive_org_type_for_tenant(bigint) FROM authenticated, anon;

-- No caller found; confirms whether an email is registered and returns its
-- auth.users.id -- account-enumeration + UUID-disclosure primitive.
REVOKE EXECUTE ON FUNCTION public.fn_auth_user_id_by_email(text) FROM authenticated, anon;

-- No caller found: cross-tenant membership health score disclosure.
REVOKE EXECUTE ON FUNCTION public.calculate_membership_health(bigint, bigint) FROM authenticated, anon;

-- No caller found: cross-tenant billing/hours-usage disclosure.
REVOKE EXECUTE ON FUNCTION public.compute_membership_usage(bigint) FROM authenticated, anon;

-- No direct caller found -- only called internally (as SECURITY DEFINER, by
-- an owner-privileged caller) from compute_consultant_current_load, which
-- is unaffected by this revoke.
REVOKE EXECUTE ON FUNCTION public.compute_client_weekly_required(bigint) FROM authenticated, anon;

-- No direct caller found -- only called internally from
-- compute_membership_usage, unaffected by this revoke. Discloses
-- parent/child tenant billing relationships.
REVOKE EXECUTE ON FUNCTION public.resolve_billing_tenant_id(bigint) FROM authenticated, anon;

-- Only called via tga-sync edge function's service-role client (confirmed:
-- supabase/functions/tga-sync/index.ts uses SUPABASE_SERVICE_ROLE_KEY).
REVOKE EXECUTE ON FUNCTION public.tga_get_sync_progress(uuid) FROM authenticated, anon;

-- No caller found anywhere -- dead code, same category as the
-- previously-parked schedule-task-reminders/get-organisation-details finds.
REVOKE EXECUTE ON FUNCTION public.fn_check_phase_gate(uuid) FROM authenticated, anon;

-- No caller found anywhere: cross-tenant client/email-matching probe.
REVOKE EXECUTE ON FUNCTION public.fn_match_client_for_event(bigint, text, text[]) FROM authenticated, anon;

-- No caller found anywhere: cross-tenant billable-minutes disclosure.
REVOKE EXECUTE ON FUNCTION public.fn_package_used_minutes(bigint) FROM authenticated, anon;

-- No caller found anywhere.
REVOKE EXECUTE ON FUNCTION public.rpc_get_client_time_rollup(bigint, integer) FROM authenticated, anon;

-- No caller found anywhere.
REVOKE EXECUTE ON FUNCTION public.rpc_get_package_time_rollup(bigint, bigint, integer) FROM authenticated, anon;

-- Only called via vector-search edge function's service-role client, which
-- already gates on Vivacity-internal Ask Viv access before calling this.
REVOKE EXECUTE ON FUNCTION public.search_vector_embeddings(integer, vector, text, text[], integer, double precision) FROM authenticated, anon;

-- Only called via search-unicorn1-users edge function's service-role
-- client, which already gates on FeatureKeys.adminUnicorn1 via requireCaller.
REVOKE EXECUTE ON FUNCTION public.search_unicorn1_users(text, boolean) FROM authenticated, anon;

-- Zero parameters, cron-only (sends real client emails via net.http_post
-- using private.cron_function_jwt()) -- any authenticated user could
-- trigger mass client emailing platform-wide.
REVOKE EXECUTE ON FUNCTION public.audit_send_evidence_reminders() FROM authenticated, anon;

-- Zero parameters, runs live ALTER TABLE ... VALIDATE CONSTRAINT DDL
-- (table scans/locks) -- an ops/admin maintenance tool, not a callable RPC.
REVOKE EXECUTE ON FUNCTION public.run_user_uuid_fk_validation() FROM authenticated, anon;

-- ============================================================
-- PART 2: PATCH -- real caller confirmed, add an internal auth guard
-- ============================================================

-- Caller: src/hooks/usePackageUsage.tsx, usePackageUsageQuery.tsx.
-- p_client_id is a tenants.id (matches the same convention used by
-- compute_membership_usage in this same schema).
CREATE OR REPLACE FUNCTION public.rpc_check_package_thresholds(p_client_id bigint, p_client_package_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_usage jsonb;
  v_used_percent numeric;
  v_threshold integer;
  v_severity text;
  v_title text;
  v_body text;
  v_tenant_id bigint;
  v_package_name text;
  v_alert_id uuid;
  v_created_alerts jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_tenant_access_safe(p_client_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  v_usage := public.rpc_get_package_usage(p_client_id, p_client_package_id);

  IF v_usage->>'error' IS NOT NULL THEN
    RETURN v_usage;
  END IF;

  v_used_percent := (v_usage->>'used_percent')::numeric;

  SELECT pi.tenant_id, p.name
  INTO v_tenant_id, v_package_name
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = p_client_package_id;

  IF v_used_percent >= 100 THEN
    v_threshold := 100;
    v_severity := 'critical';
    v_title := 'Package hours exhausted';
    v_body := format('The %s package has used 100%% of included hours (%s of %s minutes used).',
      v_package_name,
      v_usage->>'used_minutes',
      v_usage->>'included_minutes'
    );
  ELSIF v_used_percent >= 95 THEN
    v_threshold := 95;
    v_severity := 'critical';
    v_title := 'Package hours nearly exhausted';
    v_body := format('The %s package has used %s%% of included hours.',
      v_package_name,
      v_used_percent
    );
  ELSIF v_used_percent >= 80 THEN
    v_threshold := 80;
    v_severity := 'warn';
    v_title := 'Package hours running low';
    v_body := format('The %s package has used %s%% of included hours.',
      v_package_name,
      v_used_percent
    );
  ELSE
    RETURN jsonb_build_object(
      'usage', v_usage,
      'alerts_created', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'usage', v_usage,
    'alerts_created', v_created_alerts,
    'threshold_crossed', v_threshold,
    'severity', v_severity,
    'title', v_title
  );
END;
$function$;

-- Caller: src/hooks/useTenantRtoScope.tsx.
CREATE OR REPLACE FUNCTION public.get_tenant_scope_items(p_tenant_id bigint, p_scope_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, code text, title text, scope_type text, status text, is_superseded boolean, superseded_by text, last_refreshed_at timestamp with time zone, tga_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.code,
    s.title,
    s.scope_type,
    s.status,
    s.is_superseded,
    s.superseded_by,
    s.last_refreshed_at,
    s.tga_data
  FROM public.tenant_rto_scope s
  WHERE s.tenant_id = p_tenant_id
    AND (p_scope_type IS NULL OR s.scope_type = p_scope_type)
  ORDER BY s.code;
END;
$function$;

-- Caller: src/hooks/useTenantRtoScope.tsx.
CREATE OR REPLACE FUNCTION public.get_tenant_scope_sync_status(p_tenant_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _qualification_count INT;
  _unit_count INT;
  _skillset_count INT;
  _course_count INT;
  _last_synced TIMESTAMPTZ;
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE scope_type = 'qualification'),
    COUNT(*) FILTER (WHERE scope_type = 'unit'),
    COUNT(*) FILTER (WHERE scope_type = 'skillset'),
    COUNT(*) FILTER (WHERE scope_type = 'accreditedCourse'),
    MAX(last_refreshed_at)
  INTO _qualification_count, _unit_count, _skillset_count, _course_count, _last_synced
  FROM public.tenant_rto_scope
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'qualifications', COALESCE(_qualification_count, 0),
    'units', COALESCE(_unit_count, 0),
    'skillsets', COALESCE(_skillset_count, 0),
    'courses', COALESCE(_course_count, 0),
    'total', COALESCE(_qualification_count, 0) + COALESCE(_unit_count, 0) + COALESCE(_skillset_count, 0) + COALESCE(_course_count, 0),
    'last_synced_at', _last_synced
  );
END;
$function$;

-- Caller: src/hooks/useUserCapacity.ts. Converted from LANGUAGE sql to
-- plpgsql to allow the guard.
CREATE OR REPLACE FUNCTION public.get_tenant_user_capacity(p_tenant_id bigint)
 RETURNS TABLE(used integer, "limit" integer, is_unlimited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
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

-- Caller: src/hooks/useTenantMemberships.tsx. Converted from LANGUAGE sql
-- to plpgsql to allow the guard.
CREATE OR REPLACE FUNCTION public.get_active_membership_packages(p_tenant_id integer)
 RETURNS TABLE(rto_package_instance_id bigint, cricos_package_instance_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT id FROM package_instances
     WHERE tenant_id = p_tenant_id
       AND is_active = true
       AND billing_type = 'billable'
       AND billing_category = 'membership_rto'
     ORDER BY start_date DESC
     LIMIT 1
    ) AS rto_package_instance_id,
    (SELECT id FROM package_instances
     WHERE tenant_id = p_tenant_id
       AND is_active = true
       AND billing_type = 'billable'
       AND billing_category = 'membership_cricos'
     ORDER BY start_date DESC
     LIMIT 1
    ) AS cricos_package_instance_id;
END;
$function$;

-- Callers: src/components/client/BulkReassignCscDialog.tsx,
-- src/pages/admin/TeamReassignmentPage.tsx -- staff-only consultant
-- reassignment tools. p_user_uuid identifies the CONSULTANT being queried,
-- not the caller, so the guard is staff-only rather than tenant-scoped.
CREATE OR REPLACE FUNCTION public.compute_consultant_current_load(p_user_uuid uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric := 0;
  v_tenant RECORD;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Vivacity staff access required';
  END IF;

  FOR v_tenant IN
    SELECT id FROM tenants
    WHERE assigned_consultant_user_id = p_user_uuid
      AND status = 'active'
  LOOP
    v_total := v_total + compute_client_weekly_required(v_tenant.id);
  END LOOP;

  RETURN ROUND(v_total, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_consultant_weekly_capacity(p_user_uuid uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user RECORD;
  v_days int;
  v_start_time time;
  v_end_time time;
  v_daily_hours numeric;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Vivacity staff access required';
  END IF;

  SELECT working_days, working_hours, archived, disabled, allocation_paused
  INTO v_user
  FROM users
  WHERE user_uuid = p_user_uuid;

  IF v_user IS NULL THEN RETURN 0; END IF;
  IF v_user.archived OR v_user.allocation_paused THEN RETURN 0; END IF;

  v_days := count_selected_work_days(v_user.working_days);
  IF v_days = 0 THEN RETURN 0; END IF;

  IF v_user.working_hours IS NULL THEN RETURN 0; END IF;

  BEGIN
    v_start_time := (v_user.working_hours->>'start')::time;
    v_end_time   := (v_user.working_hours->>'end')::time;
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;

  IF v_end_time <= v_start_time THEN RETURN 0; END IF;

  v_daily_hours := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) / 3600.0;

  RETURN ROUND(v_days * v_daily_hours * 0.80 * 0.90, 2);
END;
$function$;

-- Caller: src/hooks/useExcelDataSources.tsx. p_tenant_id is optional --
-- only enforce access when it's actually supplied.
CREATE OR REPLACE FUNCTION public.validate_document_readiness(p_document_id bigint, p_tenant_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_document record;
  v_missing_fields text[] := '{}';
  v_missing_sources text[] := '{}';
  v_merge_status text := 'pass';
  v_data_sources_status text := 'pass';
  v_source record;
  v_field record;
  v_tenant_value text;
  v_required_tags text[];
BEGIN
  IF p_tenant_id IS NOT NULL AND NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'merge_status', 'fail',
      'missing_fields', ARRAY['Document not found'],
      'data_sources_status', 'fail',
      'missing_tables', ARRAY[]::text[]
    );
  END IF;

  SELECT array_agg(df.tag) INTO v_required_tags
  FROM public.document_fields docf
  JOIN public.dd_fields df ON df.id = docf.field_id
  WHERE docf.document_id = p_document_id
    AND df.is_active = true;

  IF v_required_tags IS NOT NULL AND array_length(v_required_tags, 1) > 0 THEN
    IF p_tenant_id IS NULL THEN
      v_merge_status := 'warn';
    ELSE
      FOR v_field IN
        SELECT unnest(v_required_tags) AS tag
      LOOP
        SELECT vmf.value INTO v_tenant_value
        FROM public.v_tenant_merge_fields vmf
        WHERE vmf.tenant_id = p_tenant_id
          AND vmf.field_tag = v_field.tag
        LIMIT 1;

        IF v_tenant_value IS NULL OR TRIM(v_tenant_value) = '' THEN
          v_missing_fields := array_append(v_missing_fields, v_field.tag);
          v_merge_status := 'fail';
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF LOWER(COALESCE(v_document.format, '')) = 'excel'
     OR LOWER(COALESCE(v_document.format, '')) LIKE '%spreadsheet%' THEN
    FOR v_source IN
      SELECT ds.name, ds.storage_path, ds.source_type
      FROM public.document_data_sources ds
      WHERE ds.document_id = p_document_id
    LOOP
      IF v_source.source_type = 'csv_upload' AND (v_source.storage_path IS NULL OR v_source.storage_path = '') THEN
        v_missing_sources := array_append(v_missing_sources, v_source.name);
        v_data_sources_status := 'fail';
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM public.document_source_mappings dsm
      WHERE dsm.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM public.document_data_sources ds
        WHERE ds.id = dsm.data_source_id
        AND ds.storage_path IS NOT NULL
      )
    ) THEN
      v_data_sources_status := 'fail';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'merge_status', v_merge_status,
    'missing_fields', v_missing_fields,
    'data_sources_status', v_data_sources_status,
    'missing_tables', v_missing_sources
  );
END;
$function$;

-- Caller: src/hooks/useExcelDataSources.tsx. Delegates the per-document
-- guard to validate_document_readiness above.
CREATE OR REPLACE FUNCTION public.validate_release_readiness(p_document_ids bigint[], p_tenant_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_id bigint;
  v_result jsonb;
  v_all_results jsonb := '[]'::jsonb;
  v_pass_count int := 0;
  v_warn_count int := 0;
  v_fail_count int := 0;
  v_doc_name text;
BEGIN
  IF p_tenant_id IS NOT NULL AND NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  FOREACH v_doc_id IN ARRAY p_document_ids
  LOOP
    SELECT name INTO v_doc_name FROM documents WHERE id = v_doc_id;
    v_result := validate_document_readiness(v_doc_id, p_tenant_id);

    v_all_results := v_all_results || jsonb_build_object(
      'document_id', v_doc_id,
      'document_name', v_doc_name,
      'readiness', v_result
    );

    IF v_result->>'merge_status' = 'fail' OR v_result->>'data_sources_status' = 'fail' THEN
      v_fail_count := v_fail_count + 1;
    ELSIF v_result->>'merge_status' = 'warn' OR v_result->>'data_sources_status' = 'warn' THEN
      v_warn_count := v_warn_count + 1;
    ELSE
      v_pass_count := v_pass_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'pass', v_pass_count,
      'warn', v_warn_count,
      'fail', v_fail_count,
      'total', array_length(p_document_ids, 1)
    ),
    'documents', v_all_results,
    'can_release', v_fail_count = 0,
    'requires_override', v_fail_count > 0
  );
END;
$function$;

-- Caller: src/hooks/useMembershipDashboard.tsx, rendered only at
-- /membership-dashboard -- a plain ProtectedRoute (not /client/*) internal
-- staff dashboard, which is why this legitimately dumps every tenant.
-- Zero parameters, so the only available guard is staff-only.
CREATE OR REPLACE FUNCTION public.get_membership_rollups()
 RETURNS TABLE(tenant_id bigint, package_id bigint, next_action_title text, next_action_due_at date, next_action_owner_id uuid, next_action_source text, next_action_reason text, risk_flags jsonb, current_stage_name text, current_stage_status text, progress_percent integer, phase text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_waiting_threshold_days int := 7;
  v_stage_overdue_days int := 14;
begin
  if not public.is_vivacity_team_safe(auth.uid()) then
    raise exception 'Access denied: Vivacity staff access required';
  end if;

  select coalesce(waiting_too_long_days, 7), coalesce(stage_overdue_days, 14)
  into v_waiting_threshold_days, v_stage_overdue_days
  from public.package_type_thresholds
  where package_type = 'membership'
  limit 1;

  return query
  with stage_states as (
    select
      cpss.tenant_id,
      cpss.package_id,
      cpss.id as stage_state_id,
      cpss.status,
      cpss.sort_order,
      cpss.is_required,
      cpss.waiting_at,
      cpss.waiting_reason,
      cpss.blocked_at,
      cpss.blocked_reason,
      cpss.started_at,
      cpss.completed_at,
      ds.title as stage_name,
      ds.stage_type
    from public.client_package_stage_state cpss
    join public.documents_stages ds on ds.id = cpss.stage_id
  ),
  current_stages as (
    select distinct on (ss.tenant_id, ss.package_id)
      ss.tenant_id,
      ss.package_id,
      ss.stage_name,
      ss.status,
      ss.stage_type,
      ss.waiting_at,
      ss.waiting_reason,
      ss.blocked_at,
      ss.blocked_reason,
      ss.started_at
    from stage_states ss
    where ss.status = 'in_progress'
    order by ss.tenant_id, ss.package_id, ss.sort_order
  ),
  progress as (
    select
      ss.tenant_id,
      ss.package_id,
      count(*) filter (where ss.status = 'complete' and ss.is_required) as completed,
      count(*) filter (where ss.is_required) as total
    from stage_states ss
    group by ss.tenant_id, ss.package_id
  ),
  tasks as (
    select
      mt.tenant_id,
      mt.package_id,
      mt.title,
      mt.due_date,
      mt.assigned_to,
      mt.status
    from public.membership_tasks mt
    where mt.status in ('pending', 'in_progress')
    order by mt.due_date asc nulls last
  ),
  first_tasks as (
    select distinct on (t.tenant_id, t.package_id)
      t.tenant_id,
      t.package_id,
      t.title,
      t.due_date,
      t.assigned_to
    from tasks t
    order by t.tenant_id, t.package_id, t.due_date asc nulls last
  ),
  risk_data as (
    select
      me.tenant_id,
      me.package_id,
      jsonb_agg(
        jsonb_build_object(
          'code', rf.code,
          'severity', rf.severity,
          'message', rf.message,
          'source', rf.source
        )
      ) filter (where rf.code is not null) as flags
    from public.membership_entitlements me
    left join lateral (
      select
        'WAITING_TOO_LONG' as code,
        'warn' as severity,
        'Stage waiting for ' || extract(day from now() - cs.waiting_at)::int || ' days: ' || coalesce(cs.waiting_reason, 'No reason') as message,
        'stage' as source
      from current_stages cs
      where cs.tenant_id = me.tenant_id
        and cs.package_id = me.package_id
        and cs.status = 'in_progress'
        and cs.waiting_at is not null
        and now() - cs.waiting_at > (v_waiting_threshold_days || ' days')::interval

      union all

      select
        'STAGE_OVERDUE' as code,
        'critical' as severity,
        'Stage "' || cs.stage_name || '" overdue by ' || (extract(day from now() - cs.started_at)::int - v_stage_overdue_days) || ' days' as message,
        'stage' as source
      from current_stages cs
      where cs.tenant_id = me.tenant_id
        and cs.package_id = me.package_id
        and cs.status = 'in_progress'
        and cs.started_at is not null
        and now() - cs.started_at > (v_stage_overdue_days || ' days')::interval

      union all

      select
        'MISSING_CSC' as code,
        'warn' as severity,
        'No CSC assigned' as message,
        'system' as source
      where me.csc_user_id is null

      union all

      select
        'OVERDUE_TASKS' as code,
        'critical' as severity,
        count(*)::text || ' overdue task(s)' as message,
        'task' as source
      from public.membership_tasks mt
      where mt.tenant_id = me.tenant_id
        and mt.package_id = me.package_id
        and mt.status in ('pending', 'in_progress')
        and mt.due_date < current_date
      having count(*) > 0
    ) rf on true
    group by me.tenant_id, me.package_id
  )
  select
    me.tenant_id,
    me.package_id,
    coalesce(ft.title, 'Review status') as next_action_title,
    ft.due_date as next_action_due_at,
    ft.assigned_to as next_action_owner_id,
    case when ft.title is not null then 'task' else 'system' end as next_action_source,
    case when ft.title is null then 'No open tasks' else '' end as next_action_reason,
    coalesce(rd.flags, '[]'::jsonb) as risk_flags,
    cs.stage_name as current_stage_name,
    cs.status as current_stage_status,
    case
      when p.total > 0 then (p.completed * 100 / p.total)::int
      else 0
    end as progress_percent,
    case
      when cs.stage_type in ('delivery', 'review') then 'Delivery'
      when cs.stage_type = 'submission' then 'Submission'
      when cs.stage_type = 'waiting' then 'External'
      when cs.stage_type = 'closeout' then 'Closeout'
      when cs.stage_type in ('entitlement', 'recurring') then 'Ongoing'
      when cs.stage_type = 'setup' then 'Setup'
      else 'Setup'
    end as phase
  from public.membership_entitlements me
  left join current_stages cs on cs.tenant_id = me.tenant_id and cs.package_id = me.package_id
  left join progress p on p.tenant_id = me.tenant_id and p.package_id = me.package_id
  left join first_tasks ft on ft.tenant_id = me.tenant_id and ft.package_id = me.package_id
  left join risk_data rd on rd.tenant_id = me.tenant_id and rd.package_id = me.package_id;
end;
$function$;

-- Caller: src/hooks/useMembershipDashboard.tsx, same staff-only dashboard
-- as get_membership_rollups above. Converted from LANGUAGE sql to plpgsql
-- to allow the guard.
CREATE OR REPLACE FUNCTION public.get_stage_progress()
 RETURNS TABLE(tenant_id bigint, package_id bigint, total_stages integer, completed_count integer, active_count integer, blocked_count integer, percent_complete numeric, current_stage_name text, current_stage_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Vivacity staff access required';
  END IF;

  RETURN QUERY
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    COUNT(*)::int AS total_stages,
    COUNT(*) FILTER (WHERE cpss.status = 'complete')::int AS completed_count,
    COUNT(*) FILTER (WHERE cpss.status IN ('in_progress', 'active'))::int AS active_count,
    COUNT(*) FILTER (WHERE cpss.status = 'blocked')::int AS blocked_count,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE cpss.status = 'complete')::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0
    END AS percent_complete,
    (
      SELECT ds.title
      FROM public.client_package_stage_state cs
      JOIN public.documents_stages ds ON ds.id = cs.stage_id
      WHERE cs.tenant_id = cpss.tenant_id
        AND cs.package_id = cpss.package_id
        AND cs.status NOT IN ('complete', 'skipped')
      ORDER BY cs.sort_order
      LIMIT 1
    ) AS current_stage_name,
    (
      SELECT cs.status
      FROM public.client_package_stage_state cs
      WHERE cs.tenant_id = cpss.tenant_id
        AND cs.package_id = cpss.package_id
        AND cs.status NOT IN ('complete', 'skipped')
      ORDER BY cs.sort_order
      LIMIT 1
    ) AS current_stage_status
  FROM public.client_package_stage_state cpss
  GROUP BY cpss.tenant_id, cpss.package_id;
END;
$function$;

-- Caller: src/hooks/useMeetingAttendance.tsx. p_meeting_id has no tenant
-- param of its own, so resolve the meeting's tenant first.
CREATE OR REPLACE FUNCTION public.calculate_quorum(p_meeting_id uuid)
 RETURNS TABLE(quorum_required integer, quorum_present integer, quorum_met boolean, owner_present boolean, visionary_present boolean, integrator_present boolean, core_team_present integer, core_team_required integer, issues text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_type TEXT;
  v_meeting_tenant_id bigint;
  v_total_invited INTEGER;
  v_total_present INTEGER;
  v_owner_present BOOLEAN := false;
  v_visionary_present BOOLEAN := false;
  v_integrator_present BOOLEAN := false;
  v_core_present INTEGER := 0;
  v_core_required INTEGER := 0;
  v_issues TEXT[] := '{}';
  v_quorum_met BOOLEAN := false;
  v_required_present NUMERIC;
BEGIN
  SELECT meeting_type::TEXT, tenant_id INTO v_meeting_type, v_meeting_tenant_id
  FROM eos_meetings WHERE id = p_meeting_id;

  IF v_meeting_tenant_id IS NULL OR NOT public.has_tenant_access_safe(v_meeting_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this meeting''s tenant';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE attendance_status IN ('attended', 'late')),
    COALESCE(bool_or(role_in_meeting = 'owner' AND attendance_status IN ('attended', 'late')), false),
    COALESCE(bool_or(role_in_meeting = 'visionary' AND attendance_status IN ('attended', 'late')), false),
    COALESCE(bool_or(role_in_meeting = 'integrator' AND attendance_status IN ('attended', 'late')), false),
    COUNT(*) FILTER (WHERE role_in_meeting = 'core_team' AND attendance_status IN ('attended', 'late')),
    COUNT(*) FILTER (WHERE role_in_meeting = 'core_team')
  INTO v_total_invited, v_total_present, v_owner_present, v_visionary_present, v_integrator_present, v_core_present, v_core_required
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id;

  IF NOT v_owner_present THEN
    v_issues := array_append(v_issues, 'Owner not present — Facilitator controls the meeting');
  END IF;

  IF v_meeting_type = 'L10' THEN
    v_required_present := 1;
    v_quorum_met := v_total_present >= v_required_present;
    IF NOT v_quorum_met THEN
      v_issues := array_append(v_issues, 'At least 1 attendee must be present');
    END IF;

  ELSIF v_meeting_type = 'Same_Page' THEN
    IF NOT v_visionary_present THEN
      v_issues := array_append(v_issues, 'Visionary must be present');
    END IF;
    IF NOT v_integrator_present THEN
      v_issues := array_append(v_issues, 'Integrator must be present');
    END IF;
    v_quorum_met := v_visionary_present AND v_integrator_present;

  ELSIF v_meeting_type = 'Quarterly' THEN
    IF v_core_required > 0 THEN
      v_required_present := CEIL(v_core_required * 0.8);
      IF v_core_present < v_required_present THEN
        v_issues := array_append(v_issues, format('At least %s of %s core team members must be present', v_required_present::INTEGER, v_core_required));
      END IF;
      v_quorum_met := v_core_present >= v_required_present;
    ELSE
      v_quorum_met := v_total_present >= 1;
    END IF;

  ELSIF v_meeting_type = 'Annual' THEN
    IF NOT v_visionary_present THEN
      v_issues := array_append(v_issues, 'Visionary must be present');
    END IF;
    IF NOT v_integrator_present THEN
      v_issues := array_append(v_issues, 'Integrator must be present');
    END IF;
    v_quorum_met := v_visionary_present AND v_integrator_present;

  ELSE
    v_quorum_met := v_total_present >= 1;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_required_present::INTEGER, 1),
    v_total_present,
    v_quorum_met,
    v_owner_present,
    v_visionary_present,
    v_integrator_present,
    v_core_present,
    v_core_required,
    v_issues;
END;
$function$;

-- Caller: src/hooks/useRockAnalysis.tsx. Writes rock_outcomes for the
-- tenant, so this needs the same tenant-access check as any other
-- tenant-scoped write.
CREATE OR REPLACE FUNCTION public.generate_rock_outcomes(p_tenant_id bigint, p_quarter_number integer, p_quarter_year integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count INTEGER := 0;
    v_rock RECORD;
    v_outcome_type VARCHAR(30);
    v_quarter_end DATE;
BEGIN
    IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
      RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
    END IF;

    v_quarter_end := CASE p_quarter_number
        WHEN 1 THEN make_date(p_quarter_year, 3, 31)
        WHEN 2 THEN make_date(p_quarter_year, 6, 30)
        WHEN 3 THEN make_date(p_quarter_year, 9, 30)
        WHEN 4 THEN make_date(p_quarter_year, 12, 31)
    END;

    FOR v_rock IN
        SELECT
            r.id,
            r.title,
            r.seat_id,
            r.owner_id,
            r.status,
            r.completed_date,
            r.due_date
        FROM eos_rocks r
        WHERE r.tenant_id = p_tenant_id
          AND r.quarter_number = p_quarter_number
          AND r.quarter_year = p_quarter_year
          AND NOT EXISTS (
              SELECT 1 FROM rock_outcomes ro
              WHERE ro.rock_id = r.id
                AND ro.quarter_year = p_quarter_year
                AND ro.quarter_number = p_quarter_number
          )
    LOOP
        IF v_rock.status = 'Complete' THEN
            IF v_rock.completed_date IS NOT NULL AND v_rock.completed_date::date <= v_quarter_end THEN
                v_outcome_type := 'completed_on_time';
            ELSE
                v_outcome_type := 'completed_late';
            END IF;
        ELSIF v_rock.status IN ('Off_Track', 'At_Risk', 'On_Track', 'Not_Started') THEN
            IF EXISTS (
                SELECT 1 FROM eos_rocks nr
                WHERE nr.tenant_id = p_tenant_id
                  AND nr.title = v_rock.title
                  AND (
                      (nr.quarter_year = p_quarter_year AND nr.quarter_number > p_quarter_number)
                      OR nr.quarter_year > p_quarter_year
                  )
            ) THEN
                v_outcome_type := 'rolled_forward';
            ELSE
                v_outcome_type := 'dropped';
            END IF;
        ELSE
            v_outcome_type := 'dropped';
        END IF;

        INSERT INTO rock_outcomes (
            tenant_id,
            rock_id,
            seat_id,
            owner_id,
            quarter_number,
            quarter_year,
            outcome_type,
            rock_title,
            completed_at,
            due_date
        ) VALUES (
            p_tenant_id,
            v_rock.id,
            v_rock.seat_id,
            v_rock.owner_id,
            p_quarter_number,
            p_quarter_year,
            v_outcome_type,
            v_rock.title,
            v_rock.completed_date,
            v_rock.due_date
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

-- Caller: src/hooks/useStageReleases.tsx. Prevents griefing another
-- tenant's rate-limit counter.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_tenant_id integer, p_action_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_window_start timestamptz;
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  v_window_start := date_trunc('hour', now());

  INSERT INTO public.rate_limit_tracker (tenant_id, action_type, window_start, count)
  VALUES (p_tenant_id, p_action_type, v_window_start, 1)
  ON CONFLICT (tenant_id, action_type, window_start)
  DO UPDATE SET count = public.rate_limit_tracker.count + 1;
END;
$function$;

-- Caller: src/components/client/TimelineExportDialog.tsx.
CREATE OR REPLACE FUNCTION public.rpc_export_client_timeline(p_tenant_id bigint, p_client_id bigint, p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_event_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, event_type text, title text, body text, metadata jsonb, occurred_at timestamp with time zone, created_by uuid, creator_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.event_type,
    e.title,
    e.body,
    e.metadata,
    e.occurred_at,
    e.created_by,
    COALESCE(u.first_name || ' ' || u.last_name, 'System') as creator_name
  FROM public.client_timeline_events e
  LEFT JOIN public.users u ON u.user_uuid = e.created_by
  WHERE e.tenant_id = p_tenant_id
    AND e.client_id = p_client_id::text
    AND (p_from_date IS NULL OR e.occurred_at >= p_from_date)
    AND (p_to_date IS NULL OR e.occurred_at <= p_to_date)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
  ORDER BY e.occurred_at DESC;
END;
$function$;

-- Caller: src/components/communications/BulkMessageDialog.tsx, rendered
-- only at the Team Communications page (staff-only, non-/client/* route).
CREATE OR REPLACE FUNCTION public.fn_preview_broadcast_recipients(p_target_mode text, p_package_type text DEFAULT NULL::text, p_include_roles text[] DEFAULT ARRAY['parent'::text])
 RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_vivacity_team_safe(auth.uid()) then
    raise exception 'Access denied: Vivacity staff access required';
  end if;

  return query
  select distinct on (tu.user_id)
    t.id as tenant_id,
    tu.user_id,
    t.name as tenant_name
  from tenants t
  join tenant_users tu on tu.tenant_id = t.id
  where
    t.id != 6372
    and t.status = 'active'
    and tu.role = any(p_include_roles)
    and tu.access_scope = 'full'
    and (
      case p_target_mode
        when 'everyone' then true
        when 'members' then exists (
          select 1 from package_instances pi
          join packages p on p.id = pi.package_id
          where pi.tenant_id = t.id
            and pi.is_complete = false
            and p.package_type = 'membership'
        )
        when 'tier' then exists (
          select 1 from package_instances pi
          join packages p on p.id = pi.package_id
          where pi.tenant_id = t.id
            and pi.is_complete = false
            and p.package_type = 'membership'
            and lower(p.name) like
              case lower(coalesce(p_package_type, ''))
                when 'diamond'  then 'm-d%'
                when 'gold'     then 'm-g%'
                when 'ruby'     then 'm-r%'
                when 'sapphire' then 'm-sa%'
                when 'amethyst' then 'm-am%'
                else '__no_match__'
              end
        )
        when 'package_type' then exists (
          select 1 from package_instances pi
          join packages p on p.id = pi.package_id
          where pi.tenant_id = t.id
            and pi.is_complete = false
            and p.package_type = p_package_type
        )
        else false
      end
    )
  order by tu.user_id, t.id;
end;
$function$;

-- Caller: src/contexts/ClientPreviewContext.tsx. Converted from LANGUAGE
-- sql to plpgsql to allow the guard.
CREATE OR REPLACE FUNCTION public.list_acting_user_options(p_tenant_id bigint)
 RETURNS TABLE(user_uuid uuid, full_name text, email text, relationship_role text, is_default boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_tenant_access_safe(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to this tenant';
  END IF;

  RETURN QUERY
  SELECT
    u.user_uuid,
    COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
             u.email, 'Unnamed user') AS full_name,
    COALESCE(u.email, '') AS email,
    COALESCE(tu.relationship_role::text, 'user') AS relationship_role,
    (tu.primary_contact = true OR tu.relationship_role::text = 'primary_contact') AS is_default
  FROM public.tenant_users tu
  JOIN public.users u ON u.user_uuid = tu.user_id
  JOIN auth.users au ON au.id = u.user_uuid
  WHERE tu.tenant_id = p_tenant_id
    AND u.archived IS NOT TRUE
    AND au.email_confirmed_at IS NOT NULL
    AND au.deleted_at IS NULL
    AND (au.banned_until IS NULL OR au.banned_until < now())
  ORDER BY is_default DESC, full_name ASC;
END;
$function$;

-- Caller: src/hooks/useTeamInbox.ts, which always passes p_user_id ==
-- the caller's own auth id. Converted from LANGUAGE sql to plpgsql to
-- allow the guard. Staff override kept in case any internal tool needs to
-- view a colleague's inbox items on their behalf.
CREATE OR REPLACE FUNCTION public.rpc_get_inbox_items(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_item_type text DEFAULT NULL::text, p_tenant_id integer DEFAULT NULL::integer, p_action_required boolean DEFAULT NULL::boolean)
 RETURNS TABLE(inbox_id uuid, tenant_id bigint, user_id uuid, item_type text, item_source text, source_id text, title text, preview text, status text, due_at timestamp with time zone, priority integer, unread boolean, action_required boolean, related_entity text, related_entity_id text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you can only view your own inbox items';
  END IF;

  RETURN QUERY
  SELECT
    t.id                                              AS inbox_id,
    t.tenant_id                                       AS tenant_id,
    t.assigned_to_user_id                             AS user_id,
    'ticket'::text                                    AS item_type,
    'email_tickets'::text                             AS item_source,
    t.id::text                                        AS source_id,
    t.subject                                         AS title,
    (COALESCE(t.sender_name,'') || ' <' || COALESCE(t.sender_email,'') || '>') AS preview,
    t.status                                          AS status,
    t.response_due_at                                 AS due_at,
    CASE WHEN t.urgent THEN 1 ELSE 2 END              AS priority,
    true                                              AS unread,
    (COALESCE(t.urgent,false) OR COALESCE(t.sla_breached,false)) AS action_required,
    'email_ticket'::text                              AS related_entity,
    t.id::text                                        AS related_entity_id,
    t.received_at                                     AS created_at,
    t.updated_at                                      AS updated_at
  FROM public.email_tickets t
  WHERE t.assigned_to_user_id = p_user_id
    AND t.status IS DISTINCT FROM 'closed'
    AND (p_item_type IS NULL OR p_item_type = 'ticket')
    AND (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id::bigint)
    AND (
      p_action_required IS NULL
      OR p_action_required = false
      OR (COALESCE(t.urgent,false) OR COALESCE(t.sla_breached,false))
    )
  ORDER BY (CASE WHEN t.urgent THEN 1 ELSE 2 END) ASC,
           t.response_due_at ASC NULLS LAST
  LIMIT  GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

-- Caller: src/hooks/useMyWork.tsx, which always passes p_user_id == the
-- caller's own auth id.
CREATE OR REPLACE FUNCTION public.rpc_get_my_action_items(p_user_id uuid, p_status_filter text DEFAULT 'open'::text, p_include_overdue boolean DEFAULT true)
 RETURNS TABLE(action_item_id uuid, client_id text, client_name text, tenant_id bigint, title text, description text, due_date date, priority text, status text, source text, related_entity_type text, related_entity_id text, created_at timestamp with time zone, is_overdue boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you can only view your own action items';
  END IF;

  RETURN QUERY
  SELECT
    ai.id AS action_item_id,
    ai.client_id,
    COALESCE(t.name, 'Unknown Client') AS client_name,
    ai.tenant_id::bigint,
    ai.title,
    ai.description,
    ai.due_date,
    ai.priority,
    ai.status,
    ai.source,
    ai.related_entity_type,
    ai.related_entity_id,
    ai.created_at,
    CASE
      WHEN ai.due_date IS NOT NULL
        AND ai.due_date < CURRENT_DATE
        AND ai.status NOT IN ('done', 'cancelled')
      THEN true
      ELSE false
    END AS is_overdue
  FROM public.client_action_items ai
  LEFT JOIN public.tenants t ON t.id = ai.tenant_id
  WHERE ai.owner_user_id = p_user_id
    AND (
      CASE
        WHEN p_status_filter = 'all' THEN true
        WHEN p_status_filter = 'open' THEN ai.status IN ('open', 'in_progress', 'blocked')
        WHEN p_status_filter = 'overdue' THEN
          ai.due_date < CURRENT_DATE
          AND ai.status NOT IN ('done', 'cancelled')
        ELSE ai.status = p_status_filter
      END
    )
  ORDER BY
    CASE WHEN ai.due_date < CURRENT_DATE AND ai.status NOT IN ('done', 'cancelled') THEN 0 ELSE 1 END,
    ai.due_date NULLS LAST,
    CASE ai.priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END,
    ai.created_at DESC;
END;
$function$;
