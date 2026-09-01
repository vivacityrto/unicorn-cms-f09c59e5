# Architecture

> **Last updated:** 2026-09-01 · **Reconsider by:** 2026-10-01 (this codebase adds Edge Functions and migrations fast enough that a one-month shelf life is realistic, not conservative — see the velocity note under Edge functions below) · **Confidence:** high on counts (regenerated via direct repository measurement, not inference); medium on per-function purpose for anything not skimmed individually; **repository counts, not deployed-Supabase counts** — see the caveat under Edge functions.
>
> **Reflects commit:** `unicorn-cms-f09c59e5@5782860e` (2026-09-01). Full regeneration under [the optimization and KB renewal plan](../reference/codebase-optimization-plan-2026-08-28.md), superseding the 2026-05-15 revision (which itself only partially reconciled a 2026-04-30 baseline — see `git log` on this file for that history, preserved rather than described here). Generated Supabase types (`src/integrations/supabase/types.ts`) were regenerated the same day as the newest migration in this measurement (2026-08-28) — types are not stale relative to schema as of this pass.
>
> System design reference for Unicorn 2.0. How everything connects, where logic lives, and the constraints to respect. Note: a separate Vivacity Supabase project previously shared the "Unicorn 2.0" name but had different edge functions and module scope. That sibling project is now largely superseded — this doc describes the current codebase.

---

## Product overview — flagship surfaces

Unicorn 2.0 has three flagship product surfaces (consultant- or client-facing, saleable) and one internal operating system (load-bearing for Vivacity itself, but not sold). The KB framing reset on 2026-05-15 — see [reference/decision-trail.md#adr-013](../reference/decision-trail.md#adr-013).

### Flagship #1 — CSC workflow (staff `CLIENTS` section)

Where Client Success Consultants run their portfolio. The staff sidebar's `CLIENTS` section ([DashboardLayout.tsx:38-48](../../../src/components/DashboardLayout.tsx#L38-L48)):

| Item | Path | Purpose |
|---|---|---|
| Clients | `/manage-tenants` | Client list — CSC load, packages, status, risk, anniversary; ~407 tenants in production |
| Packages | `/manage-packages` | Package catalogue (KS-GTO, M-RR, M-AM, M-DR, etc.) and assignment |
| Documents | `/manage-documents` | System document library (~575 docs, ~21 categories, ~78 phases) |
| Communications | `/communications` | Outbound/inbound client communications hub |
| Support Tickets | `/support-tickets` | Per-client ticketing |
| RTO Tips | `/rto-tips` | Quick-reference compliance content |
| Compliance Auditor | `/compliance-audits` | AI-assisted compliance auditor |
| Audits | `/audits` | Full audit engagement workspace (CHC, Mock, CRICOS, Due Diligence) |

### Flagship #2 — Client Portal (`/client/*`)

What client RTOs see ([DashboardLayout.tsx:125-143](../../../src/components/DashboardLayout.tsx#L125-L143)). RLS-gated to the client's own tenant.

| Item | Path | Audience |
|---|---|---|
| Home | `/client/home` | All client users |
| Documents | `/client/documents` | All client users |
| Resource Hub | `/client/resource-hub` | All client users |
| Calendar | `/client/calendar` | All client users |
| Notifications | `/client/notifications` | All client users |
| Reports | `/client/reports` | All client users |
| Manage Team | `/team-settings` | Tenant admin only |

Plus the Academy learner surface (next).

### Flagship #3 — Vivacity Academy

Learning platform for client RTO staff. Two surfaces:

- **Learner surface** — role-specific dashboards (Trainer, Compliance Manager, Governance Person, Student Support Officer, Administration Assistant), `/academy/courses`, `/academy/pdp` (Professional Development Plan), `/academy/certificates`, `/academy/events`, `/academy/community`, lesson viewer, assessment player, results.
- **Academy Builder** — Vivacity Super Admin only. `/superadmin/academy/builder`, `/superadmin/academy/enrollments`, `/superadmin/academy/certificates`, `/superadmin/academy/tenant-access`, `/superadmin/academy/package-course-rules`.

**PDP** anchors development goals to SRTO 2025 Standards; captures evidence (12 types), in-lesson reflections, and manager mid/end-cycle reviews; powers a workforce dashboard for tenant admins (`/client/staff-pdps`) and Vivacity (`/superadmin/workforce-pdp`).

### Internal operating system — EOS Level 10 (staff `EOS` section)

Vivacity's own operating system — not sold to clients, not part of the Client Portal. The `EOS` section ([DashboardLayout.tsx:50-69](../../../src/components/DashboardLayout.tsx#L50-L69)) includes EOS Overview, Leadership Dashboard, Scorecard, Mission Control (V/TO), Rocks, Flight Plan, Risks & Opportunities, To-Dos, Meetings, Quarterly Conversations, Accountability Chart, GWC Trends, Rock Analysis, Client Impact, Processes. Visibility is role-aware (Leadership-only items hidden from Team Members). Client-tagged EOS items roll up into CSC workflow contexts ("Client Impact"), giving consultants a unified view of work-for-clients without exposing EOS to client tenants.

### Staff sidebar — full section map

For reference, the seven top-level sections in the Vivacity staff sidebar and who sees them ([DashboardLayout.tsx](../../../src/components/DashboardLayout.tsx)):

| # | Section | Items | Visible to |
|---|---|---|---|
| 1 | WORK | Dashboard, Executive Dashboard, Inbox, My Work, Tasks, Time Inbox, My Calendar, Meetings, Event Calendar | All Vivacity Team |
| 2 | CLIENTS | Clients, Packages, Documents, Communications, Support Tickets, RTO Tips, Compliance Auditor, Audits | All Vivacity Team |
| 3 | EOS | 15 items (Overview → Processes) | All Vivacity Team; Leadership-only items hidden from Team Members |
| 4 | RESOURCE MANAGEMENT | Content Dashboard + 8 library managers | Super Admin + Team Leader |
| 5 | ADMINISTRATION | Team Users, Tenant Users, Manage Invites, User Audit, Audit Logs, Email Templates | Super Admin full; Team Leader read-only on user tables |
| 6 | ACADEMY BUILDER | Tenant Access, Enrolments, Certificates, Academy Builder, Package → Course Rules | Super Admin only |
| 7 | SYSTEM CONFIG | 14 items (Manage Packages, Manage Stages, Stage Builder, Stage Analytics, EOS Processes, Knowledge Library, AI Assistant, Add-in Settings, ClickUp Mapping, Code Tables, Lifecycle Checklists, Merge Field Tags, Governance Documents, SharePoint Sites) | Super Admin only |

---

## System overview

```
Lovable (React + Vite + TS + shadcn + Tailwind — admin/consultant + client UI)
    │
    ├──► Supabase project: yxkgdalkbrriasiyyrwk
    │        ├── PostgreSQL (multi-tenant, RLS)
    │        │     ├── tenants, tenant_members, tenant_users, user_invitations, tenant_settings
    │        │     ├── users (profile)
    │        │     ├── packages, package_stages, package_stage_instances
    │        │     ├── EOS schema (eos_vto, eos_rocks, eos_issues, eos_todos,
    │        │     │              eos_scorecard_metrics, eos_scorecard_entries,
    │        │     │              eos_meetings, eos_meeting_segments, eos_meeting_participants,
    │        │     │              eos_meeting_ratings, eos_meeting_series,
    │        │     │              eos_qc, eos_agenda_templates, eos_workspaces,
    │        │     │              eos_flight_plans, eos_health_snapshots, eos_alerts,
    │        │     │              accountability_charts, accountability_chart_versions,
    │        │     │              accountability_functions, accountability_seats,
    │        │     │              accountability_seat_roles, accountability_seat_assignments)
    │        │     └── Audit schema (audit_templates, audit_sections, audit_questions,
    │        │                       client_audits [+risk_rationale col], audit_findings,
    │        │                       audit_actions, audit_reports,
    │        │                       client_audit_responses [+ai_* cols],
    │        │                       client_audit_response_documents,
    │        │                       ai_evidence_analysis_usage,
    │        │                       srto_corpus [pgvector 1536-dim, HNSW])
    │        ├── Auth (email/password, invitation token flow, password reset)
    │        ├── Realtime (EOS live meeting sync via channels)
    │        ├── Storage (tenant documents, audit evidence, avatars)
    │        └── Edge Functions (see list below)
    │
    ├──► Mailgun (transactional email via `send-invitation-email` + Supabase auth)
    │
    ├──► Microsoft 365 / Outlook (calendar sync, email capture, addin, SharePoint)
    ├──► ClickUp (task and time sync)
    ├──► training.gov.au (RTO/qualification lookup + sync — `tga-*` functions)
    ├──► Xero (invoice sync + webhook — new since the 2026-05-15 revision, see Edge functions)
    ├──► Anthropic API — direct, bypassing the Lovable AI Gateway (`_shared/anthropic-client.ts`; Ask Viv Assistant)
    ├──► OpenAI API — direct, for embeddings (`_shared/openai-embeddings.ts`) and `gpt-4o-mini` in `assistant-answer`
    ├──► Lovable AI Gateway (`google/gemini-*` models — most other AI functions)
    └──► [Planned] Stripe
```

**Supabase project ID:** `yxkgdalkbrriasiyyrwk` (from `supabase/config.toml`).

---

## Edge functions (195 in the repository — see the deployed-vs-repository caveat below)

All in [supabase/functions/](../../../supabase/functions/). Pattern: `requireCaller`/`requireSharedSecret` gate (see `_shared/requireCaller.ts` and `AGENTS.md → Edge Function security guardrails` — the old "manual `supabase.auth.getUser()`" pattern below in Constraints is what this superseded, not the current standard), then JSON response with `{ ok, code, detail }` error shape.

**Velocity:** 195 top-level function directories with an `index.ts`, plus `_shared/` (58 files — helpers, not deployed as functions themselves) and `_retired/` (3 stub subdirectories kept for reference, not deployed). This is up from 124 at the 2026-05-15 revision — roughly 70 net-new functions in under four months, consistent with the migration velocity below (~20% of all 1,515 migrations landed in the last two months alone). Re-measure before trusting this count if it's been more than a few weeks.

**Repository vs. deployed — do not conflate the two.** This count is a repository count (directories under `supabase/functions/` with an `index.ts`), not a live query against the hosted Supabase project (`yxkgdalkbrriasiyyrwk`). Concrete evidence the two sets differ in both directions:
- `supabase/config.toml` references `admin-change-password`, `invite-to-tenant`, and `run-document-job` — none of which have a matching directory in the repo today. These may be deployed-but-removed-from-repo, or stale config entries; `admin-change-password` is the same function this doc previously flagged as "not found — verify with RJ," now corroborated by the `config.toml` entry rather than resolved.
- Five functions (`issue-token`, `consume-token`, `mark-token-used`, `invite-or-reset-user`, `create-tenant`) carry explicit header comments marking them **vendored from production** ("still ACTIVE on project `yxkgdalkbrriasiyyrwk` … vendored via `get_edge_function` on 15 Jul 2026") — reverse-engineered back into the repo from what's actually deployed, not authored from repo history. Two of those five (`invite-or-reset-user`, `create-tenant`) are further marked **orphan — no in-repo callers**: deployed and presumably still invoked by something, but nothing in the current frontend calls them.
- `generate-client-audit-report-docx`, `generate-client-audit-report`, `repair-staff-uuids`, and `send-magic-link` are similarly marked orphan in their own header comments.

Treat repo presence as evidence, not proof of deployment; treat repo absence as evidence, not proof of retirement.

**Auth / identity / user management (~26):** `invite-user`, `resend-invite`, `cancel-invite`, `invite-or-reset-user` *(orphan)*, `send-invitation-email`, `delete-user`, `bulk-user-action`, `bulk-send-invitations`, `bulk-account-actions` (thin orchestrator over `activate-ghost-user` + `send-password-reset` — its own code comment: "NEVER reimplement the senders here"), `bulk-reassign-team-member`, `toggle-user-status`, `update-user-profile`, `update-user-role`, `update-role-permission`, `send-password-reset`, `send-self-password-reset`, `send-staff-onboarding-email`, `staff-onboarding-workbook`, `provision-m365-user`, `activate-ghost-user`, `create-tenant` *(orphan, vendored)*, `repair-staff-uuids` *(orphan — SuperAdmin sweep realigning `users.user_uuid` with `auth.users.id`)*, `unlink-email`, `set-invite-password`, `generate-recovery-link`, `reconcile-invite-delivery-status` (Mailgun Events API fallback to the `mailgun-webhook` push path), `issue-token` / `consume-token` / `mark-token-used` *(vendored, still active)*, `cohort-access-sender-worker` (staff-initiated, time-budgeted drain; calls `activate-ghost-user` + `send-password-reset` unmodified; **`pg_cron` is explicitly not permitted to invoke this function** per its own header).

**AI / Ask Viv / intelligence (~30):** `ask-viv-assistant`, `ask-viv-assistant-client`, `embed-ask-viv-corpus`, `embed-ask-viv-documents`, `generate-ask-viv-faqs`, `ai-orchestrator`, `ai-generate-suggestions`, `ai-suggest-rock`, `academy-ai-generate`, `copilot-chat`, `compliance-assistant`, `client-ai-companion`, `assistant-answer`, `help-center-chat`, `analyze-document`, `extract-document-fields`, `extract-note-title`, `extract-suggest-title`, `chunk-document`, `scan-document`, `query-knowledge-graph`, `vector-search`, `vector-index-rebuild` / `vector-index-update` / `vector-index-remove`, `calculate-predictive-risk`, `run-tenant-risk-forecast`, `run-strategic-signal-analysis`, `strategic-orchestration`, `risk-command-engine`, `scan-risk-radar`, `run-retention-forecast`, `run-workload-forecast`, `run-workflow-optimisation`, `research-answer`, `research-scrape`, `research-audit-intelligence`, `research-evidence-gap-check`, `research-template-gap-analysis`, `research-enrich-tenant`, `research-public-snapshot`, `research-tas-context`.

  **New AI subsystem, not previously documented here.** `_shared/anthropic-client.ts` calls the Anthropic Messages API **directly** ("the Lovable AI Gateway does not support Anthropic/Claude models at all … this bypasses the gateway entirely, the same way `_shared/openai-embeddings.ts` already bypasses it for embeddings"), exporting `CLAUDE_SONNET_MODEL = "claude-sonnet-5"` and `CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001"`; used by the Ask Viv Assistant. Backed by three new `_shared/` subsystems: `ai-brain/` (confidence-scorer, context-builder, escalation-detector, fact-builder, reasoning-engine, system-prompt), `ask-viv-fact-builder/` (data-retrieval, fact-derivation, freshness, portfolio-facts, record-links, scope-inference, scope-lock — with its own tests), and `ask-viv-prompts/` (safety pipeline, compliance/global/knowledge prompts, intent classifier, gap-key-mapper, phrase-filter, quality-telemetry, response-validator-v2 — with its own tests). This **resolves** the "Anthropic models are not currently routed" open question from the 2026-05-15 revision — see Open architectural questions below.

  Also new: `mcp` — auto-generated by `@lovable.dev/mcp-js`, bundled from `src/lib/mcp/index.ts`; a Lovable MCP bridge, not hand-authored (don't hand-edit its `index.ts`; see `AGENTS.md` for why it's gitignored from the usual diff-review expectations).

**AI audit stack (~14 — up from 7 at the last revision, see `reference/ai-audit-stack.md`):** the original 7 (`embed-srto-corpus`, `retrieve-srto-context`, `draft-finding`, `record-finding-decision`, `analyse-evidence`, `draft-executive-summary`, `record-executive-summary-decision`) plus `create-client-audit`, `delete-incomplete-audit`, `generate-client-audit-report`, `generate-client-audit-report-docx` *(orphan)*, `record-completed-audit`, `release-audit-report`, `export-pdp-audit-pack`. **This resolves module-status.md's previous "no dedicated audit edge function" note** — `create-client-audit` was flagged there as reverted the same day it shipped; it's back, and the surface has grown since.

**Meetings / EOS (~12):** `generate-meeting-recurrence`, `generate-meeting-summary`, `generate-minutes-draft`, `generate-minutes-from-transcript`, `extract-copilot-minutes`, `publish-meeting-minutes`, `create-meeting-time-drafts`, `create-tasks-from-minutes`, `sync-meeting-artifacts`, `scorecard-refresh`, `summarize-daily-notes`, `generate-email-note`.

**Outlook / Microsoft 365 / addin (~18):** `outlook-auth`, `sync-outlook-calendar`, `sync-outlook-calendar-cron`, `outlook-time-draft-worker`, `capture-outlook-email`, `addin-email-capture`, `addin-auth-exchange`, `addin-diagnostics-usage`, `addin-email-create-task`, `addin-email-link-attachments`, `addin-meeting-capture`, `addin-meeting-create-time-draft`, `send-email-graph`, `send-composed-email`, `send-stage-email`, `get-message-attachment-url`, `upload-message-attachment`, `handle-email-intake` (Email Triage intake — server-to-server from Power Automate, auth via constant-time `x-intake-secret` compare, no JWT), `kpi-email-log-sync` (pulls the caller's Outlook Inbox + Sent Items, upserts `kpi_email_log`, computes `response_minutes` per conversation).

**SharePoint (~12):** `browse-sharepoint-folder`, `import-sharepoint-template`, `link-sharepoint-document`, `provision-tenant-sharepoint-folder`, `resolve-tenant-folder`, `validate-sharepoint-root-folder`, `deliver-governance-document`, `verify-compliance-folder`, `check-tenant-sharepoint-liveness`, `get-sharepoint-parent-folder`, `resolve-sharepoint-folder-url`, `upload-sharepoint-file`.

**training.gov.au / TGA (9):** `search-organisations`, `get-organisation-details`, `tga-integration`, `tga-sync`, `tga-fetch-scope`, `tga-rto-import`, `tga-rto-preview`, `tga-rto-sync`, `tga-search-training` (**`tga-product-lookup` from the last revision no longer exists under that name**).

**Package / lifecycle (3):** `add-missing-packages`, `run-stage-health-monitor`, `tenant-lifecycle`. **`calculate-phase-completeness` no longer exists** — removed or renamed since the last revision; verify with RJ before assuming its function moved elsewhere.

**ClickUp (5):** `sync-clickup-tasks`, `sync-clickup-time`, `fetch-clickup-comments`, `import-clickup-csv`, `clickup-ai-search`.

**Xero — new integration, absent from every prior revision (5):** `xero-auth`, `xero-invoice-list`, `xero-invoice-status`, `xero-invoice-sync-all`, `xero-webhook`. **Confirm which Vivacity/ComplyHub Xero account this integration targets before referencing it in any client- or entity-facing content** — the org runs two legally separate ABNs with separate Xero accounts (see the org's routing rules), and this doc doesn't currently record which one is wired up.

**Documents / generation / bulk (~14):** `generate-document`, `generate-document-description`, `generate-excel-document`, `generate-pack`, `generate-release-documents`, `generate-staff-checklist`, `bulk-generate-phase-documents`, `bulk-generate-documents-launcher`, `bulk-generate-documents-resume-stalled`, `bulk-generate-documents-worker`, `upload-portal-document`, `generate-membership-certificate`, `generate-certificate-pdf` (branded A4 landscape PDF from Angela's PNG template, uploaded to the `academy-certificates` bucket, signed URL returned), `export-client-timeline-pdf`, `export-compliance-pack`.

**Email / notifications / campaigns (~22):** `notify-chat`, `notify-action-shared`, `notify-merge-fields-updated`, `notify-suggestion-submitted`, `generate-notifications`, `process-notification-outbox`, `process-notification-queue`, `mailgun-send`, `mailgun-webhook`, `send-mailgun-template`, `send-broadcast-campaign`, `send-automated-email` (**both of these resolve module-status.md's previous "not yet confirmed" note for the campaign builder / automated-email dispatcher**), `send-email`, `send-enhanced-email`, `send-notification-email`, `send-test-email`, `send-magic-link` *(orphan)*, `send-action-item-due-reminders`.

**Unicorn 1.0 migration (3, unchanged):** `import-unicorn1-client`, `lookup-unicorn1-client`, `search-unicorn1-users`.

**Academy / admin / misc ops (~8):** `academy-backfill-course-thumbnails`, `academy-fetch-vimeo-transcript`, `academy-import-vimeo-showcase`, `backfill-vimeo-durations`, `pdp-auto-evidence`, `regulator-watch-check`, `dashboard-test-seed`.

**`_shared/` (58 files)** is a much richer, security-hardening-focused layer than function counts alone suggest — beyond CORS/auth basics (`auth-helpers.ts`, `admin-authorization.ts`, `addin-auth.ts`, `supabase-client.ts`, `response-helpers.ts`, `cors.ts`, `escape-html.ts`), it now includes `requireCaller.ts` (+ helpers, docs, and its own test coverage — the canonical caller gate, see Constraints below), `webhook-signature.ts`, `safe-fetch-url.ts`, `safe-redirect-path.ts`, `oauth-redirects.ts`, `oauth-states.ts`, `password-reset-rate-limit.ts`, `app-base-url.ts` / `app-base-url-parse.ts` (+ an open-redirect regression test), `users-write-allowlist.ts`, `cron-auth.ts` / `cron-invoke-auth.ts`, `drive-root.ts`, Microsoft Graph clients (`graph-client.ts`, `graph-app-client.ts`, `microsoft-scopes.ts`), email helpers (`email-merge.ts`, `email-urls.ts`), and the AI/vector helpers already described above (`openai-embeddings.ts`, `anthropic-client.ts`, `vector-helpers.ts`). Most of the security-hardening helpers carry adjacent `.test.mjs`/`.test.ts` coverage — see `AGENTS.md`'s Edge Function test-inventory notes (P0.2) for which harness actually runs them.

---

## Multi-tenancy

Every tenant-scoped row carries `tenant_id: int`. Tenant `6372` is Vivacity (staff consultancy); every other tenant is a client RTO.

**Two membership tables — both active:**

| Table | Purpose | Role values | Key columns |
|---|---|---|---|
| `tenant_members` | Platform RBAC — who has active access to the Unicorn platform for a given tenant | `Admin` / `General User` | `status` (active/inactive/pending), `invited_at`, `joined_at` |
| `tenant_users` | Client-side contacts — users associated with a client RTO tenant, and their contact role | `parent` (can manage) / `child` (read-only) | `relationship_role` (text, FK to `dd_relationship_role.value`: `primary_contact`/`secondary_contact`/`user`/`academy_user` — **not** separate booleans; the old `primary_contact`/`secondary_contact` boolean columns were superseded by migration `20260518023538_*` , Phase 4C) |

`tenant_members` is the table used by RLS policies and auth checks (see ritual below). `tenant_users` is the operational table for invite-user, email delivery, document generation, and M365 provisioning. `useClientActingUser.ts` queries `tenant_users` first (primary contact), then falls back to `tenant_members` (Admin role) — confirming the two tables are complementary, not redundant.

**Role split:**
- Vivacity tenant → roles `Super Admin`, `Team Leader`, `Team Member`
- Client tenants → roles `Admin`, `User`

**Helper functions (Postgres):**
- `is_vivacity()` — current user belongs to tenant 6372 (used in RLS policies)
- `is_superadmin()` — current user's `unicorn_role = 'Super Admin'`
- `current_tenant()` — user's active tenant
- `set_active_tenant(tenant_id)` — Vivacity Super Admins can switch context
- `fn_package_stream(p_package_id)` (added 2026-04-23, migration `20260423093423_…`) — derives a regulatory-stream tag (`'rto' | 'cricos' | 'gto' | 'generic'`) from a package's name/slug. Used by the updated `start_client_package` RPC to enforce a duplicate-stream guard.

**Staff-only Academy admin RPCs (added 2026-04-21, all gated by `is_vivacity()`):**
- `fn_academy_enrollment_stats()` → `jsonb` of six dashboard tiles (total/active/completed/expired/revoked/auto_lifetime).
- `fn_academy_enrollment_lesson_detail(p_enrollment_id bigint)` → per-enrolment lesson progress rows.
- `fn_academy_rule_dashboard_stats()` → package-rule dashboard counts (active rules / total mappings / auto-enrolments / unmapped packages).
- Migrations: `20260421082533_da37ce62-…sql`, `20260421085406_b2a157f8-…sql`. Surfaced in [src/pages/superadmin/AcademyEnrolmentsPage.tsx](../../../src/pages/superadmin/AcademyEnrolmentsPage.tsx) via [src/hooks/academy/useAcademyEnrollments.ts](../../../src/hooks/academy/useAcademyEnrollments.ts).

**Edge function auth note:** Edge functions do NOT call `is_vivacity()` directly. They check the `is_vivacity_internal` boolean column on the `users` table (e.g. `.select('is_vivacity_internal')`), or use the `is_vivacity_staff` RPC (`supabase.rpc('is_vivacity_staff', {p_user: userId})`). The `has_tenant_access_safe` RPC handles tenant membership checks in shared addin auth (`_shared/addin-auth.ts`). The canonical pattern in [conventions.md](../pinned/conventions.md) covers the simplified form; real functions vary.

**RLS conventions (see [conventions.md](../pinned/conventions.md#rls) for full rationale and checklist):**
1. Every new table with mixed staff + client access needs **two policies**:
   - Tenant-read SELECT via tenant membership check (client RTO users)
   - Staff ALL via `is_vivacity()` (Vivacity consultants)
2. Then `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — **explicitly**. Writing policies without enabling is a silent failure.

---

## Auth

- Supabase Auth with email/password primary.
- Invitation token flow: `user_invitations` table holds SHA256-hashed tokens; [src/pages/AcceptInvitation.tsx](../../../src/pages/AcceptInvitation.tsx) validates, creates auth user, upserts `tenant_members`.
- Password reset via Supabase's native recovery flow + [src/pages/ResetPassword.tsx](../../../src/pages/ResetPassword.tsx).
- Magic link — email template exists (`supabase/email-templates/magic-link.html`) but no dedicated frontend handler. Either unused or relies on Supabase default.
- Session state lives in [src/hooks/useAuth.tsx](../../../src/hooks/useAuth.tsx) — `AuthProvider` wraps the router, exposes `{ user, session, profile, loading, signOut, refreshProfile }`.
- Protected routes via [src/components/ProtectedRoute.tsx](../../../src/components/ProtectedRoute.tsx).

Diagnostics reference: [docs/INVITE_USER_DIAGNOSTICS.md](../../../docs/INVITE_USER_DIAGNOSTICS.md) — error codes + SMTP verification.

---

## Frontend (src/)

- **Pages** (`src/pages/`, 289 files, counted directly): 185 top-level + 54 in `client/` + 28 in `admin/` (26 flat + `admin/ai-insights/` (5, backs the `/admin/ai-insights` AI Drafting Insights dashboard) + `admin/settings/` (1, `ReportingObligations.tsx` — new, undocumented until this pass)) + 11 in `superadmin/` (all Academy Builder pages) + 8 in `academy/` (5 flat + 3 in `academy/pdp/`) + 1 each in `addin/`, `internal/`, `teams/`. **Academy content is scattered across three top-level locations** (`academy/`, several `Academy*` files inside `client/`, and all of `superadmin/`) — add them up before citing a single "Academy page count." Many pages have `*Wrapper` variants that handle layout/auth boilerplate around the core page; when in doubt, the `Wrapper` is what `App.tsx` mounts (see `scripts/generate-route-manifest.mjs`'s `lazy`/`importSource` fields to check any specific route).
- **Components** (`src/components/`):
  - `ui/` — shadcn-ui primitives
  - `layout/` — nav, sidebar, header
  - `admin/` — user/tenant admin tables & dialogs
  - `eos/` — the EOS module (largest subtree): rocks, issues, todos, scorecard, V/TO editor, meeting controls, live meeting view, QC scheduler, accountability chart. Subdirs `client/` (client-facing) and `qc/` (quarterly conversations).
  - `audit/` — audit inspection dialogs and workspace pieces
  - `dashboard/` — stats, charts
  - `ask-viv/` — client Ask Viv panel (`ClientAskVivPanel.tsx`) and staff equivalents
  - `profile/`, `tenant/`
- **Contexts** (`src/contexts/`) — `ViewModeContext.tsx` (admin vs. client view), `ClientPreviewContext.tsx`, `ClientTenantContext.tsx`, `PageTitleContext.tsx`, `TenantTypeContext.tsx`.
- **Features** (`src/features/`) — **new top-level directory since the 2026-05-15 revision**, not previously documented here. Currently one feature module, `src/features/pdp/` (Academy PDP — types, API helpers, hooks, workforce queries; components in its own `components/` subdir), structured differently from the flat `pages/`+`hooks/`+`components/` split everywhere else. This looks like an emerging feature-module convention (the "Lifecycle Checklists pilot" the optimization plan discusses would follow the same shape) — watch for more `src/features/<name>/` directories appearing, and note this pattern explicitly if/when a second one lands.
- **Hooks** (`src/hooks/`) — 296 files (confirmed exact match against the optimization plan's own count). Domain clusters include EOS, Audits, Academy (`src/hooks/academy/`), plus `useAuth`, `useMobile`, `useToast`, `useAISuggestions`, `useNotifications`, `useDashboardData`, and more.
- **Integrations** (`src/integrations/supabase/client.ts`) — the Supabase JS client singleton; `src/integrations/supabase/types.ts` — generated types, 73,463 lines, regenerated 2026-08-28 (same day as the newest migration in this pass — not stale relative to schema as of this measurement).
- **Types** (`src/types/audit.ts`, `eos.ts`, `qc.ts`) — domain types.

---

## Data layer conventions

- **Reads** — `@tanstack/react-query` via `useQuery`. `QueryClient` is instantiated once at the top of `App.tsx` and never re-created.
- **Mutations** — `useMutation`; on success, invalidate relevant query keys.
- **Real-time** — Supabase channels, typically inside a domain hook (see [useMeetingRealtime](../../../src/hooks/useMeetingRealtime.tsx) for the live-meeting example).
- **Forms** — `react-hook-form` + `zod` schemas. Validation at the form layer, RLS at the DB layer.

Full patterns in [conventions.md](../pinned/conventions.md).

---

## Storage

Storage buckets are tenant-scoped with path-based policies (convention: `tenant-{id}/...` prefix). Current buckets (inferred from UI surfaces — confirm with RJ before assuming exact names):
- Tenant documents
- Audit evidence / references / reports
- User avatars

Historical Vivacity docs list five audit-specific storage buckets by name — those belong to the sibling Supabase project, not this one.

---

## Automation layer

| Type | Current state |
|---|---|
| Email automation | Mailgun + Microsoft Graph (`send-email-graph`, `send-composed-email`, `send-stage-email`). Auth emails via Supabase. |
| Outlook calendar | ✅ Live via `sync-outlook-calendar`, `outlook-auth`, addin functions. |
| SharePoint | ✅ Live via multiple SharePoint edge functions (browse, import, link, provision). |
| ClickUp | ✅ Live via `sync-clickup-tasks`, `sync-clickup-time`, `import-clickup-csv`. |
| training.gov.au | ✅ Live via `tga-sync`, `tga-rto-sync`, `tga-search-training`, and related `tga-*` functions. |
| Xero | ✅ Live via `xero-auth`, `xero-invoice-sync-all`, `xero-webhook` — **new since the 2026-05-15 revision**; which Vivacity/ComplyHub entity's Xero account this targets isn't recorded here yet, confirm before referencing in entity-facing content. |
| Scheduled jobs (pg_cron) | ✅ Deployed. `pg_cron` extension enabled in migration `20260209232822`. One scheduled job confirmed: `seed-compliance-tasks-nightly` runs `run_seed_compliance_tasks_job()` at `0 2 * * *` (2am daily). A second cron surface exists via `sync-outlook-calendar-cron` (a dedicated cron variant of `sync-outlook-calendar`) — its own schedule not independently confirmed in this pass. |
| Stripe | Not wired. No subscription tables, no webhook handlers confirmed. |

---

## Constraints (hard rules)

1. **AI logic → server-side only** (Edge Functions or n8n). Never frontend. API keys must not leak.
2. **New tables → three-step RLS ritual** (tenant-read SELECT + staff ALL + `ENABLE ROW LEVEL SECURITY`). Omitting any step is a silent failure.
3. **Lovable → UI layer only.** No schema decisions, no business logic. If Lovable scaffolds a table, remove it before migration.
4. **Service-role edge functions gate through the shared `requireCaller` helper** (`supabase/functions/_shared/requireCaller.ts`), not a hand-rolled `supabase.auth.getUser()` + manual `unicorn_role`/`tenant_id` check — see `pinned/conventions.md` for the current pattern and `AGENTS.md → Edge Function security guardrails` for the full new-function checklist.
5. **NOT NULL columns with frontend writes → add a coercion trigger.** Column defaults do not protect against explicit `NULL` values sent by Lovable-generated forms.
6. **Tenant 6372 is Vivacity** — hardcoded constant (`VIVACITY_TENANT_ID = 6372`) in `invite-user/index.ts` and exported from `useVivacityTeamUsers.tsx`. If this changes, grep `6372` across the repo.
7. **Multi-tenant defaults.** Every domain query should filter by `tenant_id`. Cross-tenant access is Vivacity-staff-only and goes through `is_vivacity()`.

---

## Open architectural questions

Track these in [decisions.md → Open Decisions](../pinned/decisions.md#open-decisions). Highlights:

- **Stripe webhooks** — Edge Function or n8n? Subscriptions still not wired.
- **LLM providers (resolved for Anthropic, otherwise unchanged):** Primary gateway: `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`. AI audit stack uses `google/gemini-2.5-pro`; corpus embeddings use `text-embedding-3-small` — both via the Lovable AI Gateway. Legacy functions (`ai-orchestrator`, `compliance-assistant`, etc.) use `google/gemini-2.5-flash` / `google/gemini-3-flash-preview` via the same gateway. Direct OpenAI `gpt-4o-mini` in `assistant-answer` with `OPENAI_API_KEY`. **Resolved:** Anthropic/Claude models are used, via a direct API call in `_shared/anthropic-client.ts` (`claude-sonnet-5`, `claude-haiku-4-5-20251001`) — the Lovable AI Gateway genuinely doesn't support Anthropic, so this bypasses it deliberately, the same way embeddings already bypass it. Prompt ownership and orchestration routing for the legacy Gemini-based functions are still undocumented — flag to RJ.
- **Lovable environments** — dev / staging / prod separation is not documented.
- **AI orchestrator scope** — `ai-orchestrator` is a central hub; how is routing and model selection configured, and how does it relate to the newer `ask-viv-assistant`/`_shared/ai-brain/` subsystem — are they on a convergence path, or two independent AI surfaces? Not established in this pass.
- **Xero entity mapping** — which of the two ABNs (Vivacity Coaching & Consulting vs. ComplyHub.ai) does the current `xero-*` integration authenticate against? Not recorded anywhere in this repo as of this pass; confirm before any client- or entity-facing use.
- **`admin-change-password` / `invite-to-tenant` / `run-document-job`** — referenced in `supabase/config.toml` with no matching function directory in the repo. Deployed-but-repo-deleted, or stale config? Needs a live deployed-function list (Supabase MCP) to resolve, not available in this pass.
