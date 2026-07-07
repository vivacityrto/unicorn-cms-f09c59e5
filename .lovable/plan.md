# PR-C repair v2 — filter-independence fix + honest grant disclosure

Two corrections vs the previous draft.

## Fix 1 — filter independence

Previous draft collapsed all four filters under `p_scope = 'all' OR (...)`, which made `scope='all'` silently ignore `p_package_ids`, `p_stage_ids`, `p_document_ids`. That breaks the locked combination "all clients, package X, only document Y".

Correct predicate shape (applied in **both** `create_bulk_document_job` and `preview_bulk_document_job`):

```sql
AND (p_scope = 'all' OR t.id = ANY(p_tenant_ids))
AND (array_length(p_package_ids,1)  IS NULL OR pi.package_id       = ANY(p_package_ids))
AND (array_length(p_stage_ids,1)    IS NULL OR si.stage_id::bigint = ANY(p_stage_ids))
AND (array_length(p_document_ids,1) IS NULL OR d.id                = ANY(p_document_ids))
```

Only tenant selection depends on `p_scope`. The other three filters apply whenever supplied, regardless of scope.

## Called-out additions beyond what you explicitly approved

- **Removing `GRANT EXECUTE ... TO service_role`** from both RPCs.
- `TO authenticated` grant only, matching the originally approved shape.
- No other additions.

### Why the `service_role` grant was in v1, and honest answer to your service_role/grants question

My original PR-C statement ("service_role bypasses grants entirely") was wrong as stated. `service_role` bypasses RLS. It does **not** bypass function `EXECUTE` privileges at the Postgres level. The reason worker RPCs work today is Supabase's default privileges block (`ALTER DEFAULT PRIVILEGES ... GRANT ... ON FUNCTIONS TO service_role`) applies to newly created public functions — that's a platform default, not a bypass.

Consequence: the explicit `TO service_role` grant I added in v1 is **likely a no-op** on this project (default privileges cover it), but it was not called out and it was not part of what you approved. Removing it here.

Separately: this raises a real question about the four other worker-only RPCs (`lease_bulk_document_job_items`, `record_bulk_document_item_outcome`, `reclaim_stale_bulk_document_locks`, `cancel_bulk_document_job`, `purge_bulk_document_job_items`) that also currently have no explicit `service_role` grant. They rely on the same default-privileges path. That's a separate audit — flagging it, not fixing it in this PR.

## Proposed migration SQL

```sql
-- PR-C repair v2: correct bulk document eligibility RPCs.
-- Fixes nonexistent document_instances columns, removes p_options,
-- and makes package/stage/document filters independent of scope.

DROP FUNCTION IF EXISTS public.create_bulk_document_job(
  text, bigint[], bigint[], bigint[], bigint[], jsonb
);

CREATE OR REPLACE FUNCTION public.create_bulk_document_job(
  p_scope        text,
  p_tenant_ids   bigint[] DEFAULT NULL,
  p_package_ids  bigint[] DEFAULT NULL,
  p_stage_ids    bigint[] DEFAULT NULL,
  p_document_ids bigint[] DEFAULT NULL
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
      NULL::uuid AS document_version_id
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
$function$;

REVOKE ALL ON FUNCTION public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_bulk_document_job(
  p_scope        text,
  p_tenant_ids   bigint[] DEFAULT NULL,
  p_package_ids  bigint[] DEFAULT NULL,
  p_stage_ids    bigint[] DEFAULT NULL,
  p_document_ids bigint[] DEFAULT NULL
)
RETURNS TABLE(
  eligible_count integer,
  distinct_tenants integer,
  distinct_packages integer,
  distinct_stages integer,
  distinct_documents integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_missing bigint;
BEGIN
  IF v_caller IS NULL OR NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Vivacity staff privileges required' USING ERRCODE = '42501';
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

  RETURN QUERY
  WITH eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id
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
  )
  SELECT COUNT(*)::int,
         COUNT(DISTINCT tenant_id)::int,
         COUNT(DISTINCT package_instance_id)::int,
         COUNT(DISTINCT stageinstance_id)::int,
         COUNT(DISTINCT document_id)::int
  FROM eligible;
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

Note: a `scope='selected'` guard for `p_tenant_ids` is included so the split predicate can't degenerate to `t.id = ANY(NULL)` (which would evaluate NULL → filter out everything). This wasn't in the previous draft's approved body; called out here explicitly. Reject if you don't want it and I'll remove it.

## Post-apply verification (expanded)

1. **Signatures**

```sql
SELECT proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('create_bulk_document_job','preview_bulk_document_job')
ORDER BY 1,2;
```

Expected: single 5-arg signature each, `prosecdef=true`, `search_path=""`. No 6-arg `create_...`.

2. **No broken column references**

```sql
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('create_bulk_document_job','preview_bulk_document_job');
```

Expected: no `di.package_instance_id`, no `di.version_id`.

3. **Grants**

```sql
SELECT p.proname, p.proacl::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('create_bulk_document_job','preview_bulk_document_job');
```

Expected: `authenticated=X/...` present; no explicit `service_role=X/...` from this migration (Supabase default privileges may still show one).

4. **Filter independence test — the exact scenario the v1 bug hid**

```sql
-- scope='all', package filter only
SELECT public.create_bulk_document_job(
  'all', NULL::bigint[], ARRAY[1020]::bigint[], NULL::bigint[], NULL::bigint[]
) AS job_id;

-- inspect items: every row must reference package 1020's instances
WITH j AS (
  SELECT id FROM public.bulk_document_jobs ORDER BY created_at DESC LIMIT 1
)
SELECT
  COUNT(*) AS total_items,
  COUNT(*) FILTER (WHERE pi.package_id = 1020) AS package_1020_items,
  COUNT(*) FILTER (WHERE pi.package_id <> 1020) AS other_package_items,
  COUNT(DISTINCT bji.tenant_id) AS distinct_tenants
FROM public.bulk_document_job_items bji
JOIN public.package_instances pi ON pi.id = bji.package_instance_id
WHERE bji.job_id = (SELECT id FROM j);
```

Expected: `other_package_items = 0`, `total_items = package_1020_items > 0`, `distinct_tenants > 1`.

5. **Realistic invocation with concrete IDs (unchanged from v1)**

```sql
SELECT * FROM public.preview_bulk_document_job(
  'selected', ARRAY[7444]::bigint[], ARRAY[1020]::bigint[], ARRAY[1114]::bigint[], ARRAY[7011]::bigint[]
);
```

Expected: `eligible_count >= 1`, no exception.

## Rollback

Restore the prior 6-arg `create_bulk_document_job` and prior `preview_bulk_document_job` from the captured `pg_get_functiondef` snapshots. Reintroduces the runtime column-does-not-exist crash; use only if an unknown 6-arg caller is discovered.

## Process commitment (reiterating, now with a demonstrated miss)

Every SQL proposal will include a "Called-out additions beyond what you explicitly approved" section, and grants count as additions. This one names the `service_role` grant removal explicitly and admits the earlier claim about `service_role` bypassing grants was wrong.