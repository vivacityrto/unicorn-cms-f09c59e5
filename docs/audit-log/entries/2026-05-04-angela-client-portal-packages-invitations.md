# Audit: 2026-05-04 — Angela's client portal rebuild, package dashboard, invitations overhaul, RLS hardening (296 commits, 23 migrations)

**Author:** Carl
**Trigger:** ad-hoc — Carl's local branch is 296 commits behind `origin/HEAD`; this entry documents what Angela shipped before Carl pulls.
**Scope:** read-only review of `unicorn-cms-f09c59e5` commit history from `9cdc2a85` (local HEAD, "Added Ask Viv panel to layout", 2026-04-30) through `021a09a9` (origin HEAD, "Polished Wednesday feeds", 2026-05-03). No KB or codebase edits made.
**Codebase verified at:** `unicorn-cms-f09c59e5 @ 021a09a9` (origin HEAD at time of audit)
**Local HEAD at audit start:** `9cdc2a85`

---

## What shipped

### 1 — Client portal home page rebuild (30 Apr – 3 May)

**Commits:** `eb9f106d` "Updated ClientHomePage hook & UI", `9574966d` "Added Live Reporting Reminders", `021a09a9` "Polished Wednesday feeds", and surrounding Changes commits.
**Files:** `src/components/client/ClientHomePage.tsx` (550-line rewrite), `src/components/client/home/` (five new section components), `src/hooks/use-client-home-feed.ts`, `src/hooks/use-client-home-hero.ts`, `src/hooks/use-client-reporting-reminders.ts`.
**Migrations:** `20260503074222` (`v_client_home_hero`), `20260503081540` (`v_client_home_feed`).

The home page went from a single component to a view-driven layout with five discrete sections:

- **Coming Up** — surfaces the next scheduled items for the client.
- **Needs Attention** — flags overdue or blocked action items.
- **Recent Activity** — feeds from `v_client_home_feed`, a sparse event log (stage completions, task completions, consults logged). Final polish on 3 May added `package_name` as a fallback subtitle for `consult_logged` events where `subtitle` is null and added a defensive `_mt`/`_qt`/`_yt` suffix strip inside `formatWorkType` so raw work-type slugs don't bleed through to the UI.
- **Reporting Reminders** — new `HomeReportingRemindersCard` (224 lines), backed by `use-client-reporting-reminders`. The largest single new component on the home page; surfaces AASQA / standard reporting obligations to the client.
- **Vivacity Services** — static promotional section for upsell/cross-sell.

`v_client_home_hero` provides the hero tile (compliance pulse summary). `v_client_home_feed` provides the activity feed. Both views are `security_invoker = true`; RLS on underlying tables is enforced per-caller.

---

### 2 — Package dashboard — new client-facing surface (2 May)

**Commits:** `f8d6062a` "Refactored ClientPackagesPage", `534ec4b3` "Added burndown chart to card", `b5d57510` "Fixed display labels in burndown", `3b7ded53` "Added package history section", `27ebe3ee` "Added time-entry views & hooks", `277ac567` "Added current_stage_shortname", `34d6c544` "Fixed card title source", `e5487bb6` "Fixed auth and storage leaks", `ab4e426b` "Patched client hours view", `36fc9c1c` "Added zero-progress page", `1d017bb3` "Fixed stage completion logic", `c16a6186` "Fixed package_id in RPC", `2b680025` "Hid Phase segment when empty", `05af9495` "Added stepper and whats next".
**Files:** `src/components/client/package-dashboard/` (11 new components), `src/components/client/ClientPackagesPage.tsx` (363-line refactor), `src/hooks/use-client-package-dashboard.ts`, `src/hooks/use-client-package-hours-by-type.ts`, `src/hooks/use-client-package-hours-recent.ts`, `src/hooks/use-client-package-hours-timeline.ts`, `src/hooks/use-client-package-stages.ts`, `src/hooks/use-client-package-whats-next.ts`.
**Migrations:** `20260502055419` (`v_client_package_dashboard` v1), `20260502061224` (`v_client_package_stages` + `v_client_package_whats_next`), `20260502062752` (`rpc_import_meeting_time_to_client`), `20260502063232` (patch: `status_id IN (2,3)` fix for stage completion logic in both views), `20260502064808`–`20260502070132` (iterative Changes), `20260502074914` (`v_client_package_dashboard` v3 rewrite), `20260502080029` (`v_client_package_hours_by_type` + `v_client_package_hours_recent`), `20260502081037` (`v_client_package_hours_timeline`).

This is the most substantial structural addition in the window. Six new DB views and eleven new React components give the client portal a full package-progress surface:

- **`PackageBurndownChart`** (324 lines) — cumulative hours used vs. contracted, driven by `v_client_package_hours_timeline` (AEST/AEDT date-bucketed, sparse: one row per day with activity).
- **`PackageStageStepper`** — client-facing journey stepper; node state derived from `status_id IN (2,3)` for "complete", lowest open stage for "current". Multiple iteration cycles on 2 May corrected the status ID logic from `status_id = 2` to `IN (2,3)`.
- **`PackageHoursBreakdown`** — "Where your hours went" by work type/sub-type, from `v_client_package_hours_by_type`.
- **`PackageRecentWork`** — last 10 time entries (client-facing fields only; no user attribution, no `is_billable`), from `v_client_package_hours_recent`.
- **`PackageWhatsNextPanel`** — top 3 open client-facing tasks ranked by urgency, from `v_client_package_whats_next`.
- **`PackageStatTiles`**, **`PackageStatusPill`**, **`PinnedNoteBanner`**, **`PackageActionRow`**, **`CollapsedPackageRow`**, **`HistoricalPackageRow`**, **`PackageHistorySection`** — supporting UI chrome.
- **`formatters.ts`** — utility (work type label formatting, date helpers).

All views are `security_invoker = true`. `v_client_package_dashboard` comment notes: "Callers MUST also pass an explicit `tenant_id` filter (staff bypass tenant RLS via `get_current_user_tenant_id()`)."

`rpc_import_meeting_time_to_client` is a new function (migration `20260502062752`); purpose from migration comment: imports meeting time to the client view.

---

### 3 — Invitation system overhaul (30 Apr – 2 May)

**Commits:** `8559695e` "Finalized V2 invitation update", `11e27118` "Derived invite_as from tenant", `2af38ed2` "Added tenant-aware UI", `c0b8bb8b` "Fixed status vocab in cancel-invite", `c6e78ec1` "Revoked stale invite", `375d0aa3` "Fixed cancel invite flow", `8d284c40` "Fixed accept error surfacing", `afc90338` "Fixed duplicate v501 via sync", `d8e2ce86` "Added bulk-invite route & func", `13a73b75` "Fixed bulk invite redirect", `65eaa72a` "Added ManageInvites actions", `d606f477` "Added invite role validation", `0e3a9235` "Refined invite dialogs v3".
**Files:** `src/pages/AcceptInvitation.tsx` (82-line rework), `src/pages/ManageInvites.tsx`, `src/pages/admin/BulkInvite.tsx` (820 lines, new), `supabase/functions/bulk-send-invitations/index.ts` (266 lines, new), `supabase/functions/invite-user/index.ts`, `supabase/functions/cancel-invite/index.ts`, `supabase/functions/resend-invite/index.ts`, `supabase/functions/send-invitation-email/index.ts`, `src/components/AdminInviteUserDialog.tsx`, `src/components/client/TenantInviteDialog.tsx`, `src/components/client/TenantUsersTab.tsx`, `src/components/client/users/InviteUserDialog.tsx` (new), `src/components/client/users/RevokeInviteAlert.tsx` (new), `src/components/client/users/useInviteMutations.ts` (new).
**Migrations:** `20260502015042` + `20260502025918` (`accept_invitation_v2` RPC — two iterations, second corrects first), `20260502034216` (pre-launch invite cleanup — one-shot data migration).

The pre-launch cleanup migration (`20260502034216`) is the most operationally significant item in this section. It:
1. Took an audit-trail snapshot of every pending invite row before transition (inserted into `audit_eos_events`).
2. Revoked 13 pending invites pointing at orphaned/non-existent tenants (all `tenant_id = 319`).
3. Revoked 2 pending invites for AHMRC Training (Diamond RTO member; noted for re-invite via "Monday Superhero batch").
4. Revoked remaining pending Vivacity-team invites (Carl + Brian; noted for re-invite via separate Vivacity team onboarding flow).
5. Verification step in the migration asserts zero pending rows remain after execution.

`accept_invitation_v2` replaces the prior accept RPC. Migration `20260502015042` was the first cut; `20260502025918` is the corrected version. Both migrations exist in the file tree — the second one runs after and supersedes the first via `CREATE OR REPLACE`.

Bulk invite (`d8e2ce86`) adds an admin-facing CSV-driven batch invitation flow. The edge function `bulk-send-invitations` handles send, role validation, and redirect. `invite_as` is now derived from the tenant record rather than passed as a UI parameter (`11e27118`).

---

### 4 — Client users page (3 May)

**Commits:** `af37cf46` "Added ClientUsersPage & hook", `af54e1f3` "Added RHK home hook & page", `29bca818` "Fixed nav label to 'Users'".
**Files:** `src/components/client/ClientUsersPage.tsx` (360 lines, new), `src/components/client/users/` (InviteUserDialog, RevokeInviteAlert, useInviteMutations — all new), `src/hooks/use-client-tenant-users.ts` (new).
**Migrations:** `20260503073034`, `20260503073230`, `20260503080043` — three iterations of `v_client_tenant_users` view (iterative refinement; final version uses `DROP VIEW IF EXISTS` before `CREATE`).

Client contacts can now see and manage users within their own tenant from the client portal. The invite/revoke dialogs are client-portal variants distinct from the admin-side equivalents. Sidebar nav label was `"Users & Contacts"` → `"Users"`.

---

### 5 — Ask Viv client mode — final pieces (30 Apr)

**Commits:** `e4d83507` "Added Ask Viv panel to layout", `c577033e` "Added client AskVivPanel", `ba509def` "Added compliance-assistant fn", `0dcf5640` "Added Viv access validation", `e6cba118` "Added ai_client_query_usage table".
**Files:** `src/components/ask-viv/ClientAskVivPanel.tsx` (558 lines, new), `supabase/functions/compliance-assistant-client/index.ts` (663 lines, new), `supabase/functions/_shared/ask-viv-access.ts` (89 lines, new), `src/components/layout/ClientLayout.tsx`, `src/components/client/ClientChatbotLauncher.tsx` (deleted, 9 lines).
**Migration:** `20260430053631` — `ai_client_query_usage` table + RLS (self-read and Vivacity-staff-all policies; daily query cap tracker per user).

These are the delivery commits for the build session documented in `audit/2026-04-30-ask-viv-client-mode-build.md`. The build audit covers the design decisions in full; this entry records that all five prompts from that session landed in the `30 Apr → 021a09a9` window.

---

### 6 — RLS security hardening — three migration batches

**Commits:** `5acce94a` "Applied RLS fixes to security scan", `363966a5` "Fixed security findings".

**Batch 1 — 30 Apr (`20260430100018`):**
- `process_versions`: dropped a loose `process_versions_users_select` policy; tenant-scoped policy retained.
- Storage `suggest-attachments` bucket: replaced broad `SELECT`/`INSERT` with owner-scoped policies.
- Storage `compliance-packs` bucket: restricted `INSERT`/`UPDATE` from a broad service-role pattern to Vivacity staff only.

**Batch 2 — 2 May (`20260502073002`):**
- Storage `tenant-note-files` bucket: replaced four policies with path-scoped tenant-membership checks (previously `"Staff or members can…"`; now `"Staff or tenant members can…"` with path prefix guard).
- `academy_assessment_questions`: replaced `"Questions: authenticated users view"` (any authenticated user) with `"Questions: staff or enrolled learners view"` (staff or users enrolled in the containing academy).

**Batch 3 — 3 May (`20260503082248`):**
Six tables tightened in one migration:
1. `client_audit_response_documents` — four staff policies tightened from generic `"staff"` to `is_vivacity()` check.
2. `research_sources` — read policy scoped via parent job's tenant (previously open to authenticated users who could access the job ID).
3. `ai_event_payloads` — SELECT restricted to `is_vivacity()`.
4. `document_data_sources` — read scoped via owning document's tenant.
5. `document_ai_audit` — read scoped via owning document's tenant.
6. `compliance_template_sections` + `compliance_template_questions` — read scoped to parent template's tenant.

These three batches collectively close a security scan finding: multiple tables had policies that allowed any authenticated user to read rows they had no business accessing. All fixes follow the same pattern: replace `auth.role() = 'authenticated'` or similarly broad guards with either `is_vivacity()` (for staff-only tables) or a tenant-membership join (for client-accessible tables).

---

### 7 — AI / RAG pipeline updates (30 Apr)

**Commits:** `0e8e4a47` "Unified embed API key", `19a42d84` "Added chunk_index to RPC", `c7f06fe2` "Cleaned up non-existent refs", `9e063c99` "Fixed threshold defaults", `68640ea7` "Verified SRTO clause filtering", `f58f2466` "Added raw response logging", `fc31b81e` "Strengthened draft prompts", `98eb006f` "Updated draft validation & tests".
**Files:** `supabase/functions/embed-srto-corpus/index.ts` (159 lines changed), `supabase/functions/retrieve-srto-context/index.ts`, `supabase/functions/vector-index-rebuild/index.ts`, `supabase/functions/vector-index-update/index.ts`, `supabase/functions/vector-search/index.ts`, `supabase/functions/draft-executive-summary/_validation.ts` + `index.ts` + `validation_test.ts`, `supabase/functions/draft-finding/index.ts`, `supabase/functions/_shared/openai-embeddings.ts` (111 lines, new), `supabase/functions/_shared/ask-viv-prompts/global-prompt.ts`.
**Migration:** `20260430231030` — `match_srto_chunks` RPC extended to return `chunk_index`; lets consumers cite chunk positions in responses.

Key changes: embed API key unified across the corpus pipeline (`0e8e4a47`); `openai-embeddings.ts` extracted as a shared module. `match_srto_chunks` now returns `chunk_index` so the retrieval layer can pass positional references to the LLM. Draft validation tests updated; prompts strengthened. Raw response logging added to `draft-finding` for debugging failed drafts without losing the raw LLM output.

---

### 8 — Client inbox & reports refactor (30 Apr – 1 May)

**Commits:** `58ee562f` "Refactored client inbox hub", `4eaed536` "Fixed API param names", `6f274e4b` "Fixed client reports page", `fe6eb4e6` "Wired Generate Report flow", `b6e53ec8` "Fixed audit hook to edge func", `31077c34` "Fixed tenant filter in audits".
**Files:** `src/pages/ClientInboxPage.tsx` (606-line rework), `src/components/audit/workspace/ReportTab.tsx`, `src/hooks/useAuditReport.ts` (152-line rework), `src/hooks/useReleasedAudits.ts` (58 lines, new), `src/components/client/ReleasedAuditCard.tsx` (149 lines, new).

Inbox hub was refactored — prior split across `ClientCommunicationsPage.tsx` and `ClientInboxPage.tsx` collapsed into the inbox; the communications page and both notifications wrapper pages were deleted outright. Generate Report flow inside the client audit workspace wired to the edge function (was previously disconnected). Tenant filter bug in audit queries fixed (`31077c34`).

---

### 9 — Role helpers & admin tooling (30 Apr – 1 May)

**Commits:** `aea2306b` "Migrated role helpers in TU", `f598703f` "Searched for relationship_role uses", `05158f08` "Added dashboard VIP hooks", `d1463392` "Logged post-launch items".
**Files:** `src/lib/roles/relationshipRole.ts` (125 lines, new), `src/components/client/TenantUsersTab.tsx` (290-line rework), `src/pages/admin/AdminZeroProgressPackagesPage.tsx` (408 lines, new), `src/hooks/use-admin-zero-progress-packages.ts` (45 lines, new).

`relationshipRole.ts` centralises relationship-role helper logic previously scattered across components. `AdminZeroProgressPackagesPage` gives staff a view of packages with zero progress — used for identifying stuck clients. Dashboard VIP hooks added for Super Admin surface.

---

### 10 — Academy hubs & resource hub (30 Apr + 3 May)

**Commits:** `e8298d19` "Updated all 5 academy hubs", `6ebea355` "Updated Resource Hub per backlog", `8359eaf1` "Hidden archived tasks by default".
**Files:** `src/pages/client/AdministrationAssistantPage.tsx`, `src/pages/client/ComplianceManagerPage.tsx`, `src/pages/client/GovernancePersonPage.tsx`, `src/pages/client/StudentSupportOfficerPage.tsx`, `src/pages/client/TrainerHubPage.tsx`, `src/pages/client/ClientResourceHubPage.tsx`.

All five role-based academy hub pages updated (45–48 lines changed each — consistent template update). Resource Hub updated per backlog items. Archived tasks hidden by default on the tasks page.

---

### 11 — Deletions

The following files were removed entirely:
- `src/pages/ClientCommunicationsPage.tsx` (284 lines)
- `src/pages/ClientNotifications.tsx` (174 lines)
- `src/pages/ClientNotificationsWrapper.tsx` (10 lines)
- `src/pages/client/ClientCommunicationsWrapper.tsx` (10 lines)
- `src/pages/client/ClientNotificationsWrapper.tsx` (15 lines)
- `src/types/resource.ts` (7 lines)
- `src/components/client/ClientChatbotLauncher.tsx` (9 lines — replaced by Ask Viv)

Route entries for these pages were cleaned from `src/App.tsx`.

---

## Findings

- **No human commits in the window.** All 296 commits are `gpt-engineer-app[bot]` (Lovable). Workspace-root write-permission rule held.
- **Package dashboard view iterated heavily.** `v_client_package_dashboard` went through at least three CREATE OR REPLACE cycles on 2 May (`20260502055419` → `20260502063232` → `20260502074914`). The first version had a stage-completion logic bug (used `status_id = 2` instead of `IN (2,3)`); patch `20260502063232` fixed it; `20260502074914` is a fuller rewrite. Final view is the one at `20260502074914`; earlier migrations remain in the file tree and run in sequence.
- **`accept_invitation_v2` has two migration files.** `20260502015042` and `20260502025918` both define the same function via `CREATE OR REPLACE`. The second supersedes the first. Both are in the migration sequence — no harm, but worth noting if the accept flow behaves oddly: the function body at `20260502025918` is the live definition.
- **Pre-launch invite cleanup was a live data mutation.** Migration `20260502034216` deleted real rows (`UPDATE ... SET status = 'revoked'`). It captured an audit snapshot before acting and included a verification assertion. This is the highest-risk item in the window for post-hoc review.
- **Three RLS hardening batches.** Collectively fix a security scan finding across approximately 13 tables/buckets. All follow the same DROP-then-CREATE pattern; no existing correctly-scoped policies were removed.
- **`v_client_tenant_users` also iterated three times** on 3 May (`20260503073034` → `20260503073230` → `20260503080043`). Same CREATE OR REPLACE pattern; final at `20260503080043`.
- **`profile.state` integer check** — identified as a no-op in the 30 Apr Ask Viv build audit (`2026-04-30-ask-viv-client-mode-build.md`, finding 4). Still unresolved as of `021a09a9`. Not a security gap (inactive users are blocked by `verifyAuth`), but the `validateClientAskVivAccess` archived-user check remains dead code.
- **Backlog items Angela flagged (deferred):**
  - `is_team = false` on Angela's own account (`angela@vivacity.com.au`) despite `user_type = 'Vivacity Team'`. A trigger gap — backlog items 7, 8, 9. Must be resolved before the RBAC structured-fields refactor ships.
  - Academy-only users (`relationship_role = 'academy_user'`) currently lack access to Calendar and Resource Hub — contradicts product intent. Deferred (Option B in the Resource Hub coming-soon prompt).
  - Override modal email-format validation in the bulk invite flow — medium priority, carried from launch session.

---

## KB changes shipped

- No changes. Read-only audit.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ 021a09a9` — origin HEAD at time of audit. ("Polished Wednesday feeds", 2026-05-03.)
- `unicorn-cms-f09c59e5 @ 9cdc2a85` — local HEAD at audit start. ("Added Ask Viv panel to layout", 2026-04-30.)
- Net diff: 132 files changed, 16,437 insertions, 2,328 deletions.
- New migrations in window (23 files):
  - `20260430053631` — `ai_client_query_usage` table + RLS
  - `20260430100018` — RLS fixes batch 1 (process_versions, storage)
  - `20260430231030` — `match_srto_chunks` extended with `chunk_index`
  - `20260502015042` — `accept_invitation_v2` v1 (superseded)
  - `20260502023344` — (iterative Changes)
  - `20260502025918` — `accept_invitation_v2` v2 (live definition)
  - `20260502034216` — pre-launch invite cleanup (live data mutation)
  - `20260502055419` — `v_client_package_dashboard` v1
  - `20260502061224` — `v_client_package_stages` + `v_client_package_whats_next`
  - `20260502062752` — `rpc_import_meeting_time_to_client`
  - `20260502063232` — patch: stage completion `status_id IN (2,3)` fix
  - `20260502064808` — (iterative Changes)
  - `20260502070132` — (iterative Changes)
  - `20260502073002` — RLS fixes batch 2 (tenant-note-files, academy questions)
  - `20260502074914` — `v_client_package_dashboard` v3 (live definition)
  - `20260502080029` — `v_client_package_hours_by_type` + `v_client_package_hours_recent`
  - `20260502081037` — `v_client_package_hours_timeline`
  - `20260503073034` — `v_client_tenant_users` v1
  - `20260503073230` — `v_client_tenant_users` v2
  - `20260503074222` — `v_client_home_hero`
  - `20260503080043` — `v_client_tenant_users` v3 (live definition)
  - `20260503081540` — `v_client_home_feed`
  - `20260503082248` — RLS fixes batch 3 (6 tables)
- Notable named commits (Lovable session terminals):
  - `3f05d80d` — Added debug log per audit
  - `56c77948` — Fixed embed column in draft-summary
  - `e6cba118` — Added ai_client_query_usage table
  - `0dcf5640` — Added Viv access validation
  - `ba509def` — Added compliance-assistant fn
  - `c577033e` — Added client AskVivPanel
  - `e4d83507` — Added Ask Viv panel to layout
  - `d2697d94` — Removed Chatbot launcher
  - `0e8e4a47` — Unified embed API key
  - `363966a5` — Fixed security findings
  - `19a42d84` — Added chunk_index to RPC
  - `c7f06fe2` — Cleaned up non-existent refs
  - `9e063c99` — Fixed threshold defaults
  - `68640ea7` — Verified SRTO clause filtering
  - `fc31b81e` — Strengthened draft prompts
  - `f58f2466` — Added raw response logging
  - `98eb006f` — Updated draft validation & tests
  - `8359eaf1` — Hidden archived tasks by default
  - `e8298d19` — Updated all 5 academy hubs
  - `58ee562f` — Refactored client inbox hub
  - `4eaed536` — Fixed API param names
  - `b6e53ec8` — Fixed audit hook to edge func
  - `6f274e4b` — Fixed client reports page
  - `fe6eb4e6` — Wired Generate Report flow
  - `31077c34` — Fixed tenant filter in audits
  - `9d69a2af` — Update plan
  - `8559695e` — Finalized V2 invitation update
  - `11e27118` — Derived invite_as from tenant
  - `2af38ed2` — Added tenant-aware UI
  - `2afcafde` — Saved brand colors to memory
  - `c6e78ec1` — Revoked stale invite
  - `c0b8bb8b` — Fixed status vocab in cancel-invite
  - `375d0aa3` — Fixed cancel invite flow
  - `8d284c40` — Fixed accept error surfacing
  - `afc90338` — Fixed duplicate v501 via sync
  - `d8e2ce86` — Added bulk-invite route & func
  - `13a73b75` — Fixed bulk invite redirect
  - `65eaa72a` — Added ManageInvites actions
  - `d1463392` — Logged post-launch items
  - `f598703f` — Searched for relationship_role uses
  - `aea2306b` — Migrated role helpers in TU
  - `05158f08` — Added dashboard VIP hooks
  - `f8d6062a` — Refactored ClientPackagesPage
  - `0e3a9235` — Refined invite dialogs v3
  - `05af9495` — Added stepper and whats next
  - `2b680025` — Hid Phase segment when empty
  - `c16a6186` — Fixed package_id in RPC
  - `1d017bb3` — Fixed stage completion logic
  - `36fc9c1c` — Added zero-progress page
  - `ab4e426b` — Patched client hours view
  - `e5487bb6` — Fixed auth and storage leaks
  - `34d6c544` — Fixed card title source
  - `277ac567` — Added current_stage_shortname
  - `27ebe3ee` — Added time-entry views & hooks
  - `3b7ded53` — Added package history section
  - `534ec4b3` — Added burndown chart to card
  - `b5d57510` — Fixed display labels in burndown
  - `d606f477` — Added invite role validation
  - `af54e1f3` — Added RHK home hook & page
  - `af37cf46` — Added ClientUsersPage & hook
  - `29bca818` — Fixed nav label to "Users"
  - `eb9f106d` — Updated ClientHomePage hook & UI
  - `9574966d` — Added Live Reporting Reminders
  - `5acce94a` — Applied RLS fixes to security scan
  - `6ebea355` — Updated Resource Hub per backlog
  - `021a09a9` — Polished Wednesday feeds

---

## Decisions

- No ADRs drafted or resolved this session.

---

## Open questions parked

- **`is_team` trigger gap** — Angela's account has `user_type = 'Vivacity Team'` but `is_team = false`. Backlog items 7 (RBAC structured-fields refactor), 8 (backfill `is_team` for Angela), and 9 (investigate trigger gap). Item 8 must ship before item 7's gate can be tightened to `is_team` alone. Not actioned in this window.
- **Academy-only users** — `relationship_role = 'academy_user'` users currently lack Calendar and Resource Hub access, which contradicts product intent. Deferred as Option B in the Resource Hub prompt. Not actioned in this window.
- **Bulk invite override modal** — email format validation not yet added (backlog item 6). Carried from launch session.
- **`profile.state` integer check** — `validateClientAskVivAccess` archived-user check is still a no-op (integer column compared against a string). Identified in the 30 Apr build audit. No security gap; medium-priority cleanup.
- **`accept_invitation_v2` duplicate migrations** — two migration files define the same function. Worth confirming that `20260502025918` is the live definition in production before debugging any accept-flow issues.
- **Supabase `config.toml` +3 lines** — `compliance-assistant-client` function registration presumably added. Not inspected in detail; worth verifying if edge function deployments fail.

---

## Tag

`audit-2026-05-04-angela-client-portal-packages-invitations`
