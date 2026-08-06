# Super Admin Exploration — 2026-05-21

> **Reflects commit:** `<codebase>@b5dd5886` (2026-05-20)
> **Reconsider by:** 2026-08-21 — bug snapshots decay fast; re-run any drill-down before acting on a specific finding more than ~3 months old.
> **Confidence:** high for what was visually surfaced via Playwright in Carl's live Super Admin session; the 1,129 "Invalid Members" pool was NOT drilled into (cap on display).
>
> **Methodology:** Playwright read-only traversal on 2026-05-21 of Carl's live Super Admin session against production `https://unicorn-cms.au`. 66 sidebar routes across 7 sections smoke-tested (navigate + shallow accessibility-tree snapshot, looking for 404s, console errors, "coming soon" stubs, broken layouts, data hygiene issues). `/admin/user-audit` drilled into 4 of its 7 sub-tabs (Email Mismatches, No Membership, Orphan Profiles, Invite Issues — Invalid Members deferred). Strict read-only protocol per [`memory/super_admin_exploration_protocol.md`](../../) — no submits, toggles, deletes, or destructive clicks. Tab switches and modal opens allowed.

---

## Sidebar surface area mapped

7 sections, 66 routes total:

| Section | Count | Routes |
|---|---|---|
| Work | 9 | `/dashboard`, `/executive`, `/inbox`, `/my-work`, `/tasks`, `/time-inbox`, `/work/calendar`, `/work/meetings`, `/calendar` |
| Clients | 8 | `/manage-tenants`, `/manage-packages`, `/manage-documents`, `/communications`, `/support-tickets`, `/rto-tips`, `/compliance-audits`, `/audits` |
| EOS | 15 | `/eos`, `/eos/leadership`, `/eos/scorecard`, `/eos/vto`, `/eos/rocks`, `/eos/flight-plan`, `/eos/risks-opportunities`, `/eos/todos`, `/eos/meetings`, `/eos/qc`, `/eos/accountability`, `/eos/gwc-trends`, `/eos/rock-analysis`, `/eos/client-impact`, `/processes` |
| Resource Management | 9 | `/resource-hub` + 8 library managers (`/resource-hub/templates`, `/resource-hub/checklists`, `/resource-hub/registers-forms`, `/resource-hub/audit-evidence`, `/resource-hub/training-webinars`, `/resource-hub/guides-howto`, `/resource-hub/ci-tools`, `/resource-hub/updates`) |
| Administration | 6 | `/admin/team-users`, `/admin/tenant-users`, `/manage-invites`, `/admin/user-audit`, `/audit-logs`, `/admin/email-templates` |
| Academy (admin) | 5 | `/superadmin/academy/tenant-access`, `/superadmin/academy/enrollments`, `/superadmin/academy/certificates`, `/superadmin/academy/builder`, `/superadmin/academy/package-course-rules` |
| System Config | 14 | `/admin/manage-packages`, `/admin/stages`, `/admin/stage-builder`, `/admin/stage-analytics`, `/admin/eos-processes`, `/admin/knowledge`, `/admin/assistant`, `/admin/addin-settings`, `/admin/clickup-mapping`, `/admin/code-tables`, `/admin/lifecycle-checklists`, `/admin/merge-field-tags`, `/admin/governance-documents`, `/admin/sharepoint-sites` |

---

## Critical findings (highest blast radius)

### 1. Schema duality: `tenant_users` vs `tenant_members` is silently broken

The system has **two parallel membership tables** that have drifted apart:

| Table | Used by | Status of the 4 QA academy users |
|---|---|---|
| `tenant_users` | `/client/users`, the role-relationship model, academy enrollments | ✓ present with correct `relationship_role` |
| `tenant_members` | `useSeatLimits.ts`, `/admin/user-audit`, seat counting, audit | **✗ missing for all 4 academy users** |

Evidence: `/admin/user-audit → No Membership (18)` flags `carl+rto-a-academy-1@`, `carl+rto-a-academy-2@`, `carl+rto-b-academy-1@`, `carl+rto-b-academy-2@` as having no active tenant membership. The primary/secondary QA accounts are NOT in that list — so the user-creation path populates both tables for contact roles but **only `tenant_users` for academy roles**.

This is also the root cause of why `Khian Sismundo / khianbsismundo@gmail.com` has 5 active academy enrollments but doesn't appear in `/client/users` for primaries — same divergence.

**Anything that checks `tenant_members.status='active'` (seat counting, the user audit, etc.) is silently undercounting academy users.**

### 2. `/admin/user-audit` reports **1,158 user-data issues** in production right now

| Category | Count | Notes |
|---|---|---|
| Orphan Auth | 0 | Auth users without profiles — clean |
| Orphan Profiles | 2 | `khiandagwapo@gmail.com`, `may@vivacity.com.au` — auth deleted, `public.users` row remains |
| Email Mismatches | 7 | All "Profile email is NULL" cases. **Affects two Vivacity Super Admins**: `angela@vivacity.com.au` (Angela Connell-Richards), `ian@vivacity.com.au` (Ian Baterna). Other 5 are external RTOs. |
| Duplicate Emails | 0 | – |
| No Membership | 18 | Mix of 4 QA academy users + Vivacity staff (AJ, Beverly, Carlo, Jonathan, Jomar, Albert, May, Rhald, Jose) + Khian + bulktest artifacts + `postmaster@cms.vivacity.com.au` system account. Some Vivacity-team entries may be expected behaviour (they're not client members) but worth confirming the audit's exclusion rules. |
| **Invalid Members** | **1,129** (display capped at 1,000) | Largest pool. NOT drilled into in this session — worth a dedicated follow-up. |
| Invite Issues | 2 | `angela+bulktest1@vivacity.com.au` ("Accepted but no membership found" — same schema-duality pattern), `angela.tk.connell@gmail.com` (pending invite, expired May 15 but status still `pending` — stale state machine) |

**Gap in the audit tool itself**: it doesn't check `first_name + last_name` vs `email` consistency. So the `Khian Sismundo` team-user row with email `brian@vivacity.com.au` slips through. A new audit category ("Name doesn't match email") would catch cases like this.

### 3. `/audit-logs` returns **404** despite being wired as a sidebar link
`Administration → Audit Logs` link → 404 page. Plus 1 console error logged. Either restore the route or remove the sidebar link.

### 4. May 2026 calendar events reference DRAFT courses with 0 content
The AddEvent iframe on `/academy/events` lists 5 May 2026 events. Cross-referenced against `/superadmin/academy/builder`:

| Event date | Event name | Linked-name course in Builder |
|---|---|---|
| May 4 | Inside VET: Trainer & Assessor Competency Requirements | "Inside VET Series" — **draft, 0 lessons** |
| May 6 | The Trainer's Edge: Designing Engaging Learning Experiences | "The Trainer's Edge" — **draft, 0 lessons** |
| May 20 | 8 Critical Drivers to RTO Success: Marketing with Integrity | "8 Critical Drivers to RTO Success" — **draft, 0 lessons** |
| May 21 | The Compliance Lab — Self-Assurance & Continuous Improvement Systems | "The Compliance Lab" — **draft, 0 lessons** |

Could be intentional (events are an external embed; course-name overlap may be coincidental) — worth confirming intent with content team.

---

## UX & data-hygiene findings

### Topbar `<h1>` mapping missing on `/superadmin/*` routes

| Route | Topbar h1 |
|---|---|
| `/dashboard` | "Dashboard" ✓ |
| `/admin/team-users` | "Team Users" ✓ |
| `/manage-invites` | "Manage Invites" ✓ |
| `/superadmin/academy/tenant-access` | **"Page"** ✗ |
| `/superadmin/academy/enrollments` | **"Page"** ✗ |
| `/superadmin/academy/builder` | **"Page"** ✗ |
| `/superadmin/academy/package-course-rules` | **"Page"** ✗ |
| `/executive` | **"Page"** ✗ |
| `/inbox` | **"Page"** ✗ |

Looks like the route → title mapping table is missing entries for these. Internal h1s inside `<main>` are usually set correctly; it's the topbar/breadcrumb header that's wrong.

### `/admin/tenant-users` — no pagination on 489 users
Renders entire data set client-side. Accessibility tree exceeds 350KB. 78.9% of users are Inactive (386/489).

By contrast, `/manage-invites` (42 rows) has correct pagination ("Showing 1–20 of 42 results"). Pattern exists; needs backport.

### Legacy "Parent" terminology on admin pages
`/admin/tenant-users` shows a "**Parent Accounts: 422**" stat card and Role column values are `Parent`. `/client/users` (same underlying data, client-side) uses the new `relationship_role` labels ("Primary contact / Secondary contact / Academy only"). Two UIs surfacing the same data through different vocabularies.

### Tenant list duplicates & hygiene (`/superadmin/academy/tenant-access`, ~330 rows, no pagination)
- **Case-only duplicates**: `NATIONAL SKILLS TRAINING INSTITUTE PTY. LTD.` (Disabled) vs `National Skills Training Institute Pty Ltd` (Enabled)
- **Trailing-period duplicates**: `Think Real Estate` vs `Think Real Estate.`
- **Same-entity-different-names**: `Cobra Contracting Pty Ltd T/as Cobra Training & Licensing Services` + `Cobra Training & Licensing Services`; `Watto Training` + `Watto Training Pty Ltd`
- **Test data alphabetically inline with real tenants**: `Example`, `RTO Example`, `Test RTO`, `Test RTO A`, `Test RTO B`, `Totally Awesome RTO`, `HeroSeraph`, plus single-name personal entries (`Catherine Chen`, `Sarah Matthews`, `Yolanda Deng`, `Dani Andriske`, `Amit Singh`, `Amit Grover`, `Dong Hou`, etc.)
- All tenants show "—" for `Max Users` (academy_max_users universally null) and "—" for `Subscription Expires`

### Team Users hygiene (`/admin/team-users`, 23 members)
- **`Khian Sismundo` row → email `brian@vivacity.com.au`**, level Administrator, team Software Dev — name/email mismatch on a Super Admin account
- **Duplicate Angela**: `Angela Connell-Richards / angela@vivacity.com.au` (Active, current Super Admin) vs `Angela Connell / angela.connell@vivacity.com.au` (Inactive, Never signed in) — likely a stale duplicate
- **Test users in prod team**: `Angela Invitetest`, `Angela Invitetest3` (Active Team Members; missing Invitetest2 — gap in sequence)
- **`admin@vivacity.com.au`** placeholder — Inactive, Never signed in
- **Ezel Olores** (primary CSC for Test RTO B): Active but no team assignment, Level = "Not Set"
- Same "Not Set" gap on Angela Invitetest/Invitetest3 and Xenia Gadayan

### Auto-enrolment configured but unused
`/superadmin/academy/package-course-rules`:
- 0 Active rules
- 0 Total mappings
- 0 Auto-enrollments ever
- 30 Unmapped packages

The feature is built; no rules are configured. Confirms every academy enrollment visible in `/superadmin/academy/enrollments` is `self enrol` or `staff impersonation` — never `auto package`.

### Pre-cleanup test-data remnants on Test tenants
- `/superadmin/academy/tenant-access` shows "**Test RTO A** — 7 enrolled" but the standardized cohort is only 4
- `khianbsismundo@gmail.com` has 5 active academy enrollments on Test RTO A (TAS Superhero, Assessment Validation Series, Stellar Trainers Matrix, Online Training Superhero 2022, Superhero Tools Unleashed)
- `nixir tester / nixirer145@deapad.com` (disposable email) still has an active TAS Superhero enrollment on Test RTO A
- `Brian Sismundo / briansismundo@gmail.com` enrolled on the stray `Test RTO` (tenant id 7533)
- `Test Primary User / diamondhood14@gmail.com` enrolled on `Test RTO`

### Resource Hub admin/client asymmetry
- Super Admin: 9 fully-functional management surfaces (templates, checklists, registers-forms, audit-evidence, training-webinars, guides-howto, ci-tools, updates, content dashboard) — confirmed loading
- Client portal `/client/resource-hub`: "**Resource Hub is coming soon — templates, checklists, registers, audit tools, how-to guides. Check back shortly.**"

Admin manages content that clients can't see yet.

### Academy pathway: Student Support Officer has zero content
`/academy/student-support-officer` renders the pathway shell cleanly with description "Skills to support, engage and retain VET students" but **All (0) courses**. The other 4 pathways are populated (Trainer Hub 10, Compliance Manager 12, Governance Person 10, Administration Assistant 8). Different from a "coming soon" stub — the code path works, the data doesn't exist.

### Archived course with active enrollment
`/superadmin/academy/builder` shows "Vivacity Mastermind Sessions" as `archived`. `/superadmin/academy/enrollments` shows Ezel Olores has an active enrollment in that course. Worth confirming whether active enrollments on archived courses are intentional.

### Console error map (routes that logged at least one event on simple load)

| Section | Routes |
|---|---|
| Work | `/work/meetings`, `/executive` (**8 errors**) |
| Clients | `/support-tickets`, `/rto-tips` |
| EOS | `/eos/scorecard`, `/eos/vto`, `/eos/flight-plan`, `/eos/meetings`, `/eos/qc`, `/eos/accountability`, `/eos/rock-analysis`, `/eos/client-impact`, `/processes` |
| Administration | `/manage-invites` (1 error), `/admin/user-audit` (2 errors), `/audit-logs` (404 + 1 error) |
| Resource Management | `/resource-hub/checklists`, `/resource-hub/training-webinars`, `/resource-hub/ci-tools`, `/resource-hub/updates` |
| System Config | `/admin/eos-processes`, `/admin/code-tables`, `/admin/lifecycle-checklists` |

~20 routes logging errors on a passive page-load smoke test. Quiet on the surface, noisy underneath.

---

## Routes that look healthy
The 40+ routes not enumerated in the findings above all loaded cleanly without 404s or visible breakage at the smoke-pass level. They may have deeper issues only visible by interacting with the data — this report only reflects what surfaced from passive navigation + accessibility-tree inspection.

---

## Recommended next steps (in priority order)

1. **Schema-duality fix** — `tenant_members` vs `tenant_users` divergence is the highest-impact root cause and explains multiple downstream findings. Either consolidate to one source of truth, or ensure both are populated atomically when users are created. The audit tool already gives you the diagnostic — now ensure user-creation paths write both. Triggers a Lovable production DB change workflow (see [`../handoffs/lovable-production-db-change.md`](../handoffs/lovable-production-db-change.md)).
2. **Drill into Invalid Members (1,129)** — that's the largest unknown pool, deferred in this session. Worth a dedicated read-only Playwright run + DB query.
3. **Fix `/audit-logs`** — either restore the route or remove the sidebar link.
4. **Topbar h1 mapping** — add entries for all `/superadmin/*` and `/executive` routes to the route → title table.
5. **Add a "Name doesn't match email" audit category** to `/admin/user-audit` — would catch cases like Khian/brian.
6. **Pagination on `/admin/tenant-users` and `/superadmin/academy/tenant-access`** — both are unpaginated on 489 and ~330 rows respectively. `/manage-invites` already has working pagination; pattern can be backported.
7. **Unify role terminology** between admin Tenant Users (legacy "Parent") and client Users (new "Primary contact"). One or the other across both surfaces.
8. **Investigate the 8 console errors on `/executive`** — likely the noisiest broken surface.
9. **Decide intent on duplicates / test data** in tenant + team users lists, then sweep.
10. **Confirm policy** on auto-enrollment rules (`/superadmin/academy/package-course-rules`) — is the 0 rules / 30 unmapped packages intended or a config-not-done gap?

---

## Out of scope for this snapshot

- **Roles not exercised**: regular `user` role (no dedicated test account in the standardized cohort); secondary_contact was tested elsewhere (see [`feature-matrix-2026-05-20.md`](feature-matrix-2026-05-20.md)).
- **Routes not reached**: any `/superadmin/*` route not in the sidebar (may exist but weren't surfaced via navigation); modal-only / drawer-only surfaces; per-record detail pages.
- **Invalid Members deep-dive**: 1,129 rows in the audit — examined the existence but not the content.
- **Interactions not exercised**: no buttons clicked beyond expand/collapse sidebar sections, tab switches, and one avatar dropdown for sign-out earlier in the session. Per the read-only guardrail.
- **Network audit**: API endpoints called per page were not catalogued.

---

## Cross-references

- [`feature-matrix-2026-05-20.md`](feature-matrix-2026-05-20.md) — per-route feature status for `primary_contact` + `academy_user` (client-side). Complements this admin-side snapshot.
- [`module-status.md`](module-status.md) — feature-level module status.
- [`codebase-map.md`](codebase-map.md) — file paths for the routes and components surfaced here.
- [`../pinned/kb-hygiene.md`](../pinned/kb-hygiene.md) — when this snapshot should be flagged for refresh.
- [`../handoffs/lovable-production-db-change.md`](../handoffs/lovable-production-db-change.md) — workflow for the schema-duality fix (recommendation #1).
