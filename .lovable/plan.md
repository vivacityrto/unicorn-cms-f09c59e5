Implement Phase 7 cleanup exactly as designed in the prior plan. No changes to scope.

### Migration file (single file, Steps 1–8 in order, one implicit transaction)
`supabase/migrations/<timestamp>_drop_released_client_tasks.sql`

Top-of-file SQL comment block: pre-deploy verification query (unpublished CTIs on released stages must be 0) and a reference manifest of objects rewritten.

1. **`CREATE OR REPLACE VIEW public.v_client_package_dashboard`** — verbatim `pg_get_viewdef`, with `task_instances_agg` CTE deleted and `tasks_agg` collapsed to project directly from `action_items_agg`.
2. **`CREATE OR REPLACE VIEW public.v_client_package_whats_next`** — verbatim, with the CTI branch of `combined` deleted.
3. **`CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(bigint, bigint DEFAULT NULL)`** — verbatim `pg_get_functiondef`, with `task_instances_agg` CTE deleted and `tasks_agg` collapsed. Preserves: signature, RETURNS TABLE column list, `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = ''`, `SET row_security = 'off'`. `CREATE OR REPLACE FUNCTION` preserves existing EXECUTE grants to anon/authenticated/service_role.
4. **`CREATE OR REPLACE VIEW public.v_client_package_stages`** — verbatim, with output columns `released_client_tasks` and `released_client_tasks_date` deleted.
5. **`CREATE OR REPLACE VIEW public.v_client_home_feed`** — verbatim `pg_get_viewdef` with three CTEs (`cti_due_upcoming`, `cti_overdue`, `stages_released_recent`) and their three matching `UNION ALL` legs deleted. The outer `all_events(feed_section, event_type, tenant_id, package_instance_id, event_at, title, subtitle, event_uid, source_table, href, package_name)` table-alias column list is preserved exactly — order is load-bearing.
6. **`CREATE OR REPLACE VIEW public.v_admin_zero_progress_packages`** (Option A) — verbatim, with `stages_released` aggregate removed from `stage_counts`, `stages_released` output column removed from final SELECT, and the `stages_released = 0` predicate removed from the `pre_release` branch of `triage_category`.
7. **`DROP FUNCTION public.rpc_backfill_released_stage_tasks();`** — runs before column drop so no remaining function body references the columns.
8. **`ALTER TABLE public.stage_instances DROP COLUMN released_client_tasks;`** then **`ALTER TABLE public.stage_instances DROP COLUMN released_client_tasks_date;`** — metadata-only AccessExclusive, sub-second on ~6k rows.

Bottom-of-file SQL comment block: post-deploy verification queries (no view/function references `released_client_tasks`; both columns absent from `information_schema.columns`; smoke-test `SELECT … FROM public.get_client_package_dashboard(<tenant_id>)`).

All view bodies are pulled fresh from `pg_get_viewdef` and `pg_get_functiondef` immediately before writing — no reconstruction. Only the specified removals are applied.

### Step 9 — Frontend changes (same change set, after migration approval)

- **`src/hooks/use-client-package-stages.ts`** — remove `released_client_tasks` and `released_client_tasks_date` from `StageInstance` and from the `.select(...)` string.
- **`src/hooks/use-admin-zero-progress-packages.ts`** — remove `stages_released: number;` from the row type.
- **`src/pages/admin/AdminZeroProgressPackagesPage.tsx`** — remove `'stages_released'` from the `SortKey` union, the `case 'stages_released'` sort branch, the matching `<TableHead>` (with its onClick), the `<TableCell>` rendering `r.stages_released`, and the CSV header label + `String(r.stages_released)` cell.
- **`src/integrations/supabase/types.ts`** — regenerates automatically post-migration; not hand-edited.

### Verification after apply

- Run the post-deploy SQL comments from the migration.
- Confirm `AdminZeroProgressPackagesPage` renders without the removed column.
- Confirm Client Packages stage stepper still renders (no field removed from JSX, only from the row type and select string).
- Confirm `useClientHomeFeed` still returns rows (action-item legs already cover `coming_up` + `needs_attention`).

### Risk assessment (carried from prior plan)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AccessExclusive lock during DROP COLUMN | very low | low | metadata-only; sub-second |
| Missed reference fails migration | very low | low | exhaustive audit; single transaction rolls back atomically |
| `v_client_home_feed` column-order regression | low | medium | verbatim pg_get_viewdef; `all_events(...)` alias preserved |
| `triage_category` semantics shift | low | low | SuperAdmin-only; new criterion is the real signal |
| Frontend cached query shape mismatch | low | low | hooks updated same change set; React Query refetches |

### Rollback

Recreate columns as `boolean DEFAULT false` + `timestamptz` (values cannot be reconstructed but no live code path needs them); re-run captured `CREATE OR REPLACE` bodies for views/function and re-create the backfill helper from this plan's audit dump.

Ready to implement on approval.
