# Phase 5 — Implementation Plan (full SQL + file changes)

Confirmed decisions: D1 keep writing `package_id` (back-compat); D2 backfill RPC gated by `is_vivacity_team_safe`; D3 no FK on `package_id` (Phase 6); D4 partial index on `package_instance_id WHERE NOT NULL`.

Sequencing constraint (**hard**): Steps 1–6 (migrations) must deploy and Step 6 must be executed before Step 7 (frontend removals). Step 8 verifies after both.

---

## Migration A — Steps 1 + 2 (one file)

`supabase/migrations/<ts>_phase5_a_cai_package_instance_id.sql`

```sql
-- =============================================================
-- Phase 5 / Step 1 — schema: client_action_items.package_instance_id
-- Lock impact: AccessExclusive on client_action_items for the ALTER
--   (31 rows today; sub-millisecond). Index build is partial, also trivial.
-- Pre-deploy verification:
--   SELECT count(*) FROM public.client_action_items;             -- expect ~31
--   SELECT count(*) FROM public.client_action_items
--    WHERE package_id IS NOT NULL;                               -- expect 4
-- Post-deploy verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='client_action_items'
--      AND column_name='package_instance_id';                    -- expect 1 row
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='client_action_items'
--      AND indexname='idx_cai_package_instance_id';              -- expect 1 row
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_cai_package_instance_id;
--   ALTER TABLE public.client_action_items DROP COLUMN IF EXISTS package_instance_id;
-- =============================================================

ALTER TABLE public.client_action_items
  ADD COLUMN package_instance_id bigint NULL
    REFERENCES public.package_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cai_package_instance_id
  ON public.client_action_items(package_instance_id)
  WHERE package_instance_id IS NOT NULL;

COMMENT ON COLUMN public.client_action_items.package_instance_id IS
  'Phase 5: canonical link to package_instances(id). Use this for dashboard / portal scoping. package_id (template FK) retained for back-compat; do not use for instance scoping.';

COMMENT ON COLUMN public.stage_instances.released_client_tasks IS
  'Deprecated Phase 5 — do not use. Replaced by per-action-item publication via rpc_publish_stage_tasks. Column retained inert pending Phase 6 cleanup.';

-- =============================================================
-- Phase 5 / Step 2 — backfill existing rows
-- Pre-deploy verification:
--   SELECT count(*) FROM public.client_action_items cai
--    JOIN public.client_task_instances cti
--      ON cai.related_entity_type='stage_task'
--     AND cai.related_entity_id = cti.id::text
--    WHERE cai.package_instance_id IS NULL;                      -- expect 4
-- Post-deploy verification:
--   SELECT count(*) FROM public.client_action_items
--    WHERE related_entity_type='stage_task' AND package_instance_id IS NULL;
--                                                                -- expect 0
-- Rollback (data only):
--   UPDATE public.client_action_items SET package_instance_id = NULL;
-- =============================================================

UPDATE public.client_action_items cai
   SET package_instance_id = si.packageinstance_id
  FROM public.client_task_instances cti
  JOIN public.stage_instances si ON si.id = cti.stageinstance_id
 WHERE cai.related_entity_type = 'stage_task'
   AND cai.related_entity_id   = cti.id::text
   AND cai.package_instance_id IS NULL;
```

---

## Migration B — Step 3: `rpc_publish_stage_tasks`

`supabase/migrations/<ts>_phase5_b_publish_stage_tasks.sql`

```sql
-- =============================================================
-- Phase 5 / Step 3 — populate cai.package_instance_id on publish
-- Lock impact: brief AccessExclusive on pg_proc; existing callers unaffected
--   (signature unchanged).
-- Pre-deploy verification:
--   SELECT proname FROM pg_proc WHERE proname='rpc_publish_stage_tasks';
-- Post-deploy verification:
--   -- Pick a known stage with unpublished CTIs, call from psql as a Vivacity user:
--   SELECT public.rpc_publish_stage_tasks(<stage_instance_id>);
--   SELECT id, package_id, package_instance_id, related_entity_id
--     FROM public.client_action_items
--    WHERE related_entity_type='stage_task'
--    ORDER BY created_at DESC LIMIT 5;     -- package_instance_id must be NOT NULL
-- Rollback: re-apply previous CREATE OR REPLACE from migration history.
-- =============================================================

CREATE OR REPLACE FUNCTION public.rpc_publish_stage_tasks(p_stage_instance_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_stage_id      integer;
  v_pkg_inst_id   bigint;
  v_tenant_id     bigint;
  v_package_id    bigint;
  v_client_id     text;
  v_action_id     uuid;
  v_published     integer := 0;
  v_skipped       integer := 0;
  v_action_ids    uuid[] := ARRAY[]::uuid[];
  r               record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_uid) THEN
    RAISE EXCEPTION 'Vivacity staff only' USING ERRCODE = '42501';
  END IF;

  SELECT si.stage_id, si.packageinstance_id, pi.tenant_id, pi.package_id
    INTO v_stage_id, v_pkg_inst_id, v_tenant_id, v_package_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
   WHERE si.id = p_stage_instance_id;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Stage instance % not found', p_stage_instance_id USING ERRCODE = 'P0002';
  END IF;

  v_client_id := v_tenant_id::text;

  FOR r IN
    SELECT cti.id, cti.due_date, ct.name, ct.description, ct.sort_order
      FROM public.client_task_instances cti
      JOIN public.client_tasks          ct  ON ct.id = cti.clienttask_id
     WHERE cti.stageinstance_id           = p_stage_instance_id
       AND cti.published_action_item_id   IS NULL
       AND cti.is_archived                = false
     ORDER BY ct.sort_order NULLS LAST, cti.id
     FOR UPDATE
  LOOP
    INSERT INTO public.client_action_items (
      tenant_id, client_id, created_by, title, description, due_date,
      status, priority, source, item_type, related_entity_type,
      related_entity_id, package_id, package_instance_id, sort_order
    ) VALUES (
      v_tenant_id::integer, v_client_id, v_uid, r.name, r.description, r.due_date::date,
      'todo', 'medium', 'stage_rule', 'client', 'stage_task',
      r.id::text, v_package_id, v_pkg_inst_id, COALESCE(r.sort_order, 0)
    )
    RETURNING id INTO v_action_id;

    UPDATE public.client_task_instances
       SET published_action_item_id = v_action_id,
           updated_at               = now()
     WHERE id = r.id;

    v_published  := v_published + 1;
    v_action_ids := v_action_ids || v_action_id;
  END LOOP;

  SELECT count(*)::integer
    INTO v_skipped
    FROM public.client_task_instances
   WHERE stageinstance_id = p_stage_instance_id
     AND published_action_item_id IS NOT NULL;
  v_skipped := v_skipped - v_published;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    v_tenant_id, v_uid, 'publish_stage_tasks', 'stage_instance', p_stage_instance_id::text,
    jsonb_build_object(
      'stage_instance_id',   p_stage_instance_id,
      'stage_id',            v_stage_id,
      'package_instance_id', v_pkg_inst_id,
      'published_count',     v_published,
      'skipped_count',       v_skipped,
      'action_item_ids',     to_jsonb(v_action_ids)
    )
  );

  RETURN jsonb_build_object(
    'success',           true,
    'stage_instance_id', p_stage_instance_id,
    'published_count',   v_published,
    'skipped_count',     v_skipped,
    'action_item_ids',   to_jsonb(v_action_ids)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_publish_stage_tasks(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_publish_stage_tasks(integer) TO authenticated, service_role;
```

---

## Migration C — Step 4: `rpc_create_action_item`

`supabase/migrations/<ts>_phase5_c_create_action_item.sql`

> **Signature note.** `CREATE OR REPLACE FUNCTION` cannot add a new parameter to an existing signature — it would conflict on the old `(integer,text,text,text,uuid,date,text,text,uuid,text,text,text)` overload. We must `DROP FUNCTION ... (the exact old signature)` first. All existing call sites pass named parameters or only required positionals; adding `p_package_instance_id` at the end as `DEFAULT NULL` is back-compat for callers, but the *function object* still needs to be dropped/recreated.

```sql
-- =============================================================
-- Phase 5 / Step 4 — rpc_create_action_item: accept p_package_instance_id
-- Lock impact: AccessExclusive on pg_proc; brief.
-- Pre-deploy verification:
--   SELECT pg_get_function_arguments(oid) FROM pg_proc
--    WHERE proname='rpc_create_action_item';                    -- confirm old args
-- Post-deploy verification:
--   SELECT pg_get_function_arguments(oid) FROM pg_proc
--    WHERE proname='rpc_create_action_item';                    -- ends with p_package_instance_id
-- Rollback: re-apply previous CREATE OR REPLACE (drop new sig, recreate old).
-- =============================================================

DROP FUNCTION IF EXISTS public.rpc_create_action_item(
  integer, text, text, text, uuid, date, text, text, uuid, text, text, text
);

CREATE OR REPLACE FUNCTION public.rpc_create_action_item(
  p_tenant_id            integer,
  p_client_id            text,
  p_title                text,
  p_description          text DEFAULT NULL,
  p_owner_user_id        uuid DEFAULT NULL,
  p_due_date             date DEFAULT NULL,
  p_priority             text DEFAULT 'medium',
  p_source               text DEFAULT 'manual',
  p_source_note_id       uuid DEFAULT NULL,
  p_related_entity_type  text DEFAULT NULL,
  p_related_entity_id    text DEFAULT NULL,
  p_recurrence_rule      text DEFAULT NULL,
  p_package_instance_id  bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id   uuid;
  v_action_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = p_priority AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid priority');
  END IF;

  IF p_source NOT IN ('manual', 'note', 'stage_rule', 'system', 'task_assignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid source');
  END IF;

  INSERT INTO public.client_action_items (
    tenant_id, client_id, created_by, title, description, owner_user_id,
    due_date, priority, source, source_note_id, related_entity_type,
    related_entity_id, recurrence_rule, package_instance_id
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, p_title, p_description, p_owner_user_id,
    p_due_date, p_priority, p_source, p_source_note_id, p_related_entity_type,
    p_related_entity_id, p_recurrence_rule, p_package_instance_id
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object('success', true, 'action_item_id', v_action_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_action_item(
  integer, text, text, text, uuid, date, text, text, uuid, text, text, text, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_action_item(
  integer, text, text, text, uuid, date, text, text, uuid, text, text, text, bigint
) TO authenticated, service_role;
```

---

## Migration D — Step 5: dashboard views + RPC

`supabase/migrations/<ts>_phase5_d_dashboard_artefacts.sql`

> Both views currently filter via `app.user_can_access_tenant(...)`. We preserve that exactly; only the `action_items_agg` / `combined` CTE join column changes.

```sql
-- =============================================================
-- Phase 5 / Step 5 — switch dashboard joins to cai.package_instance_id
-- Lock impact: brief AccessExclusive on each view/function.
-- Pre-deploy verification:
--   SELECT count(*) FROM public.v_client_package_dashboard;
--   SELECT count(*) FROM public.v_client_package_whats_next;
-- Post-deploy verification (pick a tenant + instance you can hand-count):
--   SELECT package_instance_id, open_tasks, overdue_tasks
--     FROM public.get_client_package_dashboard(<tenant>, <instance>);
--   SELECT count(*) FROM public.client_action_items
--    WHERE package_instance_id = <instance>
--      AND completed_at IS NULL
--      AND COALESCE(status,'open') NOT IN ('completed','cancelled');
-- Rollback: re-apply previous CREATE OR REPLACE from migration history.
-- =============================================================

-- (A) v_client_package_dashboard
CREATE OR REPLACE VIEW public.v_client_package_dashboard AS
  /* unchanged CTEs above ... */
  -- only action_items_agg changes:
  -- action_items_agg AS (
  --   SELECT cai.package_instance_id,
  --          count(*)::integer AS open_count,
  --          count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
  --          max(cai.updated_at) AS last_updated
  --     FROM public.client_action_items cai
  --    WHERE cai.package_instance_id IS NOT NULL
  --      AND cai.completed_at IS NULL
  --      AND (COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled']))
  --      AND app.user_can_access_tenant(cai.tenant_id::bigint)
  --    GROUP BY cai.package_instance_id
  -- )
  -- Full body re-emitted verbatim from current pg_get_viewdef, with the above
  -- single substitution. No other CTE, SELECT, or filter changes.
  ;

-- (B) v_client_package_whats_next — first SELECT inside combined CTE changes:
--   SELECT cai.package_instance_id, ...  (was cai.package_id)
-- Full body re-emitted verbatim with the single substitution.
CREATE OR REPLACE VIEW public.v_client_package_whats_next AS
  /* full body — single substitution as above */ ;

-- (C) get_client_package_dashboard — action_items_agg substitution:
--   SELECT cai.package_instance_id AS package_instance_id, ...
--    WHERE cai.package_instance_id IN (SELECT id FROM allowed_packages)
--    GROUP BY cai.package_instance_id
-- Full body re-emitted verbatim with the substitution; SET search_path = '',
-- SECURITY DEFINER, SET row_security = off all preserved.
CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id bigint, p_package_instance_id bigint DEFAULT NULL
)
RETURNS TABLE(/* unchanged signature */)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
  /* full body — single substitution as above */
$function$;

REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated, service_role;
```

The migration file will contain the full verbatim view/function bodies (not abbreviated). Bodies copied from current `pg_get_viewdef` / `pg_get_functiondef` with exactly one substitution per artefact:

| Artefact | Before | After |
|---|---|---|
| `v_client_package_dashboard.action_items_agg` | `cai.package_id AS package_instance_id` + `WHERE cai.package_id IS NOT NULL` + `GROUP BY cai.package_id` | `cai.package_instance_id` everywhere |
| `v_client_package_whats_next.combined` (first SELECT) | `cai.package_id AS package_instance_id` | `cai.package_instance_id` |
| `get_client_package_dashboard.action_items_agg` | `cai.package_id` (3 occurrences) | `cai.package_instance_id` |

---

## Migration E — Step 6: backfill RPC

`supabase/migrations/<ts>_phase5_e_backfill_released_stage_tasks.sql`

```sql
-- =============================================================
-- Phase 5 / Step 6 — rpc_backfill_released_stage_tasks
-- Lock impact: per-stage row locks via FOR UPDATE inside publish loop; brief.
-- Pre-deploy DRY-RUN (run before invoking the RPC):
--   SELECT si.id AS stage_instance_id, count(cti.id) AS ctis_to_publish
--     FROM public.stage_instances si
--     JOIN public.client_task_instances cti ON cti.stageinstance_id = si.id
--    WHERE si.released_client_tasks = true
--      AND cti.published_action_item_id IS NULL
--      AND COALESCE(cti.is_archived,false) = false
--    GROUP BY si.id
--    ORDER BY si.id;
--   -- Expected: 27 stages / 127 CTIs at audit time.
-- Post-execution verification:
--   SELECT count(*) FROM public.client_task_instances cti
--     JOIN public.stage_instances si ON si.id = cti.stageinstance_id
--    WHERE si.released_client_tasks = true
--      AND cti.published_action_item_id IS NULL
--      AND COALESCE(cti.is_archived,false) = false;            -- expect 0
--   SELECT count(*) FROM public.client_action_items
--    WHERE source='stage_rule' AND package_instance_id IS NULL; -- expect 0
-- Idempotency: re-runs are no-ops (inner publish filters published_action_item_id IS NULL).
-- Rollback: DROP FUNCTION public.rpc_backfill_released_stage_tasks();
--   (Backfilled action items would need manual removal if undesired —
--    safer to leave them in place.)
-- =============================================================

CREATE OR REPLACE FUNCTION public.rpc_backfill_released_stage_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_stage_inst_id   bigint;
  v_stage_result    jsonb;
  v_stages_run      integer := 0;
  v_total_published integer := 0;
  v_total_skipped   integer := 0;
  v_results         jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_uid) THEN
    RAISE EXCEPTION 'Vivacity staff only' USING ERRCODE = '42501';
  END IF;

  FOR v_stage_inst_id IN
    SELECT DISTINCT si.id
      FROM public.stage_instances si
      JOIN public.client_task_instances cti ON cti.stageinstance_id = si.id
     WHERE si.released_client_tasks = true
       AND cti.published_action_item_id IS NULL
       AND COALESCE(cti.is_archived, false) = false
     ORDER BY si.id
  LOOP
    v_stage_result := public.rpc_publish_stage_tasks(v_stage_inst_id::integer);
    v_stages_run      := v_stages_run + 1;
    v_total_published := v_total_published + COALESCE((v_stage_result->>'published_count')::integer, 0);
    v_total_skipped   := v_total_skipped   + COALESCE((v_stage_result->>'skipped_count')::integer,   0);
    v_results         := v_results || jsonb_build_array(v_stage_result);
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    NULL, v_uid, 'backfill_released_stage_tasks', 'system', NULL,
    jsonb_build_object(
      'stages_run',      v_stages_run,
      'total_published', v_total_published,
      'total_skipped',   v_total_skipped
    )
  );

  RETURN jsonb_build_object(
    'success',         true,
    'stages_run',      v_stages_run,
    'total_published', v_total_published,
    'total_skipped',   v_total_skipped,
    'per_stage',       v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_backfill_released_stage_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_backfill_released_stage_tasks() TO authenticated, service_role;
```

Open question on `client_audit_log.tenant_id` nullability — if `NOT NULL`, we'll log per-stage inside the loop instead. Will inspect the column before writing the file.

---

## ⚠️ Sequencing gate

Before Step 7, do all of:
1. Migrations A–E deployed.
2. Backfill executed: `SELECT public.rpc_backfill_released_stage_tasks();` (as a Vivacity staff user).
3. Dry-run query returns 0 rows.
4. Smoke-check `v_client_package_whats_next` and `get_client_package_dashboard` for one tenant.

Only then proceed with frontend removals.

---

## Step 7 — Frontend (no DB changes)

### 7a · `src/hooks/useClientAllTasks.ts`
- Remove the entire "Stage tasks pipeline" block (current lines 56–106): `package_instances` fetch, `stage_instances` fetch with `released_client_tasks = true`, `client_task_instances` fetch, `clientTaskIds`/`stageIdSet`/`stageInstances`/`taskRows` variables.
- Remove `stageInstanceMap` construction (lines 188–201) and the `stageTaskItems` array (lines 203–231).
- In the "Parallel lookups" block, drop the `client_tasks` query (no longer needed) and gate `packages`/`stages`/`users` purely on `actionItems`-derived sets (`packageIdSet`/`stageIdSet` are still populated by the action-item loop at lines 124–127).
- Final return becomes `return actionItemTasks.sort(...)` using the same sort comparator.
- `UnifiedTask.source` keeps `"stage_task" | "action_item"` for type back-compat with consumers, but only `"action_item"` values are produced. Note in comment that `"stage_task"` is reserved for a future migration window and can be narrowed in Phase 6.
- Remove unused `priority`-stage normalisation paths (none — `normalisePriority` is shared).
- `id: number | null` field becomes always-null for action items; consumers already handle null.

### 7b · `src/pages/ClientTasksPage.tsx`
- `isTaskCompleted` keeps both branches (harmless — stage_task branch is now dead). Leave for type stability; remove in Phase 6 alongside the `source` union narrowing.
- No render path is `source === 'stage_task'`-specific in this file (rendering is uniform). Verified by re-reading lines 1–260; nothing further to remove here.

### 7c · `src/components/client/PackageStagesManager.tsx`
- Remove from `StageRowProps`: `onReleaseClick`.
- Remove the entire block lines 212–251 (the `stage.released_client_tasks ?` ternary containing the "Released" badge with Recall button **and** the "Release tasks" button). Keep the existing "Publish to portal" button (lines 197–211) — that is the Phase 5 replacement.
- Remove `toggleReleaseClientTasks` (lines 408–~435).
- Remove the Release/Recall `AlertDialog` (lines ~770–805) and any `releaseConfirm` state / setter.
- Remove `onReleaseClick={(s) => setReleaseConfirm(s)}` from the `<StageRow ... />` props.
- Keep the SELECT of `released_client_tasks` / `released_client_tasks_date` columns inside the stages query (line 537) so the badge state could be re-introduced if needed; OR strip them. Decision: **strip them** to keep dead-code out, since the column is deprecated.
- Removed icons: `Undo2` import becomes unused — drop from the lucide-react import.

---

## Step 8 — Post-deploy verification (runbook)

1. `SELECT public.rpc_backfill_released_stage_tasks();` → record `stages_run`, `total_published`.
2. Re-run pre-deploy dry-run → expect 0 rows.
3. For one known package instance, compare:
   ```sql
   SELECT open_tasks, overdue_tasks FROM public.get_client_package_dashboard(<tenant>, <inst>);
   SELECT count(*) FILTER (WHERE completed_at IS NULL AND COALESCE(status,'open') NOT IN ('completed','cancelled')) AS open,
          count(*) FILTER (WHERE due_date < now()::date) AS overdue
     FROM public.client_action_items WHERE package_instance_id = <inst>;
   ```
4. Open Client Tasks page in preview as a portal user that had released stage tasks before backfill — confirm the same task rows are still visible, now as action items.
5. Open Package Stages page in preview — confirm the Release/Recall UI is gone, Publish-to-portal button remains.

---

## Summary of changes

- **Schema**: `client_action_items.package_instance_id` added (FK to `package_instances`, partial index). `released_client_tasks` documented as deprecated.
- **Data**: 4 existing rows back-resolved; 127 unreleased CTIs across 27 stages published via backfill RPC.
- **Functions**: `rpc_publish_stage_tasks` now populates instance id; `rpc_create_action_item` accepts optional `p_package_instance_id`; new `rpc_backfill_released_stage_tasks` (staff-gated).
- **Views/RPCs**: `v_client_package_dashboard`, `v_client_package_whats_next`, `get_client_package_dashboard` all join on `package_instance_id` — fixes the silent counts bug.
- **Frontend**: `useClientAllTasks` simplified to action-items-only; Release/Recall UI removed from `PackageStagesManager`.

## Benefits
- Correct package-instance scoping in every dashboard surface (currently mis-joining on template ids).
- Single source of truth for client-visible tasks (`client_action_items`); deprecates the dual-path legacy CTI render.
- Idempotent, staff-gated backfill leaves no orphaned visible tasks.
- All new functions follow project hardening standard (`search_path = ''`, fully qualified, REVOKE PUBLIC + explicit GRANT).

## Risk assessment

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| ADD COLUMN lock spike | Very Low | Low | 31 rows; sub-ms. |
| Wrong backfill of `package_instance_id` for existing 4 rows | Low | Low | Join via CTI → `stageinstance_id` is deterministic; unmatched rows stay NULL. |
| Dashboard view rebuild invalidates dependent objects | Low | Low | `CREATE OR REPLACE VIEW` retains signatures; no DROP CASCADE. |
| `DROP FUNCTION` for `rpc_create_action_item` invalidates a caller mid-deploy | Low | Medium | Wrapped in same migration as recreate; window < 1 ms. |
| Backfill RPC executed before D-migration | None — backfill calls `rpc_publish_stage_tasks` which is already updated in B | — | — |
| Frontend removed before backfill executed | Medium if sequencing skipped | High (orphaned tasks) | Gate (above) is explicit; document in PR description. |
| Re-running backfill | None (idempotent) | — | Inner filter `published_action_item_id IS NULL`. |
| RLS regression on new column | None — column-agnostic policies | — | Verified `cai_portal_select` / `cai_portal_update` scope by tenant_id only. |
| FK on `package_id` left missing | Low | Low | Tracked for Phase 6 (D3). |
| `released_client_tasks` column left inert | Low | Low | `COMMENT ON COLUMN` flags as deprecated; UI surface removed. |

## Outstanding micro-decision
Whether the backfill RPC's audit-log insert should set `tenant_id` per-stage (loop-side) or `NULL` once at the end. I will inspect `client_audit_log.tenant_id` nullability before writing Migration E and choose the safe option (per-stage if NOT NULL).

Awaiting approval to switch to build mode and write migrations A–E plus the frontend edits in 7a/7b/7c.