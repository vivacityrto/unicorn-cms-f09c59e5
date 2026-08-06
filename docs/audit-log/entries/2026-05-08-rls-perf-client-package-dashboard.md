# Audit: 2026-05-08 — rls-perf-client-package-dashboard

**Trigger:** ad-hoc — two production bugs reported on the Vivacity client portal  
**Scope:** Academy course lesson counts; client packages page statement timeout for direct client
logins. Test account: `briansismundo@gmail.com`, tenant 7533. Staff impersonation path was not
affected by either bug.

---

## Findings

- **Academy "0 lessons" on unenrolled course cards.** `useAcademyCourses` resolved lesson counts
  from `v_academy_course_progress`, which is enrollment-based and returns no rows for unenrolled
  users. `total_lessons` fell back to `0`. Affected all course cards on `TrainerHubPage` and
  similar hub pages for any user who had not yet enrolled in a course.

- **Packages page statement timeout (SQLSTATE 57014) on direct client login.** `v_client_package_dashboard` was created with `security_invoker = on` (migration `portal_launch_d3_07_recreate_security_definer_views_as_invoker`). Under a real client JWT, PostgreSQL evaluates RLS policies on every base table row during CTE aggregation. The policies on `client_task_instances` (22,851 rows) and `stage_instances` (6,106 rows) each called `app.user_can_access_tenant(tenant_id)` per row — a `STABLE SECURITY DEFINER` function that executes three nested subqueries per invocation. Total function invocations exceeded `statement_timeout` (8 s). Staff impersonation was unaffected because `is_vivacity_team()` short-circuits all those policies to `true`, eliminating the per-row calls.

- **Brian's data was correct throughout.** `users.tenant_id = 7533`, `tenant_users` row with
  `access_scope = 'full'`, `tenant_members` row with `status = 'active'`. The issue was never
  missing data or wrong RLS logic — only the performance cost of evaluating correct RLS logic at
  scale.

- **View CTE pre-filter attempt was additive, not a replacement.** An intermediate fix added
  `app.user_can_access_tenant(pi.tenant_id)` to each CTE's WHERE clause in the view. With
  `security_invoker = on`, the planner evaluates both the view's WHERE clause and the table's RLS
  policy as independent conditions. The function was called from both paths simultaneously, making
  total invocations worse than before the fix.

- **`notes` table (9,948 rows, `parent_type = 'package_instance'` subset) had a separate per-row
  RLS issue** using `has_tenant_access_safe(tenant_id, uid)` and `user_has_tenant_access(tenant_id)`.
  These were not addressed by the RLS semi-join migration and contributed to the timeout alongside
  `client_task_instances`.

- **`v_client_package_dashboard` remains in place** — not dropped. No other consumers found in
  the codebase at time of audit (`use-client-package-dashboard.ts` was the only caller), but the
  view is retained for safety while the RPC stabilises.

---

## Fixes shipped

### Fix 1 — Academy lesson count fallback  
`useAcademyCourses` now runs a parallel query to `academy_lessons` (filtered by `is_published = true`)
when fetching course data. `total_lessons` uses the progress view value when present (enrolled
users) and falls back to the direct lesson count otherwise (unenrolled users).  
Codebase: `unicorn-cms-f09c59e5 @ 07b64427`

### Fix 2 — RLS semi-join rewrite for `stage_instances` + `client_task_instances`  
Replaced per-row `stage_instance_tenant_id(id)` and equivalent calls in both tables' SELECT
policies with semi-join subqueries:
```sql
packageinstance_id IN (
  SELECT id FROM package_instances WHERE app.user_can_access_tenant(tenant_id)
)
```
This converts per-row function calls to a one-time hash-table build (~1,026 calls for the inner
query) plus O(1) hash probes per row. Applied as a Supabase migration during this session.

### Fix 3 — SECURITY DEFINER RPC `get_client_package_dashboard`  
Created `public.get_client_package_dashboard(p_tenant_id bigint, p_package_instance_id bigint DEFAULT NULL)`:
- `SECURITY DEFINER`, `SET row_security = off` — bypasses all base-table RLS inside the function
- Single authorization gate: `app.user_can_access_tenant(p_tenant_id)` evaluated once (parameter
  is a constant, not a column) inside the `allowed_packages` CTE
- All downstream CTEs (`stage_agg`, `task_instances_agg`, `notes_agg`, `pinned`, `hours_agg`, etc.)
  filter via `IN (SELECT id FROM allowed_packages)` — hash probes, zero additional function calls
- `notes_agg` and `pinned` filter with `n.tenant_id = p_tenant_id` directly, using `notes_tenant_id_idx`
- Returns exactly 28 columns matching `v_client_package_dashboard`; `REVOKE … FROM PUBLIC`,
  `GRANT … TO authenticated`
- Frontend hooks in `use-client-package-dashboard.ts` switched from `.from('v_client_package_dashboard')`
  to `.rpc('get_client_package_dashboard', …)` with `retry: 1` added
- `ClientPackagesPage.tsx` gained an explicit error card (`if (error)`) so future backend failures
  surface as a message rather than an infinite skeleton

Codebase: `unicorn-cms-f09c59e5 @ 07b64427`

---

## KB changes shipped

No KB changes this session. The SECURITY DEFINER RPC pattern for performance-critical
`security_invoker` views is worth capturing — see open questions below.

---

## Codebase observations

- `unicorn-cms-f09c59e5 @ 07b64427` — three Lovable migrations applied this session: RLS semi-join
  rewrite, view CTE pre-filter (intermediate, superseded), RPC creation. View CTE pre-filter
  migration remains in the migration history but its effect is now redundant given the RPC.
- `v_client_package_dashboard` still present with the CTE pre-filter changes from the intermediate
  migration. Safe to leave; no active callers after the hook switch.
- Vimeo embed domain restriction on Academy videos was identified as a separate issue (privacy
  settings on Vimeo's side restricting the portal domain). Not actioned this session — requires
  Angela to update allowed embed domains in Vimeo.

---

## Decisions

- SECURITY DEFINER RPC preferred over `security_invoker` view for dashboard-style queries that
  aggregate across large tables with per-tenant RLS. The view's per-row RLS evaluation cost grows
  with total table size (all tenants), whereas the RPC's cost is bounded by the calling tenant's
  data only.

---

## Open questions parked

- **KB doc needed:** capture the `security_invoker` + per-row RLS anti-pattern and the SECURITY
  DEFINER RPC pattern as a KB reference so future views follow the right pattern from the start.
- **Drop `v_client_package_dashboard`?** No active callers remain. Can be dropped once the RPC
  has been verified stable in production (suggest 2–4 weeks).
- **Other `security_invoker` views:** audit the remaining client-facing views for the same
  per-row RLS cost pattern (`v_client_package_stages`, `v_client_package_whats_next`,
  `v_client_package_hours_*`). These are narrow-filtered (tenant_id + package_instance_id) so
  they likely don't hit the same scale, but worth confirming.
- **Vimeo embed:** Angela to add the portal domain to Vimeo's allowed embed list for Academy
  videos to play in the client portal.

---

## Tag

`audit-2026-05-08-rls-perf-client-package-dashboard`
