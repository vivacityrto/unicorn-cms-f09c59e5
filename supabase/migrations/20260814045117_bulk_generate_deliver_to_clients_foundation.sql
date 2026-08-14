-- Foundation for unifying "Bulk Generate" and "Deliver to Clients" onto one
-- job/worker engine, plus two incidentally-discovered, currently-silent bugs
-- fixed alongside since this migration already touches the exact tables
-- involved. See docs/audit-log/entries/2026-08-14-bulk-generate-deliver-to-clients-foundation.md.
--
-- 1) bulk_document_jobs.origin — records which UI created a job
--    ('bulk_generate' | 'deliver_to_clients'). Existing job-creation RPCs are
--    untouched here beyond carrying new item-level defaults, so every job
--    they create keeps the 'bulk_generate' default — no behavior change.
--
-- 2) bulk_document_job_items.snapshot_id / allow_incomplete — per-item pins
--    that the worker will read instead of the hardcoded values it uses today.
--    create_bulk_document_job / create_targeted_bulk_document_job explicitly
--    set snapshot_id=NULL, allow_incomplete=true for every item they insert —
--    bit-for-bit the same behavior the worker currently hardcodes — so this
--    migration is behavior-preserving for the existing Bulk Generate path.
--    A future "deliver to clients" job-creation path will set real per-tenant
--    values instead.
--
-- 3) document_activity_log_activity_type_check — the live constraint only
--    allowed ('uploaded','downloaded') from this table's original migration,
--    but GovernanceDeliveryDialog.tsx and deliver-governance-document/index.ts
--    have shipped inserting 'governance_bulk_delivery_complete',
--    'governance_document_delivered', and 'governance_generation_failed'
--    since 2026-08-12 — every one of those inserts has been silently failing
--    (confirmed: table is empty). Widening the constraint to the values
--    already in use.
--
-- 4) record_governance_delivery_and_mark_generated — gains an optional
--    p_batch_id param and now also writes a client-visible
--    'document_shared_to_client' timeline event per successful delivery
--    (this event type has been declared in timeline_valid_event_type since
--    2026-02 but never actually inserted anywhere until now). p_batch_id is
--    intentionally generic, not "bulk_job_id" — there are THREE independent
--    document-generation callers in this codebase that all funnel through
--    this same RPC (the Manage Documents bulk-generate job/worker engine,
--    the single-document Deliver to Clients dialog, and the per-stage
--    "Generate All" flow in useBulkGeneration.ts / bulk-generate-phase-
--    documents, which has no bulk_document_jobs row at all). Only the first
--    has a real job id; the third generates its own client-side batch uuid
--    per run so its own bursts (many docs, one tenant) can still be grouped
--    the same way on the timeline.
--
-- 5) rpc_log_document_activity — drive-by fix for a second, unrelated silent
--    failure found while auditing this table: its client_timeline_events
--    insert never set `source`, which is NOT NULL with no default, so the
--    'document_uploaded'/'document_downloaded' timeline insert has been
--    throwing (and silently swallowed by the caller) on every call since this
--    function was created — confirmed zero rows of both types exist. Fixed
--    minimally (source='system', matching the Academy publish trigger's
--    convention for non-conversational internal events); the choice of
--    'system' vs 'user' can be revisited separately since this is adjacent,
--    not requested, scope.

-- ── 1 & 2: new columns ─────────────────────────────────────────────────────

ALTER TABLE public.bulk_document_jobs
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'bulk_generate';

ALTER TABLE public.bulk_document_jobs
  ADD CONSTRAINT bulk_document_jobs_origin_check
  CHECK (origin = ANY (ARRAY['bulk_generate'::text, 'deliver_to_clients'::text]));

ALTER TABLE public.bulk_document_job_items
  ADD COLUMN IF NOT EXISTS snapshot_id uuid NULL,
  ADD COLUMN IF NOT EXISTS allow_incomplete boolean NOT NULL DEFAULT false;

-- ── 3: widen document_activity_log CHECK to match values already shipped ──

ALTER TABLE public.document_activity_log
  DROP CONSTRAINT document_activity_log_activity_type_check;

ALTER TABLE public.document_activity_log
  ADD CONSTRAINT document_activity_log_activity_type_check
  CHECK (activity_type = ANY (ARRAY[
    'uploaded'::text,
    'downloaded'::text,
    'governance_bulk_delivery_complete'::text,
    'governance_document_delivered'::text,
    'governance_generation_failed'::text
  ]));

-- ── create_bulk_document_job: carry snapshot_id/allow_incomplete per item ──

CREATE OR REPLACE FUNCTION public.create_bulk_document_job(p_scope text, p_tenant_ids bigint[] DEFAULT NULL::bigint[], p_package_ids bigint[] DEFAULT NULL::bigint[], p_stage_ids bigint[] DEFAULT NULL::bigint[], p_document_ids bigint[] DEFAULT NULL::bigint[])
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
    RAISE EXCEPTION 'Bulk generation requires Vivacity staff privileges' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('all','selected') THEN
    RAISE EXCEPTION 'scope must be all or selected' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'selected' AND (p_tenant_ids IS NULL OR array_length(p_tenant_ids,1) IS NULL) THEN
    RAISE EXCEPTION 'scope=selected requires p_tenant_ids' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_tenant_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_tenant_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_package_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_package_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.packages x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'package_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_stage_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_stage_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.stages x WHERE x.id::bigint = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'stage_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_document_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_document_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.id = t)
    LIMIT 1;
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
    'running', '{}'::jsonb, '{}'::jsonb,
    0, 0, 0, 0, now()
  )
  RETURNING id INTO v_job_id;

  WITH eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id,
      di.id AS document_instance_id,
      NULL::uuid AS document_version_id,
      NULL::uuid AS snapshot_id,
      true AS allow_incomplete
    FROM public.tenants t
    JOIN public.package_instances pi
      ON pi.tenant_id = t.id
    JOIN public.stage_instances si
      ON si.packageinstance_id = pi.id
    JOIN public.document_instances di
      ON di.stageinstance_id = si.id
     AND di.tenant_id = t.id
    JOIN public.documents d
      ON d.id = di.document_id
    WHERE t.status = 'active'
      AND t.is_system_tenant = false
      AND pi.is_active = true
      AND pi.is_complete = false
      AND pi.membership_state = 'active'
      AND (p_scope = 'all' OR t.id = ANY(p_tenant_ids))
      AND (array_length(p_package_ids,1)  IS NULL OR pi.package_id       = ANY(p_package_ids))
      AND (array_length(p_stage_ids,1)    IS NULL OR si.stage_id::bigint = ANY(p_stage_ids))
      AND (array_length(p_document_ids,1) IS NULL OR d.id                = ANY(p_document_ids))
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

-- ── create_targeted_bulk_document_job: same treatment ──────────────────────

CREATE OR REPLACE FUNCTION public.create_targeted_bulk_document_job(p_selections jsonb, p_document_ids bigint[] DEFAULT NULL::bigint[])
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
    RAISE EXCEPTION 'Bulk generation requires Vivacity staff privileges' USING ERRCODE = '42501';
  END IF;

  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RAISE EXCEPTION 'p_selections must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'p_selections must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT (elem->>'tenant_id')::bigint INTO v_missing
  FROM jsonb_array_elements(p_selections) AS elem
  WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = (elem->>'tenant_id')::bigint)
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  SELECT (elem->>'package_id')::bigint INTO v_missing
  FROM jsonb_array_elements(p_selections) AS elem
  WHERE NOT EXISTS (SELECT 1 FROM public.packages x WHERE x.id = (elem->>'package_id')::bigint)
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'package_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  SELECT sid INTO v_missing
  FROM jsonb_array_elements(p_selections) AS elem
  CROSS JOIN LATERAL jsonb_array_elements(elem->'stage_ids') AS s(value)
  CROSS JOIN LATERAL (SELECT (s.value)::text::bigint AS sid) AS x
  WHERE NOT EXISTS (SELECT 1 FROM public.stages y WHERE y.id::bigint = x.sid)
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'stage_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  IF array_length(p_document_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_document_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'document_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  INSERT INTO public.bulk_document_jobs (
    created_by, scope, tenant_ids, package_ids, stage_ids, document_ids,
    status, provisioning_summary, error_summary,
    total_items, generated_count, skipped_count, failed_count, started_at,
    selections
  )
  VALUES (
    v_caller, 'selected',
    COALESCE((SELECT array_agg(DISTINCT (elem->>'tenant_id')::bigint) FROM jsonb_array_elements(p_selections) AS elem), ARRAY[]::bigint[]),
    COALESCE((SELECT array_agg(DISTINCT (elem->>'package_id')::bigint) FROM jsonb_array_elements(p_selections) AS elem), ARRAY[]::bigint[]),
    COALESCE((SELECT array_agg(DISTINCT (s.value)::text::bigint) FROM jsonb_array_elements(p_selections) AS elem CROSS JOIN LATERAL jsonb_array_elements(elem->'stage_ids') AS s(value)), ARRAY[]::bigint[]),
    COALESCE(p_document_ids, ARRAY[]::bigint[]),
    'running', '{}'::jsonb, '{}'::jsonb,
    0, 0, 0, 0, now(),
    p_selections
  )
  RETURNING id INTO v_job_id;

  WITH raw_sel AS (
    SELECT (elem->>'tenant_id')::bigint  AS tenant_id,
           (elem->>'package_id')::bigint AS package_id,
           elem->'stage_ids'             AS stage_ids
    FROM jsonb_array_elements(p_selections) AS elem
  ),
  triples AS (
    SELECT r.tenant_id, r.package_id, (s.value)::text::bigint AS stage_id
    FROM raw_sel r
    CROSS JOIN LATERAL jsonb_array_elements(r.stage_ids) AS s(value)
  ),
  eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id,
      di.id AS document_instance_id,
      NULL::uuid AS document_version_id,
      NULL::uuid AS snapshot_id,
      true AS allow_incomplete
    FROM public.tenants t
    JOIN public.package_instances pi ON pi.tenant_id = t.id
    JOIN public.stage_instances si   ON si.packageinstance_id = pi.id
    JOIN public.document_instances di ON di.stageinstance_id = si.id
                                     AND di.tenant_id = t.id
    JOIN public.documents d          ON d.id = di.document_id
    JOIN triples tr
      ON tr.tenant_id  = t.id
     AND tr.package_id = pi.package_id
     AND tr.stage_id   = si.stage_id::bigint
    WHERE t.status = 'active'
      AND t.is_system_tenant = false
      AND pi.is_active = true
      AND pi.is_complete = false
      AND pi.membership_state = 'active'
      AND (array_length(p_document_ids,1) IS NULL OR d.id = ANY(p_document_ids))
      AND (
        NULLIF(d.source_template_url, '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.document_versions dv
          WHERE dv.document_id = d.id
            AND (
              (NULLIF(dv.storage_path, '') IS NOT NULL
                AND lower(dv.storage_path) ~ '\.(docx|xlsx|xls|xlsm|pptx)$')
              OR (NULLIF(dv.frozen_storage_path, '') IS NOT NULL
                AND lower(dv.frozen_storage_path) ~ '\.(docx|xlsx|xls|xlsm|pptx)$')
            )
        )
      )
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

-- ── lease_bulk_document_job_items: surface snapshot_id/allow_incomplete ────
-- Postgres won't let CREATE OR REPLACE widen a RETURNS TABLE column set, so
-- the old signature must be dropped first.

DROP FUNCTION IF EXISTS public.lease_bulk_document_job_items(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.lease_bulk_document_job_items(p_job_id uuid, p_worker_id text, p_limit integer DEFAULT 5)
 RETURNS TABLE(id bigint, job_id uuid, tenant_id bigint, package_instance_id bigint, stageinstance_id bigint, document_id bigint, document_instance_id bigint, document_version_id uuid, attempt_count integer, snapshot_id uuid, allow_incomplete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           i.document_id, i.document_instance_id, i.document_version_id, i.attempt_count,
           i.snapshot_id, i.allow_incomplete
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
    snapshot_id := r.snapshot_id; allow_incomplete := r.allow_incomplete;
    RETURN NEXT;

    v_taken := v_taken + 1;
    EXIT WHEN v_taken >= v_effective_limit;
  END LOOP;

  RETURN;
END;
$function$;

-- ── record_governance_delivery_and_mark_generated: + batch_id + timeline event ──

CREATE OR REPLACE FUNCTION public.record_governance_delivery_and_mark_generated(
  p_tenant_id bigint,
  p_document_id bigint,
  p_document_version_id uuid,
  p_snapshot_id uuid,
  p_sharepoint_item_id text,
  p_sharepoint_web_url text,
  p_delivered_file_name text,
  p_category_subfolder text,
  p_delivered_by uuid,
  p_tailoring_completeness_pct integer,
  p_missing_merge_fields jsonb,
  p_invalid_merge_fields jsonb,
  p_tailoring_risk_level text,
  p_batch_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_delivery public.governance_document_deliveries%ROWTYPE;
  v_display_version text;
  v_document_title text;
BEGIN
  INSERT INTO public.governance_document_deliveries (
    tenant_id, document_id, document_version_id, snapshot_id, status,
    sharepoint_item_id, sharepoint_web_url, delivered_file_name, category_subfolder,
    delivered_by, tailoring_completeness_pct, missing_merge_fields, invalid_merge_fields,
    tailoring_risk_level
  ) VALUES (
    p_tenant_id, p_document_id, p_document_version_id, p_snapshot_id, 'success',
    p_sharepoint_item_id, p_sharepoint_web_url, p_delivered_file_name, p_category_subfolder,
    p_delivered_by, p_tailoring_completeness_pct, p_missing_merge_fields, p_invalid_merge_fields,
    p_tailoring_risk_level
  )
  RETURNING * INTO v_delivery;

  UPDATE public.document_instances
  SET status = 'generated',
      generation_status = 'generated',
      generated_file_url = p_sharepoint_web_url,
      generated_item_id = p_sharepoint_item_id,
      isgenerated = true,
      generationdate = now(),
      last_error = null,
      updated_by = p_delivered_by
  WHERE document_id = p_document_id
    AND tenant_id = p_tenant_id;

  UPDATE public.document_generation_errors dge
  SET resolved_at = now(),
      resolved_by = p_delivered_by
  FROM public.document_instances di
  WHERE dge.documentinstance_id = di.id
    AND di.document_id = p_document_id
    AND di.tenant_id = p_tenant_id
    AND dge.resolved_at IS NULL;

  -- Client-visible timeline event for this delivery. One row per successful
  -- delivery regardless of caller — batch_id is null unless the caller is
  -- part of a multi-document batch (the job/worker engine, or a client-side
  -- batch uuid from the per-stage "Generate All" flow), letting the
  -- client-side burst-grouping mechanism (portfolioTimelineGrouping.ts)
  -- collapse multiple documents delivered to the same tenant in one batch
  -- into a single activity entry. No dedupe_key here deliberately — this RPC
  -- is only reached after deliver-governance-document's own idempotency
  -- check has already passed (or been explicitly overridden via force=true
  -- for a real regeneration/overwrite), so every call here represents a
  -- genuinely new delivery that should get its own timeline entry.
  SELECT dv.display_version, d.title
    INTO v_display_version, v_document_title
    FROM public.document_versions dv
    JOIN public.documents d ON d.id = dv.document_id
    WHERE dv.id = p_document_version_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by,
    source, visibility
  ) VALUES (
    p_tenant_id,
    p_tenant_id::text,
    'document_shared_to_client',
    format('%s (%s) was delivered to your account',
      COALESCE(v_document_title, p_delivered_file_name),
      COALESCE(v_display_version, 'latest version')),
    format('Delivered as "%s"', p_delivered_file_name),
    'document',
    p_document_id::text,
    jsonb_build_object(
      'document_id', p_document_id,
      'document_version_id', p_document_version_id,
      'display_version', v_display_version,
      'delivered_file_name', p_delivered_file_name,
      'sharepoint_web_url', p_sharepoint_web_url,
      'tailoring_completeness_pct', p_tailoring_completeness_pct,
      'batch_id', p_batch_id
    ),
    now(),
    p_delivered_by,
    'unicorn',
    'client'
  );

  RETURN to_jsonb(v_delivery);
END;
$function$;

-- ── rpc_log_document_activity: fix missing NOT NULL `source` (drive-by) ───

CREATE OR REPLACE FUNCTION public.rpc_log_document_activity(p_tenant_id bigint, p_client_id bigint, p_package_id bigint, p_stage_id bigint, p_document_id bigint, p_activity_type text, p_file_name text, p_actor_role text DEFAULT 'internal'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_activity_id uuid;
  v_event_type text;
  v_title text;
  v_body text;
  v_stage_name text;
  v_package_name text;
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Insert activity log
  INSERT INTO public.document_activity_log (
    tenant_id, client_id, package_id, stage_id, document_id,
    activity_type, actor_user_id, actor_role, file_name, metadata
  ) VALUES (
    p_tenant_id, p_client_id, p_package_id, p_stage_id, p_document_id,
    p_activity_type, v_user_id, p_actor_role, p_file_name, p_metadata
  )
  RETURNING id INTO v_activity_id;

  -- Only create timeline event if client_id is present
  IF p_client_id IS NOT NULL THEN
    -- Determine event type
    IF p_activity_type = 'uploaded' THEN
      v_event_type := 'document_uploaded';
      v_title := 'Document uploaded: ' || COALESCE(p_file_name, 'Unknown file');
    ELSE
      v_event_type := 'document_downloaded';
      v_title := 'Document downloaded: ' || COALESCE(p_file_name, 'Unknown file');
    END IF;

    -- Get stage name if available
    IF p_stage_id IS NOT NULL THEN
      SELECT title INTO v_stage_name
      FROM public.documents_stages
      WHERE id = p_stage_id;
      v_body := 'Stage: ' || COALESCE(v_stage_name, 'Unknown');
    END IF;

    -- Get package name if available
    IF p_package_id IS NOT NULL THEN
      SELECT name INTO v_package_name
      FROM public.packages
      WHERE id = p_package_id;
      IF v_body IS NULL THEN
        v_body := 'Package: ' || COALESCE(v_package_name, 'Unknown');
      ELSE
        v_body := v_body || ' | Package: ' || COALESCE(v_package_name, 'Unknown');
      END IF;
    END IF;

    -- Insert timeline event
    -- NOTE: `source` was previously omitted here, which throws against
    -- client_timeline_events.source's NOT NULL constraint (no default) on
    -- every call — confirmed zero 'document_uploaded'/'document_downloaded'
    -- rows exist in production despite this function being called on every
    -- document upload/download. Fixed by supplying source='system'.
    INSERT INTO public.client_timeline_events (
      tenant_id,
      client_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id,
      metadata,
      occurred_at,
      created_by,
      source
    ) VALUES (
      p_tenant_id,
      p_client_id,
      v_event_type,
      v_title,
      v_body,
      'document',
      p_document_id::text,
      jsonb_build_object(
        'activity_log_id', v_activity_id,
        'document_id', p_document_id,
        'package_id', p_package_id,
        'stage_id', p_stage_id,
        'file_name', p_file_name,
        'download_source', CASE WHEN p_stage_id IS NOT NULL THEN 'stage' ELSE 'documents' END,
        'actor_role', p_actor_role
      ) || p_metadata,
      now(),
      v_user_id,
      'system'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'activity_id', v_activity_id);
END;
$function$;
