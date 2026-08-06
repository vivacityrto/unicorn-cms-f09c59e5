# Route Inventory by Role

> **Last updated:** 2026-07-29 · **Reconsider by:** 2026-09-29 — routes churn fast (7 hotfix PRs landed 2026-07-27/28 alone touching route titles/redirects); re-derive from `App.tsx` rather than trust this list once stale.
>
> **Reflects commit:** `<codebase>@5756e75a` (2026-07-29, branch `hotfix/manage-documents-autofill`).
>
> **Methodology:** Every `<Route>` in [`src/App.tsx`](../../unicorn-cms-f09c59e5/src/App.tsx) (216 total, both single-line and multi-line JSX formats), grouped by who can reach it. Built to support the 2026-07-29 cross-role bug/layout audit (see [`super-admin-exploration-2026-05-21.md`](super-admin-exploration-2026-05-21.md) for the prior admin-only pass this supersedes in scope, not in findings — that doc's findings still need re-verification).
>
> **Confidence:** high for the route→file→guard mapping (read directly from source); low for "who actually uses this" — several routes (`/client-portal/:tenantId/documents`, `/client/eos`) have staff-facing paths despite `/client` naming and need a live-session confirmation, flagged below.

---

## How routes are gated

Three guard patterns in `App.tsx`:
- No wrapper — public, pre-auth (`Login`, `ResetPassword`, etc.)
- `<ProtectedRoute>` — any authenticated user; the *page itself* usually does further role/tenant checks internally (e.g. client vs staff view)
- `<ProtectedRoute requireSuperAdmin>` — hard-gated, redirects non-superadmins away (confirmed behavior: redirects to `/dashboard`, per [`local_dev_server_verification`](../../memory/local_dev_server_verification.md) memory)

---

## 1. Public / pre-auth (8 routes)

No login required.

| Route | Component |
|---|---|
| `/` | `Login` |
| `/login` | `Login` |
| `/reset-password` | `ResetPassword` |
| `/activate` | `ActivateAccount` |
| `/accept-invitation` | `AcceptInvitationWrapper` |
| `/post-sign-in` | `PostSignInRedirect` |
| `/oauth/consent` | `OAuthConsent` |
| `/.lovable/oauth/consent` | `OAuthConsent` |

---

## 2. Super Admin only — `requireSuperAdmin` (47 routes)

Hard-gated. Sections per current sidebar grouping (see prior doc's 7-section map — this list adds routes introduced since 2026-05-21: `/admin/diagnostics/zero-progress-packages`, `/admin/regulator-watch(+detail)`, `/admin/risk-radar`, `/admin/template-gap-analysis`, `/admin/knowledge-explorer`, `/admin/strategic-command`, `/admin/workflow-optimisation`, `/admin/risk-command`, `/admin/strategic-orchestration`, `/admin/settings/reporting-obligations`, `/superadmin/workforce-pdp`, `/admin/team-users/new-starter(+runs)`, `/admin/bulk-invite`, `/admin/cohort-sender(+jobs)`).

**Executive**
- `/executive/financial-controls`
- `/executive/client-commitments`
- `/executive/decision-queue`
- (`/executive` itself is plain `<ProtectedRoute>` — see Internal Staff section)

**Package/stage system config**
- `/admin/manage-packages`, `/admin/package-builder/:id`
- `/admin/stages`, `/admin/stages/:stage_id`, `/admin/stage-builder`, `/admin/stage-analytics`
- `/admin/operations`
- `/admin/compliance-packs`
- `/admin/code-tables`, `/admin/lifecycle-checklists`, `/admin/merge-field-tags`
- `/admin/settings/reporting-obligations`
- `/administration/role-permissions`

**Team/user provisioning**
- `/admin/team-users/new-starter`
- `/admin/team-users/runs/:runId`, `/admin/team-users/runs/:runId/onboarding`
- `/admin/bulk-invite`
- `/admin/cohort-sender`, `/admin/cohort-sender/jobs/:jobId`
- `/admin/diagnostics/zero-progress-packages`

**AI / knowledge / process config**
- `/admin/assistant`
- `/admin/knowledge`
- `/admin/eos-processes`
- `/internal/ask-viv/flags`
- `/admin/knowledge-explorer`

**Integrations / diagnostics**
- `/admin/addin-settings`, `/admin/addin-diagnostics`
- `/admin/clickup-mapping`, `/admin/clickup-import`
- `/admin/qa/responsive`, `/admin/qa/smoke`

**Regulator / risk / strategy (newer surfaces, not in the 2026-05-21 doc)**
- `/admin/regulator-watch`, `/admin/regulator-watch/:eventId`
- `/admin/risk-radar`
- `/admin/template-gap-analysis`
- `/admin/strategic-command`
- `/admin/workflow-optimisation`
- `/admin/risk-command`
- `/admin/strategic-orchestration`
- `/superadmin/workforce-pdp`

**Academy (admin/builder side)**
- `/superadmin/academy/enrollments`
- `/superadmin/academy/tenant-access`
- `/superadmin/academy/certificates`
- `/superadmin/academy/builder`, `/superadmin/academy/builder/:courseId`
- `/superadmin/academy/package-course-rules`

---

## 3. Internal staff — plain `<ProtectedRoute>`, non-client, non-academy-learner (~110 routes)

Everything a Vivacity staff member (CSC, consultant, admin without superadmin) can reach. Largest bucket — grouped by module.

**Work / dashboard**
`/dashboard`, `/triage-dashboard`, `/my-onboarding`, `/my-work`, `/tasks`, `/tenant/:tenantId/tasks`, `/time-inbox`, `/calendar`, `/work/calendar`, `/work/meetings`, `/calendar/time-capture`, `/calendar/outlook-callback`, `/messages`, `/inbox`, `/email-triage`, `/executive` (base — unlike its sub-pages, not superadmin-gated), `/profile`, `/settings`, `/settings/calendar`, `/settings/notifications`, `/settings/integrations`, `/settings/roles`, `/team-settings`

**Clients / tenant management**
`/manage-users`, `/manage-invites`, `/manage-tenants`, `/manage-documents` (+`/manage-documents/bulk-generate/new`, `/manage-documents/bulk-jobs`, `/manage-documents/bulk-jobs/:id`), `/manage-categories`, `/manage-stages`, `/document/:id`, `/user-profile/:userId`, `/tenant/:tenantId` (+`/logins`, `/members`, `/documents`, `/documents-hub`, `/document/:documentId`, `/notes`), `/tenant-detail/:tenantId`, `/admin/client-packages/:clientPackageId`, `/admin/package/:id` (+`/tenant/:tenantId`, `/tenant/:tenantId/instance/:instanceId`), `/package/:id`, `/rto-tips`, `/communications`, `/support-tickets` (+`/new`, `/:id`), `/suggestions/:id` (redirects for base paths → support-tickets), `/clients/bulk-membership-certificates`, `/admin/tenant-users`, `/admin/user-audit`, `/admin/staff-engagements` (+`/:id`), `/my-exit-interview`, `/admin/team-users`, `/admin/integrations/tga`, `/admin/reviews`, `/admin/research-jobs` (+`/:jobId`)

**⚠️ Needs live-session confirmation** — `/client-portal/:tenantId/documents` (line ~577): named like a client route but sits in the staff `<ProtectedRoute>` block, not `/client/*`. Likely a staff-side view of a specific tenant's documents (parallel to `/tenant/:tenantId/documents`) — confirm during audit before assuming it's client-portal-facing.

**EOS Level 10** (large subtree, all staff-facing)
`/eos`, `/eos/onboarding`, `/eos/health`, `/eos/health-check`, `/eos/rocks`, `/eos/flight-plan`, `/eos/risks-opportunities`, `/eos/issues`, `/eos/todos`, `/eos/meetings` (+`/:meetingId/summary`, `/:meetingId/live`), `/eos/configurations` (+`/:id`), `/eos/scorecard`, `/eos/vto`, `/eos/calendar`, `/eos/qc` (+`/:id`), `/eos/accountability`, `/eos/people-analyzer`, `/eos/gwc-trends`, `/eos/client-impact` (+`/:reportId`), `/eos/rock-analysis`, `/eos/leadership`, `/processes` (+`/new`, `/:id`, `/:id/edit`), `/tenant/:clientId/impact`

**⚠️ Needs live-session confirmation** — `/client/eos` (line ~865): the one `/client/*`-prefixed route living inside the staff EOS block rather than the client-portal block. Likely staff's "view as client would see EOS" screen — confirm.

**Audits (Vivacity's own compliance audit tool, distinct from `/compliance-audits/*`)**
`/audits`, `/audits/create-template` (+`/:templateId`), `/audits/:id`, `/audits/:id/findings`, `/audits/:id/actions`, `/audits/:id/report`

**Compliance audits (client-facing audit engagements, staff side)**
`/compliance-audits`, `/compliance-audits/:tenantId`, `/compliance-audits/:tenantId/audit/:auditId` (+`/report`)

**Resource Hub (staff/admin management side)**
`/resource-hub`, `/resource-hub/templates`, `/resource-hub/checklists`, `/resource-hub/registers-forms`, `/resource-hub/audit-evidence`, `/resource-hub/training-webinars`, `/resource-hub/guides-howto`, `/resource-hub/ci-tools`, `/resource-hub/recently-added`, `/resource-hub/most-used`, `/resource-hub/favourites`, `/resource-hub/updates`

**Other admin-adjacent (not gated `requireSuperAdmin` despite the path)**
`/admin/sharepoint-folder-mapping`, `/admin/sharepoint-sites`, `/admin/governance-documents`, `/admin/ai-insights`, `/admin/email-templates` (appears twice in App.tsx — lines ~497 and ~707, worth checking for a duplicate-route bug), `/documents`, `/reports`, `/membership-dashboard`

**KPI**
`/kpi` (current, v2), `/my/kpi` (deprecated v1, still routed — see [`unicorn_app_url`](../../memory/unicorn_app_url.md) memory)

---

## 4. Client Portal — `/client/*` (26 routes)

Client-facing, gated by `<ProtectedRoute>` + internal role checks (`primary_contact`/`secondary_contact`/`academy_user`/`user` — see [`messaging_contact_only_policy`](../../memory/messaging_contact_only_policy.md) for one access-split example).

`/client/home`, `/client/inbox`, `/client/tasks`, `/client/packages`, `/client/communications` (→ redirects to `/client/inbox?tab=messages`), `/client/governance-documents`, `/client/documents` (→ redirects to governance-documents), `/client/resource-hub` (+`/:categoryId`), `/client/calendar`, `/client/notifications` (→ redirects to `/client/inbox?tab=notifications`), `/client/reports`, `/client/users`, `/client/staff-pdps`, `/client/team` (→ redirects to `/client/users`), `/client/settings`, `/client/profile`, `/client/tga`, `/client/files`, `/client/certificate`, `/client/support-tickets` (+`/:id`), `/client/suggestions` (+`/new`, `/:id` — all redirect to support-tickets), `/client-preview`

---

## 5. Vivacity Academy — learner-facing `/academy/*` (20 routes)

Also `<ProtectedRoute>`, distinct from the superadmin `/superadmin/academy/*` builder/admin surfaces in section 2.

`/academy` (dashboard), `/academy/courses`, `/academy/certificates`, `/academy/events`, `/academy/community`, `/academy/team`, `/academy/profile`, `/academy/pdp`, `/academy/pdp/reviews`, `/academy/pdp/cycle/:cycleId`, `/academy/trainer`, `/academy/compliance-manager`, `/academy/governance-person`, `/academy/student-support-officer`, `/academy/administration-assistant`, `/academy/course/:slug`, `/academy/course/:slug/lesson/:lessonId`, `/academy/course/:slug/assessment/:assessmentId` (+`/result/:attemptId`)

Pathway dashboards (`trainer`, `compliance-manager`, `governance-person`, `student-support-officer`, `administration-assistant`) are role-based landing pages — a learner sees the one matching their academy role.

---

## 6. Embedded shells (2 routes)

- `/addin` → `AddinShell` — Outlook/Office add-in embed
- `/teams` → `TeamsShell` — Microsoft Teams embed

---

## 7. Catch-all

- `*` → `NotFound`

---

## Known open questions from this pass

1. `/admin/email-templates` is routed twice (~line 497 and ~line 707) — needs checking whether these are two different guard contexts (dead duplicate vs. intentional) or a copy-paste leftover.
2. `/client-portal/:tenantId/documents` and `/client/eos` don't follow their section's naming convention — confirm who actually lands on these before relying on this doc's bucketing.
3. `/my/kpi` (deprecated v1) is still wired — not removed, just superseded per [`unicorn_app_url`](../../memory/unicorn_app_url.md).

## Cross-references

- [`codebase-map.md`](codebase-map.md) — file-path/component structure (this doc adds the role lens on top)
- [`super-admin-exploration-2026-05-21.md`](super-admin-exploration-2026-05-21.md) — prior admin-side bug/hygiene findings, due for re-verification against current `main`
- [`feature-matrix-2026-05-20.md`](feature-matrix-2026-05-20.md) — per-route feature status for client-side roles
- [`docs/client-portal/`](../../unicorn-cms-f09c59e5/docs/client-portal/) — client-portal data-access checklist per route
