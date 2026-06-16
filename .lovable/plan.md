# Phase 4 — Prompt 2 implementation plan

Two deliverables, in this order:

1. One Supabase migration that creates `public.rpc_publish_stage_tasks(integer)` exactly as approved.
2. UI edit in `src/components/client/PackageStagesManager.tsx` — add a "Publish tasks" action on each `StageRow` that calls the RPC, while leaving the legacy Release/Recall control in place.

No other files change.

---

## 1. Migration: `rpc_publish_stage_tasks`

Single migration file. SQL body is the approved §2 verbatim — function body, REVOKE/GRANT block, and COMMENT. Pre-deploy verification (§3) is included as SQL comments at the top; post-deploy verification (§4) is included as SQL comments at the bottom. Nothing in those comment blocks executes — they exist as a runnable checklist for the reviewer.

Structure of the migration:

```text
-- ============================================================
-- Phase 4 · rpc_publish_stage_tasks
-- ============================================================
-- PRE-DEPLOY VERIFICATION (run manually before applying)
--   §3.a  column-shape check on client_action_items
--   §3.b  is_vivacity_team_safe exists
--   §3.c  dd_action_status('todo') / dd_priority('medium') active
--   §3.d  FK client_task_instances_published_action_item_id_fkey present
--   §3.e  baseline counts on the chosen test stage instance
-- (full SQL preserved as comments)

CREATE OR REPLACE FUNCTION public.rpc_publish_stage_tasks(p_stage_instance_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
  -- approved §2 body, unchanged:
  --   auth + is_vivacity_team_safe gate
  --   resolve stage_id / tenant_id / package_id from stage_instances + package_instances
  --   FOR UPDATE OF cti loop over unpublished, non-archived CTIs
  --   INSERT into client_action_items with the approved field mapping
  --     (tenant_id int, client_id text, source='stage_rule', item_type='client',
  --      status='todo', priority='medium', related_entity_type='stage_task',
  --      related_entity_id = cti.id::text)
  --   UPDATE client_task_instances.published_action_item_id back-pointer
  --   skipped_count per D1
  --   INSERT into client_audit_log per D4 (entity_type='stage_instance',
  --     action='publish_stage_tasks', details jsonb with counts + action_item_ids)
  --   RETURN jsonb { success, stage_instance_id, published_count,
  --                  skipped_count, action_item_ids }
  -- Inline comment retained: Phase 5 cleanup B1 (rpc_create_action_item double timeline)
$function$;

REVOKE ALL ON FUNCTION public.rpc_publish_stage_tasks(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_publish_stage_tasks(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_publish_stage_tasks(integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_publish_stage_tasks(integer) TO service_role;

COMMENT ON FUNCTION public.rpc_publish_stage_tasks(integer) IS
  'Phase 4: converts unpublished client_task_instances for a stage instance into client_action_items. Staff-only. Idempotent via published_action_item_id back-pointer.';

-- ============================================================
-- POST-DEPLOY VERIFICATION (run manually after applying)
--   §4.a  pg_proc: prosecdef=true, proconfig has search_path=
--   §4.b  routine_privileges: only authenticated + service_role
--   §4.c  empty-stage smoke test returns zero counts
--   §4.d  populated-stage call returns published_count > 0
--   §4.e  join CTI → CAI shows back-pointers + field mapping
--   §4.f  second call is idempotent (published=0, skipped=N)
--   §4.g  client_timeline_events fired exactly once per CAI
--   §4.h  client_audit_log has the publish_stage_tasks row
--   §4.i  portal-user JWT call returns 42501
-- (full SQL preserved as comments)
```

No DDL on tables, no RLS or FK changes. Function is `SECURITY DEFINER` with `SET search_path = ''` and every reference fully schema-qualified. Audit row goes to `public.client_audit_log` (text `entity_id`, staff-only RLS already in place) because `public.audit_events.entity_id` is strict `uuid NOT NULL` and cannot accept a bigint stage id.

---

## 2. UI change: `src/components/client/PackageStagesManager.tsx`

Scope is the `StageRow` action cluster around lines 144–183 plus a small mutation hook at the top of `StageRow`. Everything else in the file (`toggleReleaseClientTasks`, the Release/Recall AlertDialog at the bottom, sorting, counts, audit prompt) stays untouched.

### Behavior

Add a new "Publish tasks" button rendered next to the existing Release/Recall control. Both controls coexist:

- **New button — "Publish tasks to portal" / "Republish tasks":**
  - Label is `"Publish tasks to portal"` when `released_client_tasks === false` OR no tasks have been published yet for this stage instance. Label switches to `"Republish tasks"` once any CTI on the stage has `published_action_item_id IS NOT NULL`.
  - On click: `supabase.rpc('rpc_publish_stage_tasks', { p_stage_instance_id: stage.id })`.
  - While the call is in-flight: button is disabled and shows a `Loader2` spinner (same pattern already used elsewhere in this file).
  - On success:
    - If `data.published_count > 0` → `toast({ title: \`${data.published_count} tasks published to client portal\` })`.
    - Else if `data.published_count === 0 && data.skipped_count > 0` → `toast({ title: 'All tasks already published' })`.
    - Else → `toast({ title: 'No tasks to publish' })` (defensive fallback).
    - Invalidate React Query cache so the stage list refreshes. The hook lives in `src/hooks/use-client-package-stages.ts`; invalidate its query key (`['client-package-stages', packageInstanceId]` / equivalent — exact key read from that file before patching). Also invalidate `['client-all-tasks']` so the unified portal list refreshes.
  - On error: `toast({ title: 'Failed to publish tasks', description: error.message, variant: 'destructive' })`.

- **Existing Release/Recall control:** unchanged. It still flips `stage_instances.released_client_tasks` so staff can hide the legacy stage-task list while the new action items live on.

### Knowing whether tasks are already published

`StageRow` already pulls `useStageCounts(stage.id)`. To drive the label switch without adding a second round-trip, extend the count fetch by one number — `publishedCount = COUNT(*) FROM client_task_instances WHERE stageinstance_id = :id AND published_action_item_id IS NOT NULL` — and surface it as `useStageCounts(...).publishedClientTasks`. Falls back gracefully to `0` while loading; label defaults to "Publish tasks to portal" until the count resolves.

(If touching `useStageCounts` is out of scope, alternative is a tiny local query inside `StageRow` keyed on `stage.id`. Plan favors the `useStageCounts` extension because the counts hook already runs for every row.)

### Cache invalidation

Use the existing `useQueryClient` import pattern already present elsewhere in the package area (e.g. `ClientPackagesTab.tsx`). After a successful RPC call:

```ts
queryClient.invalidateQueries({ queryKey: ['client-package-stages', packageInstanceId] });
queryClient.invalidateQueries({ queryKey: ['stage-counts', stage.id] });
queryClient.invalidateQueries({ queryKey: ['client-all-tasks'] });
```

Exact key names will be confirmed by reading the hook files immediately before editing; the call shape stays the same.

### Visual placement

Render the new button as a small ghost `Button` (consistent with the existing `Undo2` recall icon) carrying a `Send`-style label, placed immediately before the "Release tasks" / "Tasks Released" badge cluster. No new icons imported beyond what's already in the file's `lucide-react` import.

---

## 3. Verification after both changes apply

- `supabase--linter` clean for the new function (security definer + locked-down grants).
- Staff session: click "Publish tasks to portal" on a stage with unpublished CTIs → toast reports correct count, badge switches to "Republish tasks", stage list refreshes, and unified portal Tasks page shows the new action items.
- Second click on the same stage → "All tasks already published" toast, no duplicates in `client_action_items`, no duplicate `client_timeline_events`.
- Recall control still toggles `released_client_tasks` independently and does not touch action items.
- Portal-user impersonation: button is not visible (the row only renders for staff anyway), and any direct RPC call returns `42501`.

---

## 4. Risk assessment

| # | Risk | Mitigation |
|---|---|---|
| R1 | Concurrent publish clicks on same stage | `FOR UPDATE OF cti` serialises within Postgres |
| R2 | Double timeline events | Trigger does the insert; RPC never inserts manually. Pre-existing B1 in `rpc_create_action_item` flagged in code comment for Phase 5 |
| R3 | Portal user invokes RPC | `is_vivacity_team_safe` gate + REVOKE PUBLIC/anon |
| R4 | UI label flicker before counts load | Default label "Publish tasks to portal" is correct for the unpublished case; switches once counts resolve |
| R5 | Stale cache after publish | Three targeted `invalidateQueries` calls cover stage list, per-stage counts, and unified portal tasks |
| R6 | Existing Recall flow regression | Recall handler is untouched; new button is additive |
| R7 | `client_audit_log` RLS blocks insert | Staff-only WITH CHECK matches the in-function gate; passes for every caller that reaches the insert |

Overall risk: **Low**. Additive function + additive button; no schema, RLS, FK, or trigger edits elsewhere. Backward-compatible with the Phase 1 release/recall toggle and the Phase 2/3 unified portal Tasks view.

## Summary
One migration that creates the staff-only `rpc_publish_stage_tasks` RPC verbatim from the approved §2, with §3 and §4 verification queries preserved as runnable SQL comments. One UI patch that adds a Publish/Republish button to each `StageRow`, wires it to the RPC with optimistic toast + spinner + query invalidation, and leaves the legacy Release/Recall control untouched.

## Benefits
- Single-click hand-off from internal stage tasks to portal action items, fully audited and idempotent.
- No regression to the existing release/recall workflow.
- Verification checklist travels with the migration for auditors.
