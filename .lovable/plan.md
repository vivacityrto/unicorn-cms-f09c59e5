## Tenant Packages Dashboard — Week 1 (Quick Wins)

Turn the client-facing `/packages` page from a passive list into an active dashboard. Strictly additive: one new SQL view, one new hook, four new presentational components, and a small re-arrangement of the existing `PackageCard` in `ClientPackagesPage.tsx`. No legacy data, columns, or routes are touched.

### Resolved questions (from exploration)

1. **Pinned-note source of truth.** Canonical surface is `public.notes`, filtered by `parent_type = 'package_instance'`, `parent_id = package_instance_id`, `is_pinned = true`. Confirmed by the existing `src/components/client/PackagePinnedNote.tsx` reading exactly this. `client_notes` is the contact/client-relationship notes table and is not the package banner source. The view will read from `notes`.

2. **`last_activity_at` join path.** There is no single canonical activity surface. `consult_entries` has no FK to a package and would require a fragile join chain. We will compute `last_activity_at` as `greatest()` of three robust signals, all keyed directly off the package:
   - `notes.updated_at` where `parent_type = 'package_instance'` and `parent_id = pi.id`
   - `stage_instances.updated_at` where `packageinstance_id = pi.id`
   - `client_action_items.updated_at` where `package_id = pi.id`
   Implemented as a CTE so the planner doesn't fan out.

3. **Action-button routes.** No confirmed booking, tasks-by-package, or CSC-message route exists today. We stub:
   - Book consult → `/consults/new?package_instance_id={id}` with `// TODO(week1-routes)`
   - Open tasks → `/tasks?package_instance_id={id}` with `// TODO(week1-routes)`
   - Message CSC → opens `mailto:` to manager's email when known, else disabled with tooltip; `// TODO(week1-routes)`

4. **Card vs detail.** The client-portal package surface today is `src/components/client/ClientPackagesPage.tsx` (rendered through `src/pages/client/ClientPackagesWrapper.tsx`). It renders one `PackageCard` per active package — no separate detail page is wired in the client layout. We apply the four pieces inside `PackageCard` only, extracting the four sub-components so a future detail view can reuse them.

5. **Schema gotchas confirmed.**
   - `package_instances.tenant_id` is `bigint`. `notes.tenant_id` is `bigint`. `stage_instances` has no `tenant_id` (joined via `packageinstance_id`). `client_action_items.tenant_id` is `integer` and `client_task_instances` has no `tenant_id` at all (joined via `stageinstance_id`). Casts handled inside the view.
   - `packages` has no `delivery_model` column. The view exposes `package_type` and `progress_mode` instead and the UI labels it accordingly. Avoids inventing a field.
   - `package_instances.hours_used` is already aggregated `numeric` — used as-is, not re-summed from `consult_entries`.

### Steps

1. **Migration `supabase/migrations/<ts>_v_client_package_dashboard.sql`**
   - `CREATE OR REPLACE VIEW public.v_client_package_dashboard WITH (security_invoker = true) AS …`
   - CTEs:
     - `stage_agg` — per `packageinstance_id`: `count(*)`, `count(*) filter (where completion_date is not null)`, `min(stage_sortorder) filter (where completion_date is null)`, `max(updated_at)`.
     - `tasks_agg` — union of open `client_action_items` (by `package_id`) and open `client_task_instances` (joined via `stage_instances.packageinstance_id`); aggregate `open_tasks`, `overdue_tasks` (`due_date < now()`).
     - `pinned` — `distinct on (parent_id)` from `notes` where `parent_type='package_instance'` and `is_pinned`, ordered by `updated_at desc`. Returns `note_details`, `title`, `priority`.
     - `activity` — `greatest(notes.max_updated, stage_agg.max_updated, tasks_max_updated)`.
   - Final select joins `package_instances pi` → `packages p` → CTEs. Casts: `pi.tenant_id::bigint`, `client_action_items.tenant_id::bigint` inside `tasks_agg`.
   - Computed columns: `hours_total = hours_included + coalesce(hours_added,0)`, `hours_pct_used` (safe-div), `pinned_note_severity` (case on lowercased `note_details||title` keywords: `'on hold'` → `hold`; `'urgent'`/`'overdue'` → `urgent`; else `info`), `status_pill` (rules from prompt, in order: on_hold → complete → stuck → drifting → on_track).
   - Grant: `GRANT SELECT ON public.v_client_package_dashboard TO authenticated;`. No RLS on the view itself (security_invoker delegates to underlying tables).
   - Header comment documenting purpose, column map, pinned-note source (`notes`), activity join path, and date.

2. **RLS sanity test** (`supabase/tests/v_client_package_dashboard.sql` or extend existing pattern)
   - Tenant A sees only their own row when filtering by their `package_instance_id`.
   - Tenant A filtering by tenant B's `package_instance_id` returns zero rows.
   - Super_admin sees all rows.

3. **Hook `src/hooks/use-client-package-dashboard.ts`**
   - Exports `ClientPackageDashboardRow` interface mirroring view columns (no `any`).
   - `useClientPackageDashboard(packageInstanceId)` — `maybeSingle`, explicit `.eq('tenant_id', activeTenantId)` and `.eq('package_instance_id', packageInstanceId)`, `staleTime: 30_000`, enabled only when both ids present. Mirrors the `useReleasedAudits` security pattern exactly (explicit tenant filter, comment explaining why).
   - `useClientPackageDashboards()` list variant — same explicit tenant filter, no per-package eq, returns array.

4. **UI components** (under `src/components/client/package-dashboard/`)
   - `PinnedNoteBanner.tsx` — full-card-width strip; severity → slate/amber/red; renders nothing when note is null. Click opens the existing dialog pattern from `PackagePinnedNote` (sanitised HTML). The old `PackagePinnedNote` component stays (it's used elsewhere) but `PackageCard` switches to the new banner fed from the view.
   - `PackageStatusPill.tsx` — maps `status_pill` enum to label + colour; replaces the existing `Badge` in the card header.
   - `PackageStatTiles.tsx` — `grid-cols-2 md:grid-cols-4`; tiles for Hours (with amber ≥75%, red ≥95%), Stages, Open tasks (overdue red sub-line if >0), Last activity (relative; amber 14d, red 30d).
   - `PackageActionRow.tsx` — three shadcn `Button`s in `flex gap-2 flex-wrap`; primary is Book consult. Routes per Q3 with TODOs.

5. **Wire into `ClientPackagesPage.tsx` (`PackageCard`)**
   - Call `useClientPackageDashboard(packageInstanceId)` alongside the existing `usePhaseProgress`.
   - Render order inside the card: `PinnedNoteBanner` → header (with `PackageStatusPill` instead of the existing Active badge) → `PackageStatTiles` → `PackageActionRow` → existing progress bar + phase accordion (untouched, Week 2 will replace).
   - Loading: skeleton tiles (no flicker to "0 / 0").
   - Error: small inline banner "Couldn't load package details. Refresh to retry." Page does not crash.
   - Null row: render tiles in disabled state with action buttons still present; no banner, no pill.

6. **Smoke checks** logged in PR description (Adelaide Aviation, TRAYN, one more; super_admin impersonation; empty-package tenant; network-tab inspection that every query carries `tenant_id`).

### Out of scope / queued for Week 2

Stage stepper, "What's next" task feed, multi-package collapse, client burndown chart. The existing phase accordion stays in place until Week 2 replaces it.

### Acceptance checklist

- [ ] Migration applied to dev, idempotent (`CREATE OR REPLACE VIEW`), no DDL on existing tables.
- [ ] RLS sanity test passes for tenant A / tenant B / super_admin.
- [ ] Hook uses `useClientTenant()` and explicit `tenant_id` filter (mirrors `useReleasedAudits`).
- [ ] Pinned-note source documented as `notes` in the view comment.
- [ ] Stat tiles render correct totals on Adelaide Aviation, TRAYN, one other.
- [ ] Status pill verified for at least one each of `on_track`, `drifting`, `stuck`, `on_hold`.
- [ ] Three action buttons present, routed or stubbed with `// TODO(week1-routes)`.
- [ ] No `any` in TypeScript. No untouched legacy table modified.
- [ ] Manual five-tenant smoke pass logged in PR description.
