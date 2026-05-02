# Dashboard view patch — Hours from time_entries

## Why

Across 94 active `package_instances`:
- 0 have `hours_included` set → every client card shows "no allowance set"
- Only 2 have `hours_used` set → 92 cards show 0:00

Both columns are abandoned. The staff burndown reads `packages.total_hours` for allowance and sums `time_entries.duration_minutes` for usage, which is why staff see `7:53 / 91:00` while the same package on the client card shows `0:00 / —`.

## Scope

One CREATE OR REPLACE VIEW migration. No table DDL. No app code changes. Same view shape — same columns, same hooks, same components.

Out of scope (flag in PR, do not fix): friendly package name on the card; pre-period mis-attributed time entries; reviving `pi.hours_used` via a trigger.

## Migration

`supabase/migrations/<ts>_v_client_package_dashboard__patch_hours_from_time_entries.sql` — one statement that replaces the existing view with `security_invoker = true`. Four edits to the existing definition:

1. **New CTE** `hours_agg` — sums `time_entries.duration_minutes / 60` per `package_instance_id`, scoped to `te.start_at >= pi.start_date` (matches staff burndown; excludes pre-period mis-attributions). Filters out null/zero durations. Also exposes `max(te.start_at)` as `max_te_at` for activity tracking.

2. **Hours columns in SELECT** — switch source:
   - `hours_total` = `coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0)`
   - `hours_used`  = `coalesce(ha.hours_used_calc, 0)`
   - `hours_remaining` and `hours_pct_used` recomputed from the same inputs
   - `hours_included` and `hours_added` columns retained as-is for backward compatibility (consumers may still read them, but `hours_total` no longer depends on `hours_included`)

3. **Activity timestamps** — both `greatest(...)` expressions get `coalesce(ha.max_te_at, 'epoch'::timestamptz)` added:
   - The `last_activity_at` SELECT column
   - Both `greatest(...)` blocks inside the `status_pill` CASE (the 30-day "stuck" branch and the 14-day "drifting" branch)
   - Plus the hours-pct branches in `status_pill` are recomputed against the new `total_hours` denominator

4. **New JOIN** — `left join hours_agg ha on ha.package_instance_id = pi.id`.

5. **Updated comment** documenting that `pi.hours_used` and `pi.hours_included` are abandoned and the new sourcing.

Everything else from the current definition — `stage_agg` (status_id IN (2,3)), `task_instances_agg` (released_client_tasks gate), `pinned`, `notes_agg`, `tasks_agg`, the pinned-note severity rules — stays identical.

## Sanity SQL (capture in PR description)

```sql
-- AHMRC M-DR — should show ~17.5h / 91h
select package_instance_id, hours_used, hours_total, hours_remaining, hours_pct_used,
       open_tasks, stages_complete, status_pill, last_activity_at
from v_client_package_dashboard
where package_instance_id = 15152;

-- Reconcile against time_entries directly
select round(sum(duration_minutes)::numeric/60, 2) as period_hours
from time_entries te join package_instances pi on pi.id = te.package_instance_id
where te.package_instance_id = 15152 and te.start_at >= pi.start_date;

-- Cross-platform coverage
select count(*) filter (where hours_used > 0)::int  as packages_with_hours_logged,
       count(*) filter (where hours_total > 0)::int as packages_with_allowance,
       count(*)::int                                as total_packages
from v_client_package_dashboard;
```

Expected: AHMRC `hours_used ≈ 17.5`, `hours_total = 91`, `hours_pct_used ≈ 0.19`. `packages_with_allowance` should be 94/94 active. `packages_with_hours_logged` should jump from ~2 to most of the 94.

## Browser smoke (after deploy)

- SuperAdmin impersonating AHMRC Training → `/client/packages` → M-DR card Hours tile shows real `≈ 17.5 / 91` numbers, "no allowance set" sub-line gone.
- Verify one additional tenant moves off `0:00 / —`.

## Behaviour-change note for PR

`hours_used` and `hours_total` will move on every existing tenant. This is the fix for the abandoned `pi.hours_used` / `pi.hours_included` fields, **not** a regression. Client portal still sums all hours (no `is_billable` distinction surfaced — that's staff-side only).

## Won't touch

- `package_instances.hours_used` / `hours_included` writes — fields stay abandoned.
- `v_client_package_stages`, `v_client_package_whats_next`, `v_client_package_hours_timeline`.
- Staff burndown widget.
- Any React/TS code.
