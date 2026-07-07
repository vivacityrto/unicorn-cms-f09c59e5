-- =====================================================================
-- PR-C: RPCs for bulk_document_jobs / bulk_document_job_items
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.purge_bulk_document_job_items(int);
--   DROP FUNCTION IF EXISTS public.cancel_bulk_document_job(uuid, text);
--   DROP FUNCTION IF EXISTS public.reclaim_stale_bulk_document_locks(int, int);
--   DROP FUNCTION IF EXISTS public.record_bulk_document_item_outcome(bigint, text, text, text, jsonb, text, text);
--   DROP FUNCTION IF EXISTS public.lease_bulk_document_job_items(uuid, text, int);
--   DROP FUNCTION IF EXISTS public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]);
--   DROP FUNCTION IF EXISTS public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[], jsonb);
--   DELETE FROM public.permission_features WHERE feature_key = 'admin.documents.bulk_generate';
--   ALTER TABLE public.bulk_document_jobs DROP CONSTRAINT IF EXISTS bulk_document_jobs_status_check;
--   ALTER TABLE public.bulk_document_jobs ADD CONSTRAINT bulk_document_jobs_status_check
--     CHECK (status IN ('queued','running','paused','completed','cancelled','failed'));
-- =====================================================================

ALTER TABLE public.bulk_document_jobs
  DROP CONSTRAINT IF EXISTS bulk_document_jobs_status_check;

ALTER TABLE public.bulk_document_jobs
  ADD CONSTRAINT bulk_document_jobs_status_check
  CHECK (status IN ('queued','running','paused','completed','cancelled','failed','stalled'));

INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active)
VALUES (
  'admin.documents.bulk_generate',
  'Bulk generate documents',
  'Documents',
  'Documents — Admin',
  'Launch bulk document generation jobs across tenants/packages/stages',
  true
)
ON CONFLICT (feature_key) DO NOTHING;

-- =====================================================================
-- create_bulk_document_job
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_bulk_document_job(
  p_scope         text,
  p_tenant_ids    bigint[] DEFAULT NULL,
  p_package_ids   bigint[] DEFAULT NULL,
  p_stage_ids     bigint[] DEFAULT NULL,
  p_document_ids  bigint[] DEFAULT NULL,
  p_options       jsonb    DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_job_id  uuid;
  v_missing bigint;
  v_total   int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Bulk generation requires Vivacity staff privileges' USING ERRCODE = '42501';
  END IF;
  IF p_scope NOT IN ('all','selected') THEN
    RAISE EXCEPTION 'scope must be all or selected' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_tenant_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing FROM unnest(p_tenant_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = t) LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_package_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing FROM unnest(p_package_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.package_instances x WHERE x.id = t) LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'package_instance_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_stage_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing FROM unnest(p_stage_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.stage_instances x WHERE x.id = t) LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'stage_instance_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_document_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing FROM unnest(p_document_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.id = t) LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'document_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  INSERT INTO public.bulk_document_jobs (
    created_by, scope, tenant_ids, package_ids, stage_ids, document_ids,
    status, provisioning_summary, error_summary,
    total_items, generated_count, skipped_count, failed_count, started_at
  )
  VALUES (
    v_caller, p_scope,
    COALESCE(p_tenant_ids,   ARRAY[]::bigint[]),
    COALESCE(p_package_ids,  ARRAY[]::bigint[]),
    COALESCE(p_stage_ids,    ARRAY[]::bigint[]),
    COALESCE(p_document_ids, ARRAY[]::bigint[]),
    'running', COALESCE(p_options,'{}'::jsonb), '{}'::jsonb,
    0,0,0,0, now()
  )
  RETURNING id INTO v_job_id;

  WITH eligible AS (
    SELECT DISTINCT
      di.tenant_id, di.package_instance_id, di.stageinstance_id,
      di.document_id, di.id AS document_instance_id, di.version_id AS document_version_id
    FROM public.document_instances di
    WHERE di.status IN ('pending','draft','not_generated')
      AND (p_scope = 'all' OR (
        (array_length(p_tenant_ids,1)   IS NULL OR di.tenant_id           = ANY(p_tenant_ids))
        AND (array_length(p_package_ids,1)  IS NULL OR di.package_instance_id = ANY(p_package_ids))
        AND (array_length(p_stage_ids,1)    IS NULL OR di.stageinstance_id    = ANY(p_stage_ids))
        AND (array_length(p_document_ids,1) IS NULL OR di.document_id         = ANY(p_document_ids))
      ))
  ),
  inserted AS (
    INSERT INTO public.bulk_document_job_items (
      job_id, tenant_id, package_instance_id, stageinstance_id,
      document_id, document_instance_id, document_version_id, state, attempt_count
    )
    SELECT v_job_id, e.tenant_id, e.package_instance_id, e.stageinstance_id,
           e.document_id, e.document_instance_id, e.document_version_id, 'pending', 0
    FROM eligible e
    ON CONFLICT (job_id, tenant_id, document_id, stageinstance_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_total FROM inserted;

  UPDATE public.bulk_document_jobs
  SET total_items = v_total,
      status      = CASE WHEN v_total = 0 THEN 'completed' ELSE 'running' END,
      finished_at = CASE WHEN v_total = 0 THEN now() ELSE NULL END
  WHERE id = v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[], jsonb) TO authenticated;

-- =====================================================================
-- preview_bulk_document_job
-- =====================================================================
CREATE OR REPLACE FUNCTION public.preview_bulk_document_job(
  p_scope         text,
  p_tenant_ids    bigint[] DEFAULT NULL,
  p_package_ids   bigint[] DEFAULT NULL,
  p_stage_ids     bigint[] DEFAULT NULL,
  p_document_ids  bigint[] DEFAULT NULL
)
RETURNS TABLE (
  eligible_count int, distinct_tenants int, distinct_packages int,
  distinct_stages int, distinct_documents int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Vivacity staff privileges required' USING ERRCODE = '42501';
  END IF;
  IF p_scope NOT IN ('all','selected') THEN
    RAISE EXCEPTION 'scope must be all or selected' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT DISTINCT di.tenant_id, di.package_instance_id, di.stageinstance_id, di.document_id
    FROM public.document_instances di
    WHERE di.status IN ('pending','draft','not_generated')
      AND (p_scope='all' OR (
        (array_length(p_tenant_ids,1)   IS NULL OR di.tenant_id           = ANY(p_tenant_ids))
        AND (array_length(p_package_ids,1)  IS NULL OR di.package_instance_id = ANY(p_package_ids))
        AND (array_length(p_stage_ids,1)    IS NULL OR di.stageinstance_id    = ANY(p_stage_ids))
        AND (array_length(p_document_ids,1) IS NULL OR di.document_id         = ANY(p_document_ids))
      ))
  )
  SELECT COUNT(*)::int, COUNT(DISTINCT tenant_id)::int, COUNT(DISTINCT package_instance_id)::int,
         COUNT(DISTINCT stageinstance_id)::int, COUNT(DISTINCT document_id)::int
  FROM eligible;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) TO authenticated;

-- =====================================================================
-- lease_bulk_document_job_items (tenant-serialised via advisory locks)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.lease_bulk_document_job_items(
  p_job_id uuid, p_worker_id text, p_limit int DEFAULT 5
)
RETURNS TABLE (
  id bigint, job_id uuid, tenant_id bigint, package_instance_id bigint,
  stageinstance_id bigint, document_id bigint, document_instance_id bigint,
  document_version_id uuid, attempt_count int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_effective_limit int := LEAST(GREATEST(COALESCE(p_limit,5), 1), 5);
  v_taken int := 0;
  v_lock_key bigint;
  r record;
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) = 0 THEN
    RAISE EXCEPTION 'p_worker_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bulk_document_jobs j WHERE j.id = p_job_id AND j.status = 'running'
  ) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT ON (i.tenant_id)
           i.id, i.tenant_id, i.package_instance_id, i.stageinstance_id,
           i.document_id, i.document_instance_id, i.document_version_id, i.attempt_count
    FROM public.bulk_document_job_items i
    WHERE i.job_id = p_job_id AND i.state = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.bulk_document_job_items x
        WHERE x.job_id = p_job_id AND x.tenant_id = i.tenant_id AND x.state = 'leased'
      )
    ORDER BY i.tenant_id, i.id
  LOOP
    v_lock_key := hashtextextended(p_job_id::text || ':' || r.tenant_id::text, 0);
    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.bulk_document_job_items i2 WHERE i2.id = r.id AND i2.state = 'pending'
    ) THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.bulk_document_job_items x
      WHERE x.job_id = p_job_id AND x.tenant_id = r.tenant_id AND x.state = 'leased'
    ) THEN CONTINUE; END IF;

    UPDATE public.bulk_document_job_items i3
    SET state = 'leased', leased_at = now(),
        lease_expires_at = now() + interval '2 minutes',
        worker_id = p_worker_id, attempt_count = i3.attempt_count + 1,
        started_at = COALESCE(i3.started_at, now())
    WHERE i3.id = r.id;

    id := r.id; job_id := p_job_id; tenant_id := r.tenant_id;
    package_instance_id := r.package_instance_id; stageinstance_id := r.stageinstance_id;
    document_id := r.document_id; document_instance_id := r.document_instance_id;
    document_version_id := r.document_version_id; attempt_count := r.attempt_count + 1;
    RETURN NEXT;

    v_taken := v_taken + 1;
    EXIT WHEN v_taken >= v_effective_limit;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.lease_bulk_document_job_items(uuid, text, int) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- record_bulk_document_item_outcome (fenced + idempotent)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_bulk_document_item_outcome(
  p_item_id bigint, p_worker_id text, p_state text,
  p_reason text DEFAULT NULL, p_outcome jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL, p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job_id uuid; v_updated int; v_exists boolean; v_remaining int;
BEGIN
  IF p_state NOT IN ('succeeded','skipped','failed') THEN
    RAISE EXCEPTION 'Invalid outcome state: %', p_state USING ERRCODE = '22023';
  END IF;
  IF p_worker_id IS NULL OR length(p_worker_id) = 0 THEN
    RAISE EXCEPTION 'p_worker_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bulk_document_job_items i
  SET state = p_state,
      outcome = COALESCE(p_outcome,'{}'::jsonb) || jsonb_build_object('reason', p_reason),
      last_error = p_error, last_error_code = p_error_code,
      finished_at = now(), lease_expires_at = NULL, worker_id = NULL
  WHERE i.id = p_item_id AND i.state = 'leased' AND i.worker_id = p_worker_id
  RETURNING i.job_id INTO v_job_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    SELECT true INTO v_exists FROM public.bulk_document_job_items WHERE id = p_item_id;
    IF NOT COALESCE(v_exists, false) THEN
      RAISE EXCEPTION 'bulk_document_job_items % not found', p_item_id USING ERRCODE = '02000';
    END IF;
    RETURN false;
  END IF;

  UPDATE public.bulk_document_jobs j
  SET generated_count = j.generated_count + CASE WHEN p_state='succeeded' THEN 1 ELSE 0 END,
      skipped_count   = j.skipped_count   + CASE WHEN p_state='skipped'   THEN 1 ELSE 0 END,
      failed_count    = j.failed_count    + CASE WHEN p_state='failed'    THEN 1 ELSE 0 END,
      error_summary   = CASE
        WHEN p_state='failed' AND p_error_code IS NOT NULL
          THEN jsonb_set(j.error_summary, ARRAY[p_error_code],
                 to_jsonb(COALESCE((j.error_summary->>p_error_code)::int, 0) + 1), true)
        ELSE j.error_summary END
  WHERE j.id = v_job_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.bulk_document_job_items
  WHERE job_id = v_job_id AND state IN ('pending','leased');

  IF v_remaining = 0 THEN
    UPDATE public.bulk_document_jobs
    SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'completed' END,
        finished_at = COALESCE(finished_at, now())
    WHERE id = v_job_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_bulk_document_item_outcome(bigint, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- reclaim_stale_bulk_document_locks (cron)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reclaim_stale_bulk_document_locks(
  p_max_attempts int DEFAULT 5, p_stall_minutes int DEFAULT 120
)
RETURNS TABLE (reclaimed_items int, stalled_jobs int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_reclaimed int := 0; v_stalled int := 0;
BEGIN
  WITH reset AS (
    UPDATE public.bulk_document_job_items i
    SET state = CASE WHEN i.attempt_count >= p_max_attempts THEN 'failed' ELSE 'pending' END,
        leased_at = NULL, lease_expires_at = NULL, worker_id = NULL,
        last_error = CASE WHEN i.attempt_count >= p_max_attempts
                          THEN 'lease expired; max attempts reached' ELSE i.last_error END,
        last_error_code = CASE WHEN i.attempt_count >= p_max_attempts
                               THEN 'LEASE_EXPIRED_MAX_ATTEMPTS' ELSE i.last_error_code END,
        finished_at = CASE WHEN i.attempt_count >= p_max_attempts THEN now() ELSE i.finished_at END
    WHERE i.state = 'leased'
      AND i.lease_expires_at IS NOT NULL
      AND i.lease_expires_at < now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reclaimed FROM reset;

  WITH stalled AS (
    UPDATE public.bulk_document_jobs j
    SET status = 'stalled'
    WHERE j.status = 'running'
      AND NOT EXISTS (
        SELECT 1 FROM public.bulk_document_job_items i
        WHERE i.job_id = j.id AND i.state IN ('pending','leased')
          AND COALESCE(i.leased_at, i.updated_at, j.started_at)
              > now() - make_interval(mins => p_stall_minutes)
      )
      AND EXISTS (
        SELECT 1 FROM public.bulk_document_job_items i
        WHERE i.job_id = j.id AND i.state IN ('pending','leased')
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_stalled FROM stalled;

  reclaimed_items := v_reclaimed; stalled_jobs := v_stalled;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_stale_bulk_document_locks(int, int) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- cancel_bulk_document_job
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cancel_bulk_document_job(
  p_job_id uuid, p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_caller uuid := auth.uid(); v_creator uuid; v_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT created_by, status INTO v_creator, v_status
  FROM public.bulk_document_jobs WHERE id = p_job_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'bulk_document_jobs % not found', p_job_id USING ERRCODE = '02000';
  END IF;
  IF v_caller <> v_creator AND NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Only the creator or Vivacity staff may cancel a job' USING ERRCODE = '42501';
  END IF;
  IF v_status IN ('completed','cancelled','failed') THEN RETURN false; END IF;

  UPDATE public.bulk_document_jobs
  SET status = 'cancelled',
      finished_at = COALESCE(finished_at, now()),
      error_summary = error_summary || jsonb_build_object(
        'cancel_reason', p_reason, 'cancelled_by', v_caller, 'cancelled_at', now()
      )
  WHERE id = p_job_id;

  UPDATE public.bulk_document_job_items
  SET state = 'cancelled', finished_at = now(),
      last_error = COALESCE(last_error, 'job cancelled'),
      last_error_code = COALESCE(last_error_code, 'JOB_CANCELLED')
  WHERE job_id = p_job_id AND state = 'pending';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_bulk_document_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_bulk_document_job(uuid, text) TO authenticated;

-- =====================================================================
-- purge_bulk_document_job_items (cron cleanup)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.purge_bulk_document_job_items(p_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_deleted int;
BEGIN
  WITH del AS (
    DELETE FROM public.bulk_document_job_items i
    USING public.bulk_document_jobs j
    WHERE i.job_id = j.id
      AND j.finished_at IS NOT NULL
      AND j.finished_at < now() - make_interval(days => GREATEST(p_days, 1))
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_bulk_document_job_items(int) FROM PUBLIC, anon, authenticated;
