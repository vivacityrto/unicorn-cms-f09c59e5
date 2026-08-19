-- Requeue skipped bulk-document-job items into a fresh follow-up job.
--
-- Skipped items (typically outcome.reason = 'no_published_version') have no
-- automatic retry path -- retry_bulk_document_job deliberately excludes
-- 'skipped' state. This RPC lets staff clone a chosen subset of skipped
-- items (e.g. after publishing the missing document) into a brand new job
-- targeting exactly those (tenant, document, stage) tuples -- not the
-- document's full eligible scope.
CREATE OR REPLACE FUNCTION public.requeue_skipped_bulk_document_items(p_item_ids bigint[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_job_id uuid;
  v_total int;
  v_bad_count int;
  v_source_job_ids uuid[];
  v_origin text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Bulk generation requires Vivacity staff privileges' USING ERRCODE = '42501';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_item_ids must be non-empty' USING ERRCODE = '22023';
  END IF;

  -- Every provided id must actually exist and currently be a skipped item --
  -- this is a "requeue skips" RPC, not a general item-cloning primitive.
  SELECT COUNT(*) INTO v_bad_count
  FROM unnest(p_item_ids) AS t(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bulk_document_job_items i
    WHERE i.id = t.id AND i.state = 'skipped'
  );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION '% of the provided item_ids are not skipped items', v_bad_count USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT job_id) INTO v_source_job_ids
  FROM public.bulk_document_job_items WHERE id = ANY(p_item_ids);

  SELECT origin INTO v_origin
  FROM public.bulk_document_jobs
  WHERE id = v_source_job_ids[1];

  INSERT INTO public.bulk_document_jobs (
    created_by, scope, tenant_ids, package_ids, stage_ids, document_ids,
    status, provisioning_summary, error_summary,
    total_items, generated_count, skipped_count, failed_count, started_at,
    origin
  )
  SELECT
    v_caller, 'selected',
    COALESCE((SELECT array_agg(DISTINCT tenant_id) FROM public.bulk_document_job_items WHERE id = ANY(p_item_ids)), ARRAY[]::bigint[]),
    ARRAY[]::bigint[],
    ARRAY[]::bigint[],
    COALESCE((SELECT array_agg(DISTINCT document_id) FROM public.bulk_document_job_items WHERE id = ANY(p_item_ids)), ARRAY[]::bigint[]),
    'running', '{}'::jsonb,
    jsonb_build_object('requeued_from_job_ids', to_jsonb(v_source_job_ids), 'requeued_item_count', array_length(p_item_ids, 1)),
    0, 0, 0, 0, now(),
    COALESCE(v_origin, 'bulk_generate')
  RETURNING id INTO v_job_id;

  WITH inserted AS (
    INSERT INTO public.bulk_document_job_items (
      job_id, tenant_id, package_instance_id, stageinstance_id,
      document_id, document_instance_id, document_version_id, state, attempt_count,
      snapshot_id, allow_incomplete
    )
    SELECT v_job_id, i.tenant_id, i.package_instance_id, i.stageinstance_id,
           i.document_id, i.document_instance_id, NULL::uuid, 'pending', 0,
           i.snapshot_id, i.allow_incomplete
    FROM public.bulk_document_job_items i
    WHERE i.id = ANY(p_item_ids)
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
