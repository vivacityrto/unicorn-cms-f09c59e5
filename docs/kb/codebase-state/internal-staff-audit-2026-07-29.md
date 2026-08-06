# Internal Staff Audit — 2026-07-29

> **Reflects commit:** `<codebase>@5756e75a` (2026-07-29, branch `hotfix/manage-documents-autofill`).
> **Reconsider by:** 2026-09-29.
> **Confidence:** high — reproduced live via Playwright in Carl's real Super Admin session against `localhost:8080` (dev frontend, prod Supabase backend). Super Admin sees a superset of what other staff roles see, so this pass covers the Internal Staff route bucket from [`route-inventory-by-role.md`](route-inventory-by-role.md) section 3, not a role-restricted view.
>
> **Methodology:** Navigate each route, capture accessibility snapshot, check console errors, click through every visible in-page tab strip (not just the default tab — see [`feedback_audit_click_subtabs`](../../memory/feedback_audit_click_subtabs.md), a correction Carl gave mid-audit). Tenant-scoped routes tested against the **Demo RTO** tenant (id `7547`, account `carl+demo@vivacity.com.au`). Companion to [`super-admin-executive-academy-audit-2026-07-29.md`](super-admin-executive-academy-audit-2026-07-29.md) (SuperAdmin/Executive/Academy Builder pass, same session).
>
> **Scope note:** ~90 of ~110 Internal Staff routes covered. Not reached: `/calendar/time-capture`, `/calendar/outlook-callback` (OAuth callback, needs a real auth code), `/admin/client-packages/:id`, `/suggestions/:id`, `/support-tickets/new`, `/support-tickets/:id` detail, `/tenant/:clientId/impact`. Client Portal and Vivacity Academy learner-facing sections are queued for a follow-up session (needs a QA test account sign-in, which requires signing out of the live Super Admin session — paused mid-audit pending that handoff).

---

## Carried over from 2026-05-21, re-verified as FIXED

The following routes were flagged with console errors in the prior audit and are now clean: `/work/meetings`, `/support-tickets`, `/rto-tips`, `/compliance-audits`, `/eos/scorecard`, `/eos/flight-plan`, `/eos/meetings`, `/eos/client-impact`, `/resource-hub/checklists`, `/resource-hub/training-webinars`, `/resource-hub/ci-tools`, `/resource-hub/updates`. Good sign that the hotfix cadence (PRs #49–78) has been landing real fixes, not just churn.

Also re-verified: `/inbox` now shows the correct topbar title "Inbox" (was "Page" in the 05-21 pass).

---

## New findings

### 1. Same "FK relationship not found in schema cache" 400 bug — now 3 confirmed instances

This exact PostgREST error class (`Could not find a relationship between 'X' and 'Y' in the schema cache`) now has three independent sightings across two audit passes today:

| Route | Tables | Alias in query |
|---|---|---|
| `/admin/compliance-packs` | `compliance_pack_exports` ↔ `tenants` | `tenant:tenants(id,name)` |
| `/admin/reviews` | `stage_release_reviews` ↔ `users` | `reviewer:users!stage_release_reviews_reviewer_user_id_fkey(...)` |
| `/manage-stages` | `stages` ↔ `users` (via `created_by`) | `creator:created_by(first_name,last_name,avatar_url)` |

Three different tables, three different embed aliases, same failure signature. Worth checking as one root cause — either PostgREST's schema cache is stale after a migration (needs `NOTIFY pgrst, 'reload schema'` or a Supabase restart) or these specific FK constraints were never actually created despite the frontend code assuming they exist. Recommend checking `pg_get_constraintdef` on all three FKs before assuming it's a cache issue.

### 2. `/admin/integrations/tga` — RPC `tga_sync_status` 500s

```
500: record "v_last_job" is not assigned yet — The tuple structure of a not-yet-assigned record is indeterminate.
```
Classic PL/pgSQL bug: a `RECORD`-typed variable is referenced before a `SELECT INTO` populates it (likely the `SELECT INTO v_last_job ... ` returned zero rows and the function doesn't guard for that before accessing a field on `v_last_job`). This is **separate** from the previously-known outage in [`tga_sync_broken_l3_gate`](../../memory/tga_sync_broken_l3_gate.md) (the `l3_gate_tga_sync_cluster` auth.uid()-vs-service-role issue) — that memory is about the *sync* RPC; this is a bug in the *status* RPC. Worth checking whether both are still live or if one has been superseded.

### 3. `/triage-dashboard` — RPC `handle_staff_first_login` 400s

Fires on every load, including for Carl (an already-onboarded, long-tenured Super Admin) — suggests the RPC isn't checking whether first-login handling is actually needed before running, or is missing a guard clause for the "already onboarded" case.

### 4. Badge/`forwardRef` bug — 3rd confirmed occurrence

Same root cause as finding #7 in the companion SuperAdmin audit (`src/components/ui/badge.tsx:40` not wrapped in `React.forwardRef`). This time in `src/components/client/TenantTimeTrackerBar.tsx:25`, rendered on `/tenant/:id` (client detail page). Note: `/tenant-detail/:id` and `/tenant/:id` render the exact same `ClientDetailWrapper` component — they're aliases, not two different pages.

### 5. Two likely false leads — flagged for transparency, not filed as bugs

- `/tenant/42400` returned 406/"0 rows" — but `42400` was a misread: the accessibility tree concatenated two adjacent cell values (an RTO registration number + the tenant name, e.g. `"42400Demo RTO"`), and I mistook the number for the tenant's DB id. The real Demo RTO tenant id is **7547**, confirmed by clicking the actual row instead of parsing text. `/tenant/7547` and all its sub-tabs load cleanly.
- `/package/15201` and `/admin/package/15201` both 406 querying the `packages` table directly — `15201` came from a `?package=` query param on the tenant page and is more likely a `client_package` instance id than a `packages` catalogue id. Didn't chase down the correct id given time; someone with schema access should confirm which table `15201` actually belongs to before treating this as a bug.

Both are called out per [`feedback_verify_against_origin_main`](../../memory/feedback_verify_against_origin_main.md)-style discipline — better to flag an ambiguous lead than report a false positive.

---

## Dialogs/modals inspected

- **Support Tickets quick-panel** (topbar button, available from every staff page): opens a draggable floating dialog listing recent tickets with status/priority pills, a search box, "New"/"Full View" tabs, and a working "Close" button. No issues found; reasonably polished (drag-to-reposition, item count footer).

---

## Clean routes (no console errors)

`/dashboard`, `/my-onboarding`, `/my-work`, `/tasks`, `/time-inbox`, `/work/calendar`, `/work/meetings`, `/calendar`, `/inbox` (My Notifications + Team Inbox tabs), `/email-triage`, `/settings` (+ calendar/notifications/integrations/roles/profile tabs), `/team-settings`, `/manage-tenants`, `/manage-documents`, `/communications`, `/support-tickets`, `/rto-tips`, `/compliance-audits`, `/audits`, `/clients/bulk-membership-certificates`, `/kpi`, `/my/kpi`, `/membership-dashboard`, all 12 `/resource-hub/*` routes, `/eos` and all 14 of its sub-routes, `/processes`, `/my-exit-interview`, `/documents`, `/reports`, `/manage-users`, `/manage-categories`, `/admin/research-jobs`, `/profile`, `/tenant/7547` (+ logins/members/documents/documents-hub/notes/tasks), `/tenant-detail/7547`, `/user-profile/:id`.

`/admin/reviews` and `/manage-stages` render without crashing despite finding #1 (degrade gracefully to empty/error states).

---

## Cross-references

- [`super-admin-executive-academy-audit-2026-07-29.md`](super-admin-executive-academy-audit-2026-07-29.md) — companion audit, same session
- [`route-inventory-by-role.md`](route-inventory-by-role.md) — full route map
- [`super-admin-exploration-2026-05-21.md`](super-admin-exploration-2026-05-21.md) — prior pass, several findings re-verified as fixed above
- [`tga_sync_broken_l3_gate`](../../memory/tga_sync_broken_l3_gate.md), [`auth_uid_gated_rpc_service_role_antipattern`](../../memory/auth_uid_gated_rpc_service_role_antipattern.md) — related but distinct TGA issue
