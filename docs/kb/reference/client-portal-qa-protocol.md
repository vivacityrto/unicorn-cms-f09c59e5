# Client Portal — QA Protocol

> **Last updated:** 2026-05-19 · **Reconsider by:** 2026-08-19 · **Confidence:** high — grounded in the 2026-05-18 evidence-request workflow restoration and the View-as-Client divergence that motivated it.
>
> Practical, comprehensive test protocol for the client portal at `/client/*`. Use this before shipping any client-portal feature, after any RLS or view change that touches a tenant-scoped table, and whenever a stakeholder reports "I can't see X."

---

## Why this exists

The 2026-05-18 RLS relaxation on `client_audits` exposed a class of bug that had been silently shipping for months: **features tested via the staff "View as Client" preview rendered correctly in dev/demo, but were silently empty when a real client logged in.**

Root cause: View-as-Client uses the **staff Supabase session**. Staff bypass tenant RLS via the `client_audits_staff_all` policy (and equivalents on every other tenant-scoped table). So the preview UI calls the same hooks the real client does, but Postgres returns rows the real client cannot see.

Every feature this affected (Audit Readiness tile, Upcoming Compliance Audit section, Reporting Reminders card, and others) had been "validated" in View-as-Client by the dev who shipped it. None had been validated against a real client login.

This protocol exists to close that gap and to make every other tenant-scoped surface go through the same check before it ships.

See:
- [`unicorn-audit/audit/2026-05-18-evidence-request-workflow-restoration.md`](../../unicorn-audit/audit/2026-05-18-evidence-request-workflow-restoration.md) — the anchoring incident
- [`pinned/conventions.md` → Tables with broad RLS + sensitive columns](../pinned/conventions.md) — the column-whitelist convention this protocol enforces

---

## Test accounts

| Account | Role | Tenant | Use for |
|---|---|---|---|
| `diamondhood14@gmail.com` (TP — Test Primary User) | `unicorn_role = 'Admin'` (client admin) | 7533 (Test RTO) | Default client-portal QA login |
| Any `unicorn_role = 'User'` account on the same tenant | client tenant user (non-admin) | 7533 | Test role gates (admin-only UI vs. user) |
| A real client account on a different tenant | client | ≠ 7533 | Cross-tenant isolation check |
| Your staff account (Vivacity team) | `unicorn_role = 'Team Leader'` / `'Team Member'` / `'Super Admin'` | 6372 | View-as-Client comparison only — NEVER as the sole verification |

**Rule:** every QA pass must end with at least one verification using a **real client login in an incognito window**. The View-as-Client preview is a development aid, not a verification artefact.

---

## Test data prerequisites

Before testing a specific surface, confirm the tenant row has the data the surface depends on. Each surface below lists its prerequisites. If anything is missing, the component will silently return null and you'll mistake a missing-data state for a bug.

### Universal — every QA pass

| Required | How to verify | If missing |
|---|---|---|
| Tenant row exists with `id`, `name`, `created_at` | `SELECT id, name, created_at FROM public.tenants WHERE id = <tenant_id>` | Don't proceed — no tenant, no portal |
| Test user is `tenant_users` member with `status = 'active'` | `SELECT * FROM public.tenant_members WHERE user_id = <auth.uid()> AND tenant_id = <tenant_id>` | Hero / CSC card / packages strip won't render |
| Test user has `unicorn_role` set (Admin or User) | `SELECT unicorn_role FROM public.users WHERE user_uuid = <auth.uid()>` | RBAC may redirect to `/dashboard` |

### Surface-specific

| Surface | Prerequisite | SQL check |
|---|---|---|
| CSC card | `tenant_csc_assignments` row with `is_primary = true` | `SELECT * FROM public.tenant_csc_assignments WHERE tenant_id = <tenant_id> AND is_primary = true` |
| Audit Readiness tile (real data, not empty state) | At least one `client_audits` row for the tenant with `status IN ('draft','in_progress','review','complete')` | `SELECT COUNT(*) FROM public.client_audits WHERE subject_tenant_id = <tenant_id> AND status IN ('draft','in_progress','review','complete')` |
| Upcoming Compliance Audit section | A `client_audits` row above PLUS one or more `audit_appointments` rows linked to it | `SELECT COUNT(*) FROM public.audit_appointments aa JOIN public.client_audits ca ON ca.id = aa.audit_id WHERE ca.subject_tenant_id = <tenant_id>` |
| Audit Preparation section (evidence requests) | One or more `evidence_requests` rows for the tenant with `audit_id IS NOT NULL` and `status IN ('open','partially_received')` | `SELECT id, status, audit_id FROM public.evidence_requests WHERE tenant_id = <tenant_id> AND audit_id IS NOT NULL AND status IN ('open','partially_received')` |
| Audit Reports section | A `client_audits` row with `report_client_visible = true` AND `report_released_at IS NOT NULL` | `SELECT id, report_released_at FROM public.client_audits WHERE subject_tenant_id = <tenant_id> AND report_client_visible = true AND report_released_at IS NOT NULL` |
| Reporting Reminders card | Tenant has at least one of `rto_id` matching `^\d{4,6}$` OR `cricos_id` matching `^\d+[A-Z]$` | `SELECT rto_id, cricos_id FROM public.tenants WHERE id = <tenant_id>` |
| Packages strip | `package_instances` rows for the tenant | `SELECT id, package_id FROM public.package_instances WHERE tenant_id = <tenant_id>` |
| Needs Attention / Coming Up | Tasks, reminders, pinned notes with relevant due dates | Tour `task_instances`, `client_reminders`, etc. |
| Action plan section | `v_audit_action_plan` rows with `report_client_visible = true` | `SELECT * FROM public.v_audit_action_plan WHERE subject_tenant_id = <tenant_id>` |

---

## The protocol

Three phases. Do all three for every QA pass.

### Phase 1 — Setup

1. **Pull latest `<codebase>/`.** Confirm any RLS or view changes you intend to test are actually deployed (check Supabase migrations dashboard or run the post-deploy verification SQL from the change's audit entry).
2. **Confirm test data prerequisites** per the table above for every surface you plan to verify. If a surface's prerequisite is missing, decide: populate the data (real test) or skip (record as untested).
3. **Open two browser windows:**
   - Window A: staff session, signed in as you, ready for View-as-Client comparison
   - Window B: **incognito**, signed in as TP (real client) — this is the authoritative verification
4. **Open DevTools in Window B.** Network tab open, filter ready. You will inspect every Supabase REST request.

### Phase 2 — Per-surface verification

For each surface on the home page (in render order — see the checklist below), do all four of:

1. **Visual** — does the section render? If not, expected (data missing) or bug (data present, render absent)?
2. **Content** — does the rendered content match the underlying DB row? Compare to a SQL spot-check.
3. **Network** — open DevTools → Network → filter for the table this section reads. Confirm the request URL uses an explicit `select=<columns>` list. **`select=*` is forbidden on any table in the [conventions.md broad-RLS list](../pinned/conventions.md).**
4. **Window A comparison** — does View-as-Client show the same thing? If A shows more than B, that's the View-as-Client divergence symptom. Investigate the RLS policy on the underlying table.

### Phase 3 — Cross-cutting checks

After per-surface verification, do these once for the session:

1. **Cross-tenant sanity** — sign into a different tenant's client account in a third window. Confirm tenant 7533's data is NOT visible (no audit titles, no package names, no obligation rows tagged to 7533). RLS is the only thing standing between tenants — verify it holds.
2. **Role gating** — if you have access to a non-admin client user (`unicorn_role = 'User'`) on the same tenant, sign in as them. Confirm admin-only UI affordances (user management, settings sections) are hidden or denied, while shared affordances (home, documents, tasks) work.
3. **Route deny-by-default** — manually navigate the incognito window to a staff route (e.g. `/audits/<uuid>` or `/manage-users`). Confirm redirect to `/dashboard`. This verifies `ProtectedRoute.tsx`'s `CLIENT_ROUTES` allowlist is doing its job and that no client user can reach `select('*')` hooks on staff workspaces.
4. **Empty states** — for at least one surface, sign in as a tenant with no data of that type (or wipe the relevant rows temporarily). Confirm the empty-state copy is correct (e.g. "No audits yet — your CSC will set one up when it's time"), not a blank space or a broken card.

---

## Home page checklist (`/client/home`)

Mounted under `ClientHomePage` ([src/components/client/ClientHomePage.tsx](../../<codebase>/src/components/client/ClientHomePage.tsx)). Sections in render order:

### 1. Hero

- **What renders:** Greeting (Good morning/afternoon/evening), display name, tenure ("Member since <date> · <duration>")
- **Data source:** `useClientHomeHero` → `v_client_home_hero` view (`security_invoker = true`)
- **Prerequisite:** tenant exists, user is a `tenant_members` row with `status = 'active'`
- **Common silent failure:** stale `v_client_home_hero` (cached for 5 min) — clear React Query cache or hard-refresh
- **Network check:** `GET /rest/v1/v_client_home_hero?select=*&tenant_id=eq.<id>` — `select=*` is acceptable here because the view exposes only safe summary columns

### 2. Status strip (top-right of hero)

- **What renders:** "On Track" / "Action Required" badge, current Phase label, Submission eligibility badge, "X days since last activity" indicator
- **Data source:** `useClientProgress` → `v_client_dashboard_progress` view
- **Prerequisite:** at least one `package_instance` for the tenant
- **Note:** runs `security_invoker = true` since 2026-05-07 hardening. Confirms tenant scoping when caller is a client.

### 3. CSC card ("YOUR CSC")

- **What renders:** CSC name, avatar, email, "Message" button, "Book consult" button
- **Data source:** `useClientHomeHero` (joins `tenant_csc_assignments` + `users`)
- **Prerequisite:** primary CSC assignment exists
- **Empty state:** if no CSC assigned, card may render with "—" / "Unassigned" or hide depending on `hasCSC` gate

### 4. Audit Readiness tile (or "No audits yet" empty state)

- **What renders (data):** "Audit Readiness" header, "Documentation coverage X%", progress bar, "N steps remaining across all packages"
- **What renders (empty):** Shield icon + "No audits yet — your CSC will set one up when it's time."
- **Data source for tile:** `useClientProgress` (aggregate of `v_client_dashboard_progress`)
- **Empty-state gate:** `hero.audits_total === 0` from `v_client_home_hero`
- **⚠️ View-as-Client trap (resolved 2026-05-18):** before the RLS relaxation, `audits_total` was 0 for real clients (only released audits counted) even when in-progress audits existed. Staff saw the populated tile in preview. Verify a real client sees the tile populated when in-progress audits exist for the tenant.

### 5. Packages strip ("Your packages")

- **What renders:** One card per package: name, % complete, stages remaining, current phase, On Track / Action Required badge, "View" link
- **Data source:** `useClientProgress` → `v_client_dashboard_progress`
- **Prerequisite:** `package_instances` for the tenant
- **Cross-link:** clicking "View" should navigate to the package detail at `/client/packages/<id>` (verify the link works)

### 6. Quick actions row

- **What renders:** Four cards — Book consult, Message CSC, Request document, Ask the Chatbot
- **⚠️ "Request document" is disabled** (per 2026-05-15 disable — see `audit/2026-05-15-document-request-disable.md`). Card should appear visually disabled / muted, click should be no-op or tooltip-only.
- **Verify:** "Book consult" and "Message CSC" open the Help Center; "Ask the Chatbot" opens the chatbot drawer.

### 7. Home Needs Attention section

- **What renders:** Overdue tasks + urgent pinned notes
- **Hidden when:** no events (graceful empty)
- **Data source:** `useClientHomeFeed` (combines multiple sources)
- **Verify:** if you intentionally create an overdue task for the tenant, it appears here

### 8. Home Coming Up section

- **What renders:** Task due dates within the next 12 weeks
- **Hidden when:** no events in window
- **Data source:** `useClientHomeFeed`

### 9. Home Vivacity Services section ("From Vivacity")

- **Reporting Reminders card** (gated): renders only if `v_client_reporting_reminders` returns ≥ 1 row for the tenant — i.e. the tenant's `rto_id` matches `^\d{4,6}$` OR `cricos_id` matches `^\d+[A-Z]$`. Without one, the card silently hides.
- **Three "Coming soon" service cards** (always visible): Upcoming events, Superhero Tools Unleashed, Trainer PD — these are static placeholders pending implementation.
- **Verify against the obligation list:** for an RTO-only tenant, expect 7 obligations (5 RTO-only + 2 rto_or_cricos). For a CRICOS-only tenant, expect the CRICOS subset. For both, expect the full set.

### 10. Home Recent Activity section

- **What renders:** Last 30 days of cross-package events
- **Hidden when:** no events
- **Data source:** `useClientHomeFeed`

### 11. Client Upcoming Audit section

- **What renders:** Audit title + auditor name, then a timeline: Document Deadline → Opening Meeting → Document Review → Closing Meeting, each with date, instructions, "Add to calendar" button, "Join meeting" link (for online appointments). "Upload documents" button at the bottom linking to `/client/documents`.
- **Hidden when:** no `client_audits` row for the tenant with `status IN ('draft','in_progress','review')` OR zero `audit_appointments` for that audit
- **⚠️ Component returns null if `audit_appointments` is empty** ([ClientUpcomingAuditSection.tsx:70](../../<codebase>/src/components/client/ClientUpcomingAuditSection.tsx#L70)) — common gotcha. An audit exists but no schedule yet → section silently hides.
- **Network check:** confirm `select=` on `client_audits` is `id, title, audit_type, status, lead_auditor_id, subject_tenant_id` — explicit whitelist, no sensitive columns.

### 12. Audit Preparation section ("Prepare for your upcoming audit")

- **What renders:** Per-evidence-request card with title, due date (red if overdue), progress bar, per-item rows (name, optional guidance, status badge, Upload button)
- **Hidden when:** no `evidence_requests` for the tenant with `audit_id IS NOT NULL` AND `status IN ('open','partially_received')`
- **Status filter is sharp:** as evidence comes in, the parent request flips through `open → partially_received → received → closed`. Only `open` and `partially_received` show in this section (per 2026-05-18 fix). `received` and `closed` requests disappear (correct — fully prepared).
- **Network check:** `select=*, evidence_request_items(*)` is OK here — `evidence_requests` is not on the broad-RLS sensitive-column list. But `portal_documents` writes from the upload action must use `direction='client_to_vivacity'` and `source='evidence_response'` (per 2026-05-18 fix). Inspect a successful upload's POST body to confirm.

### 13. Client Audit Reports section

- **What renders:** Released audit reports for the tenant — title, risk rating, score, conducted date, "Download report" button, "Acknowledge" button (if not yet acknowledged)
- **Hidden when:** no `client_audits` row with `report_client_visible = true` AND `report_released_at IS NOT NULL`
- **RLS path:** this is the original `client_audits_tenant_read_v2` policy's purpose. Both `v2` and `_active` policies together control what's visible.
- **Verify:** an in-progress audit (which IS now visible to clients post-2026-05-18) should NOT appear here — only released ones.

### 14. Quick links footer

- **What renders:** A row of muted-style links to other `/client/*` pages
- **Static** — no data dependency, but verify each link navigates correctly

---

## Other `/client/*` routes — checklist

Less data-heavy than home. For each, verify: page loads, primary affordances work, data is tenant-scoped.

| Route | Key things to verify |
|---|---|
| `/client/inbox` | Messages and notifications render; tab switching works; legacy `?conversation=` deep links resolve (per 2026-05-14 fix) |
| `/client/tasks` | Tenant's tasks render; status filter works; task detail navigation works |
| `/client/packages` | All tenant's packages list; click into one shows stages; AuditProgressCard renders inside stage when `linked_audit_id` is set |
| `/client/documents` | Shared by Vivacity / Uploaded by Client / Evidence Requests tabs render; "Request a document" button is disabled (per 2026-05-15); upload works for client-uploaded documents |
| `/client/resource-hub` | Published global resources visible; tenant-uploaded resources NOT visible cross-tenant |
| `/client/calendar` | Public events + tenant reminders/meetings render; no cross-tenant leakage |
| `/client/reports` | Tenant-summary views only |
| `/client/users` | Tenant members visible; admin can invite/manage; user role cannot |
| `/client/staff-pdps` | Tenant's staff PDPs |
| `/client/settings` | Own profile editable; admin sees tenant-level settings; no cross-user settings access |
| `/client/profile` | Own profile only |
| `/client/tga` | TGA details for the tenant |
| `/client/files` | Tenant files only |
| `/client/suggestions` | Tenant suggestions; create + view detail works |

---

## Known divergences to watch for

These have surfaced as the symptoms of the broader View-as-Client class of bug. If you see any other pattern matching the shape, log it.

| Surface | Symptom | Status |
|---|---|---|
| Audit Readiness tile | Empty state for real client even though in-progress audit exists | **Resolved 2026-05-18** — RLS relaxed |
| Upcoming Compliance Audit section | Silently hidden for real client | **Resolved 2026-05-18** — same RLS relaxation cascaded via `audit_appointments` EXISTS subquery |
| Reporting Reminders card | Silently hidden for tenants without `rto_id` / `cricos_id` matching the regex pattern | **By design** — but worth setting test tenants up so the card renders |
| `audit_send_evidence_reminders` cron emails | Never fire | **Known bug** — cron filters on `status = 'sent'` which doesn't exist in the CHECK constraint. Separate DB-change session pending. |
| AuditProgressCard score chips | Partial scores visible mid-audit (misleading) | **Resolved 2026-05-18** — gated on `status === 'complete'` |
| `/client-portal/:tenantId/documents` route | Orphaned URL using staff layout, no UI links to it | **Known anomaly** — see open question in audit 2026-05-18 |
| System 1 evidence requests (`CreateEvidenceRequestDialog`) | No real client surface — only the orphaned route above renders them | **Known** — decision deferred |

---

## After-test hygiene

1. **Revert test data.** If you populated test rows (audits, evidence requests, RTO IDs, etc.) on a real tenant, either remove them or note them in the parked-test-data log. Avoid leaving `rto_id = '99999'` on production tenants.
2. **Note any failures** in `unicorn-kb/reference/brainstorm-log.md` if they're not already a known issue. Tag Carl if the symptom matches a class of bug not yet documented here.
3. **Update this protocol** if you found a surface, prerequisite, or check that isn't covered above. The protocol drifts every time the portal grows a feature; keep it honest.

---

## Quick SQL snippets

Drop these into the Supabase SQL editor when verifying a tenant's data state.

```sql
-- Tenant snapshot
SELECT id, name, rto_id, cricos_id, created_at
FROM public.tenants WHERE id = <tenant_id>;

-- All audits for tenant, with visibility flags
SELECT id, audit_type, title, status,
       report_client_visible, report_released_at
FROM public.client_audits
WHERE subject_tenant_id = <tenant_id>
ORDER BY created_at DESC;

-- Active evidence requests + item counts
SELECT er.id, er.title, er.status, er.audit_id,
       COUNT(eri.id) AS item_count,
       COUNT(*) FILTER (WHERE eri.status = 'received') AS received_count
FROM public.evidence_requests er
LEFT JOIN public.evidence_request_items eri ON eri.request_id = er.id
WHERE er.tenant_id = <tenant_id>
  AND er.audit_id IS NOT NULL
  AND er.status IN ('open','partially_received')
GROUP BY er.id, er.title, er.status, er.audit_id;

-- Reporting reminders for tenant (joins audience to obligations)
SELECT obligation_id, code, title, status, days_until
FROM public.v_client_reporting_reminders
WHERE tenant_id = <tenant_id>
ORDER BY sort_order;

-- Cross-tenant sanity: confirm tenant_members boundary
SELECT tm.tenant_id, tm.user_id, u.first_name, u.last_name, u.unicorn_role
FROM public.tenant_members tm
LEFT JOIN public.users u ON u.user_uuid = tm.user_id
WHERE tm.tenant_id = <tenant_id> AND tm.status = 'active';

-- Hero view as the caller would see it
-- (run with the test user's JWT if validating real-client RLS)
SELECT tenant_id, audits_total, active_packages, csc_display_name
FROM public.v_client_home_hero
WHERE tenant_id = <tenant_id>;
```

---

## Reference

- Anchoring incident: [`unicorn-audit/audit/2026-05-18-evidence-request-workflow-restoration.md`](../../unicorn-audit/audit/2026-05-18-evidence-request-workflow-restoration.md)
- RLS column-whitelist convention: [`pinned/conventions.md`](../pinned/conventions.md) → "Tables with broad RLS + sensitive columns (frontend whitelist required)"
- Route gating: [`<codebase>/src/components/ProtectedRoute.tsx`](../../<codebase>/src/components/ProtectedRoute.tsx) — the `CLIENT_ROUTES` deny-by-default pattern
- Tenant-safe data access (per-route): [`<codebase>/docs/client-portal/data-access-checklist.md`](../../<codebase>/docs/client-portal/data-access-checklist.md)
