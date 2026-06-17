## Phase 6 cleanup

Single migration file (two changes) + TypeScript cleanup in two files. No other files touched.

### 1. Migration — `supabase/migrations/<new>_phase6_cleanup.sql`

**Pre-deploy verification (run + confirm 0; included as SQL comment in the migration header):**
```sql
-- Pre-deploy check (must return 0 rows):
-- SELECT cai.id, cai.package_id
--   FROM public.client_action_items cai
--   WHERE cai.package_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.packages p WHERE p.id = cai.package_id);
```
Already verified now: 0 orphan rows.

**Change A — recreate `public.rpc_publish_stage_tasks`** with `CREATE OR REPLACE FUNCTION`, keeping the existing signature, `SECURITY DEFINER`, `SET search_path = ''`, and all other logic. Diff vs current definition:
- Remove `v_package_id bigint;` from the DECLARE block.
- Change the `SELECT … INTO` to: `SELECT si.stage_id, si.packageinstance_id, pi.tenant_id INTO v_stage_id, v_pkg_inst_id, v_tenant_id FROM public.stage_instances si JOIN public.package_instances pi ON pi.id = si.packageinstance_id WHERE si.id = p_stage_instance_id;` (drop `pi.package_id` and `v_package_id`).
- In the `INSERT INTO public.client_action_items (...)` column list, remove `package_id`; in `VALUES (...)`, remove `v_package_id`. `package_instance_id` (Phase 5 canonical field) remains.
- Audit log block, return jsonb, status/priority defaults, and `client_task_instances` update all unchanged.
- No GRANT changes needed (function already granted; `CREATE OR REPLACE` preserves them).

**Change B — add validated FK on `client_action_items.package_id`:**
```sql
ALTER TABLE public.client_action_items
  ADD CONSTRAINT fk_client_action_items_package_template
  FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.client_action_items
  VALIDATE CONSTRAINT fk_client_action_items_package_template;
```

**Post-deploy verification (included as SQL comment at end of migration):**
```sql
-- Post-deploy checks:
-- 1) FK is valid:
-- SELECT conname, convalidated FROM pg_constraint WHERE conname = 'fk_client_action_items_package_template';
-- 2) Function no longer writes package_id:
-- SELECT pg_get_functiondef('public.rpc_publish_stage_tasks'::regproc) NOT LIKE '%v_package_id%' AS clean;
```

### 2. TypeScript cleanup

**`src/hooks/useClientAllTasks.ts`** (lines 5–27):
- Change `source: "stage_task" | "action_item"` → `source: "action_item"`.
- Remove the two back-compat comment lines above it.

**`src/pages/ClientTasksPage.tsx`:**
- Lines 63–66: simplify `isTaskCompleted` to `return t.actionItemStatus === "done";` (drop the `stage_task` branch).
- Line 453: remove `const isActionItem = task.source === "action_item";`.
- Lines 494–522 (assignee cell): drop the `isActionItem ?` guard, keep only the `<Select>` branch; remove the `: (<span>{task.assigneeName ?? "—"}</span>)` fallback.
- Lines 524–553 (priority cell): same — keep the `<Select>` branch, remove the `<Badge>` fallback.
- Lines 572–612 (status cell): keep the action-item `<Select>` branch, remove the `<Badge variant=… >{getStatusLabel(...)}</Badge>` legacy fallback. `getStatusLabel`/`statuses` may then become unused — remove them and their imports/props if so (verify with a search after the edit).

### Risks & compatibility
- **Function change:** signature and return shape unchanged; callers (publish flow) unaffected. `client_action_items.package_id` will simply be NULL for newly published stage tasks — this matches Phase 5 intent (`package_instance_id` is canonical).
- **FK:** added `NOT VALID` then `VALIDATE` separately to minimise lock duration; `ON DELETE SET NULL` matches existing nullable column semantics. 0 orphans confirmed pre-deploy.
- **TS narrowing:** `UnifiedTask.source` is now a single literal; any external consumer still typing `"stage_task"` will get a compile error — acceptable per request (dead code). Runtime data already only emits `"action_item"`.
- **Audit trail:** publish_stage_tasks still logs to `client_audit_log` with full payload — unchanged.

### Benefits
- Removes the last writer of the deprecated `package_id` column on new rows.
- Enforces referential integrity on legacy `package_id` going forward.
- Deletes dead UI branches, shrinking `ClientTasksPage.tsx` and clarifying that all rows are action items.
