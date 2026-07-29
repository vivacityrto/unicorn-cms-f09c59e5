-- Fix 3 broken PostgREST embed relationships + 1 tga_sync_status PL/pgSQL bug,
-- found during the 2026-07-29 full-app Playwright audit (see unicorn-kb PR #59
-- and the audit punch list for full repro details). All 4 confirmed via direct
-- read-only inspection of prod (pg_constraint, information_schema, pg_get_functiondef)
-- before writing this migration; zero orphaned rows found for any of the 3 new FKs
-- (checked via a read-only query joining each column against its target table).
--
-- A. tga_sync_status(): v_last_job is a `record` variable only populated by
--    SELECT INTO when last_sync_job_id IS NOT NULL. When it's null (no sync
--    has ever run, or the referenced job row is gone), v_last_job stays
--    completely unassigned, and the function unconditionally referenced
--    v_last_job.id in the final jsonb_build_object, raising:
--      "record 'v_last_job' is not assigned yet"
--    on /admin/integrations/tga. Fix: build the last_job payload into a
--    variable guarded by whether the SELECT INTO actually found a row
--    (FOUND), instead of touching the record unconditionally. Distinct from
--    the already-known l3_gate_tga_sync_cluster auth.uid()-vs-service-role
--    outage (a separate bug in the sync RPC, not the status RPC fixed here).
--
-- B. compliance_pack_exports.tenant_id had no FK to tenants, so PostgREST's
--    `tenant:tenants(id,name)` embed syntax (used by /admin/compliance-packs)
--    had no relationship to resolve -> 400 "could not find a relationship".
--
-- C. stages.created_by had no FK to public.users, so /manage-stages'
--    `creator:created_by(...)` embed 400s the same way.
--
-- D. stage_release_reviews.reviewer_user_id already has a FK
--    (stage_release_reviews_reviewer_user_id_fkey), but it points to
--    auth.users, not public.users -- the frontend's
--    `reviewer:users!stage_release_reviews_reviewer_user_id_fkey(first_name,last_name,email)`
--    expects to embed public.users (which has those columns; auth.users
--    doesn't), so PostgREST can't resolve "users" via that constraint name.
--    Adding a second FK to public.users(user_uuid) gives PostgREST a
--    resolvable path without touching the existing auth.users FK. Postgres
--    allows multiple FKs on one column; both stay satisfied since
--    public.users.user_uuid mirrors auth.users.id 1:1.

-- === A: tga_sync_status() ===
CREATE OR REPLACE FUNCTION public.tga_sync_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status record;
  v_last_job record;
  v_last_job_json jsonb := null;
BEGIN
  -- Only SuperAdmin can view sync status
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin role required';
  END IF;

  SELECT * INTO v_status FROM public.tga_sync_status WHERE id = 1;

  IF v_status.last_sync_job_id IS NOT NULL THEN
    SELECT * INTO v_last_job FROM public.tga_sync_jobs WHERE id = v_status.last_sync_job_id;
    IF FOUND THEN
      v_last_job_json := jsonb_build_object(
        'id', v_last_job.id,
        'job_type', v_last_job.job_type,
        'status', v_last_job.status,
        'started_at', v_last_job.started_at,
        'completed_at', v_last_job.completed_at,
        'records_fetched', v_last_job.records_fetched,
        'records_inserted', v_last_job.records_inserted,
        'records_updated', v_last_job.records_updated,
        'error_message', v_last_job.error_message
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_syncing', COALESCE(v_status.is_syncing, false),
    'current_job_id', v_status.current_job_id,
    'last_full_sync_at', v_status.last_full_sync_at,
    'last_delta_sync_at', v_status.last_delta_sync_at,
    'last_health_check_at', v_status.last_health_check_at,
    'connection_status', v_status.connection_status,
    'counts', jsonb_build_object(
      'products', COALESCE(v_status.products_count, 0),
      'units', COALESCE(v_status.units_count, 0),
      'organisations', COALESCE(v_status.organisations_count, 0)
    ),
    'last_job', v_last_job_json
  );
END;
$function$;

-- === B: compliance_pack_exports.tenant_id -> tenants.id ===
ALTER TABLE public.compliance_pack_exports
  ADD CONSTRAINT compliance_pack_exports_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

-- === C: stages.created_by -> public.users.user_uuid ===
ALTER TABLE public.stages
  ADD CONSTRAINT stages_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(user_uuid);

-- === D: stage_release_reviews.reviewer_user_id -> public.users.user_uuid (additional FK, alongside the existing auth.users one) ===
ALTER TABLE public.stage_release_reviews
  ADD CONSTRAINT stage_release_reviews_reviewer_user_id_public_users_fkey
  FOREIGN KEY (reviewer_user_id) REFERENCES public.users(user_uuid);
