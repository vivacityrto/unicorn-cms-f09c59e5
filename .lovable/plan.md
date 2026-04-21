

## Plan: SuperAdmin — Package → Course Mapping

A new SuperAdmin-only page at `/superadmin/academy/package-course-rules` to control which Academy courses auto-enrol when a client holds a given package. The backfill RPC `fn_academy_backfill_enrollments_for_rule` is already deployed; we'll add one new helper RPC for the dashboard stats.

### Files created
1. **`src/pages/superadmin/AcademyPackageCourseRulesPage.tsx`** — main page (header, 4 stat tiles, tabs, FAB).
2. **`src/components/academy/admin/rules/RulesMatrixTab.tsx`** — courses-as-rows × packages-as-columns toggle grid with frozen first row/column, zebra striping, filters, search, optimistic toggling, bulk actions ("Select row…", "Select column…", "Copy mappings from…").
3. **`src/components/academy/admin/rules/RulesListTab.tsx`** — sortable/filterable table with Backfill + Archive row actions.
4. **`src/components/academy/admin/rules/BackfillConfirmModal.tsx`** — preview-count modal that runs the affected-tenants/users/new-enrollments query, then calls the RPC on confirm.
5. **`src/components/academy/admin/rules/CreateRuleModal.tsx`** — quick-add: 1 package × N courses + optional "Backfill existing clients" checkbox.
6. **`src/hooks/academy/useAcademyPackageRules.ts`** — react-query hooks: `usePackagesActive`, `usePublishedCourses`, `useAllPackageCourseRules`, `useRuleStats`, `useToggleRule`, `useBackfillRule`, `useArchiveRule`, `useCreateRules`, `useCopyRuleMappings`, `useBackfillPreview`.

### Files edited
- **`src/App.tsx`** — register route `/superadmin/academy/package-course-rules` (lazy import, `ProtectedRoute requireSuperAdmin`).
- **`src/components/DashboardLayout.tsx`** — add nav item "Package → Course Rules" under the Academy Builder section.

### Migration (one new RPC)
`fn_academy_rule_dashboard_stats()` — security definer, returns single row:
```sql
RETURNS TABLE (
  active_rules bigint,
  total_mappings bigint,
  auto_enrollments_to_date bigint,
  unmapped_packages bigint
)
```
Body computes the four queries listed in the spec. Restricted to vivacity staff via `is_vivacity()` guard inside the function.

No schema changes to any table. RLS on `academy_package_course_rules` already enforces staff-only writes.

### Matrix tab — interaction details
- Columns grouped by `package_type` with a coloured band (project=blue, membership=purple, regulatory_submission=amber, audit=teal); chips reuse the same palette.
- Course rows show title + a small audience chip (icon + label). Tap row header → side sheet with course detail (title, audience, lesson count, status).
- Cell click logic:
  - No rule → `INSERT (package_id, course_id, is_active=true, created_by=auth.uid())`.
  - Rule active → `UPDATE is_active = false`.
  - Rule inactive → `UPDATE is_active = true`.
- Optimistic update via react-query `onMutate` / rollback in `onError` + sonner toast.
- Filters: package type (multi), course audience (multi), Show (All/Mapped/Unmapped), search (case-insensitive substring on course title or package name; filters both axes).
- Sticky first column (course header) and first row (package header) using `position: sticky` with z-index layering.
- Bulk actions menu (top-right):
  - **Select row…** → choose course → modal with package checkboxes → batch upsert.
  - **Select column…** → choose package → modal with course checkboxes → batch upsert.
  - **Copy mappings from…** → pick source package + target package → copies all active rules (upsert with `ON CONFLICT (package_id, course_id) DO UPDATE SET is_active = true`).

### Rules list tab
- Columns: Package (name + type chip), Course (title + audience chip), Status (toggle), Created (relative time), Created by (resolved via `users` join on `user_uuid`), Enrollments (count of `academy_enrollments` where `course_id = rule.course_id` and `source LIKE 'auto_package%'` and tenant has matching `package_instances`), Actions.
- Default sort `created_at DESC`; column sort + filters (package, course, status, date range).
- Row actions:
  - **Backfill** → opens `BackfillConfirmModal`. Preview query exactly as in spec; on confirm calls `supabase.rpc('fn_academy_backfill_enrollments_for_rule', { p_rule_id })`.
  - **Archive** → confirmation, sets `is_active = false`.

### Create Rule modal (FAB)
- Searchable single-select package + searchable multi-select courses + "Backfill existing clients?" checkbox (default off, with explanatory help text).
- On submit: bulk insert one row per course with `ON CONFLICT (package_id, course_id) DO UPDATE SET is_active = true` (reactivates archived rules). If backfill checked, fan-out RPC calls per newly inserted/reactivated rule and sum the returned counts. Toast: `Created {n} rules. Backfilled {m} enrollments.`

### Real-time sync
Single channel `rules-changes` subscribed to `postgres_changes` on `academy_package_course_rules` for `event: '*'`. On any payload → invalidate `["academy-package-course-rules"]` query. Cleanup on unmount.

### Stats tiles (top bar)
Initial implementation calls the new `fn_academy_rule_dashboard_stats` RPC. Skeleton state while loading; refetches on rule mutations.

### Empty / error / permission states
- Empty rules: matrix renders all-unchecked + banner "No mappings yet. Click any cell to create your first rule, or use quick-add."
- Write rejected by RLS: catch the error → toast "You need SuperAdmin access to modify rules."
- Backfill returns 0: toast "No new enrollments needed — all affected users were already enrolled."

### Out of scope (per spec)
- Time-windowed rules, RTO/CRICOS conditional rules, notification email triggers.

### Acceptance verification
After build, I'll seed-toggle one cell in the matrix to confirm INSERT works, toggle it again to confirm soft-disable, run a backfill in preview mode against one of the 30 active packages, and verify a new `academy_enrollments` row appears with `source = 'auto_package_backfill'`.

