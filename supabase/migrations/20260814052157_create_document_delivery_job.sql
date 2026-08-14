-- New job-creation RPC for the "Deliver to Clients" flow, so it routes
-- through the same bulk_document_jobs/bulk_document_job_items queue and
-- worker as Bulk Generate (getting SharePoint provisioning/liveness and
-- package-instance stage repair "for free"), instead of a bare client-side
-- for-loop.
--
-- Deliberately looser eligibility than create_bulk_document_job/
-- create_targeted_bulk_document_job: Deliver to Clients pushes an
-- already-published document version to clients who already have a
-- document_instance for it, regardless of whether their package/stage is
-- still in-progress or already complete — matching
-- GovernanceDeliveryDialog.tsx's current behavior (it never filters on
-- package_instance.is_active/is_complete, only on tenant status and
-- governance-folder presence).
--
-- Unlike the bulk-generate RPCs, this pins document_version_id, snapshot_id,
-- and allow_incomplete per tenant from what the caller (the dialog, after
-- computing/acknowledging tailoring + TGA-snapshot guards) explicitly
-- passes in — this RPC does not re-derive or validate them; the real
-- completeness gate still lives in deliver-governance-document at
-- generation time, same as every other caller.

CREATE OR REPLACE FUNCTION public.create_document_delivery_job(
  p_document_id bigint,
  p_document_version_id uuid,
  p_tenant_ids bigint[],
  p_snapshot_ids jsonb DEFAULT '{}'::jsonb,
  p_allow_incomplete_tenant_ids bigint[] DEFAULT ARRAY[]::bigint[]
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    RAISE EXCEPTION 'Document delivery requires Vivacity staff privileges' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = p_document_id) THEN
    RAISE EXCEPTION 'document_id % does not exist', p_document_id USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.document_versions dv
    WHERE dv.id = p_document_version_id AND dv.document_id = p_document_id
  ) THEN
    RAISE EXCEPTION 'document_version_id % does not belong to document %', p_document_version_id, p_document_id USING ERRCODE = '23503';
  END IF;

  IF p_tenant_ids IS NULL OR array_length(p_tenant_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_tenant_ids must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT t INTO v_missing
  FROM unnest(p_tenant_ids) AS t
  WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = t)
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.bulk_document_jobs (
    created_by, scope, tenant_ids, package_ids, stage_ids, document_ids,
    status, provisioning_summary, error_summary,
    total_items, generated_count, skipped_count, failed_count, started_at,
    origin
  )
  VALUES (
    v_caller, 'selected', p_tenant_ids, ARRAY[]::bigint[], ARRAY[]::bigint[], ARRAY[p_document_id],
    'running', '{}'::jsonb, '{}'::jsonb,
    0, 0, 0, 0, now(),
    'deliver_to_clients'
  )
  RETURNING id INTO v_job_id;

  WITH eligible AS (
    SELECT DISTINCT
      di.tenant_id,
      si.packageinstance_id AS package_instance_id,
      di.stageinstance_id,
      di.document_id,
      di.id AS document_instance_id,
      p_document_version_id AS document_version_id,
      NULLIF(p_snapshot_ids->>(di.tenant_id::text), '')::uuid AS snapshot_id,
      (di.tenant_id = ANY(p_allow_incomplete_tenant_ids)) AS allow_incomplete
    FROM public.document_instances di
    JOIN public.stage_instances si ON si.id = di.stageinstance_id
    JOIN public.tenants t ON t.id = di.tenant_id
    WHERE di.document_id = p_document_id
      AND di.tenant_id = ANY(p_tenant_ids)
      AND t.status = 'active'
      AND t.is_system_tenant = false
  ),
  inserted AS (
    INSERT INTO public.bulk_document_job_items (
      job_id, tenant_id, package_instance_id, stageinstance_id,
      document_id, document_instance_id, document_version_id, state, attempt_count,
      snapshot_id, allow_incomplete
    )
    SELECT v_job_id, e.tenant_id, e.package_instance_id, e.stageinstance_id,
           e.document_id, e.document_instance_id, e.document_version_id, 'pending', 0,
           e.snapshot_id, e.allow_incomplete
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
$function$;
