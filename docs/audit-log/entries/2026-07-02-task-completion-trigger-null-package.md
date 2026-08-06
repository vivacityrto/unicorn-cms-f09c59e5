# Audit: 2026-07-02 — task-completion-trigger-null-package

**Trigger:** ad-hoc (user-reported bug via screenshot — "Failed to update task status" toast on Tasks Management)
**Scope:** Diagnosed and fixed the Supabase trigger behind task completion on `tasks_tenants`. Did not touch `unicorn-kb/` or `unicorn-cms-f09c59e5/` (front-end code was not the defect).

## Findings

- Marking a task complete in Tasks Management failed with a generic "Failed to update task status" toast for any task with `package_id = NULL` (i.e. a task not attached to a package).
- Root cause: `trigger_log_task_completion` (AFTER UPDATE on `tasks_tenants`) calls `log_task_completion()`, which unconditionally inserts a row into `package_workflow_logs` including `NEW.package_id`. `package_workflow_logs.package_id` is `NOT NULL`, so for package-less tasks the insert violated the not-null constraint and rolled back the whole status-update transaction.
- Confirmed in Postgres logs: repeated `null value in column "package_id" of relation "package_workflow_logs" violates not-null constraint` entries timestamped to the user's test session.
- Reproduced directly against the reported row: `tasks_tenants.id = 4750f7d6-2326-4f45-96a2-f7fedfd376c0` ("Generate Documents in Unicorn", `tenant_id = 7528`, `package_id = NULL`).
- Front-end code (`TasksManagement.tsx`, `useClientPackageInstances.tsx`) was not at fault — both correctly surface any Postgres error as a generic toast. No code fix needed there.

## KB changes shipped
- no changes

## Codebase observations (read-only)
- unicorn-cms-f09c59e5 @ 6615c11962c9f32f9a5b16387f6e6eab4832cbdb: `TasksManagement.tsx` `updateTaskStatus()` (tasks_tenants branch, ~line 458) and `useClientPackageInstances.tsx` (~line 458) both catch and surface any Supabase error generically — this is why the toast gave no hint of the actual constraint violation. Left as-is; not in scope for this fix.

## Decisions
- Applied the fix as a direct Supabase migration rather than a Lovable prompt. This was a bug fix in an existing trigger function (not new schema/RLS/data authorship), so the root `CLAUDE.md` "Lovable production DB change sessions" protocol — which targets sessions heading toward generating a Lovable prompt — was judged not to apply; still logging here per this repo's "production DB change" intent.
- Migration `fix_log_task_completion_null_package_id` applied to project `yxkgdalkbrriasiyyrwk`: `log_task_completion()` now short-circuits with `AND NEW.package_id IS NOT NULL` in its `IF`, skipping the `package_workflow_logs` insert for package-less tasks instead of failing the transaction. Log semantics for package-linked tasks are unchanged.
- Verified via a `BEGIN; UPDATE ...; ROLLBACK;` dry run against the reported row before reporting the fix as working — no constraint error, no lasting data change from the verification step itself.

## Open questions parked
- `column client_action_items.created_by_user_id does not exist` — recurring Postgres error seen in the same log window, unrelated to this fix. Likely a stale query (edge function or view) referencing a renamed/dropped column. Not investigated this session.
- `document_activity_log_activity_type_check` and `document_activity_log.document_id` not-null violations — also recurring in the same log window, also unrelated to this fix. Worth a follow-up audit.
- Whether package-less task completions should be logged somewhere (e.g. making `package_workflow_logs.package_id` nullable) rather than silently skipped — parked; current fix preserves existing log semantics for package-linked tasks only.

## Tag
audit-2026-07-02-task-completion-trigger-null-package
