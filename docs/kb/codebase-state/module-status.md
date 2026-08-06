# Module Status

> **Last updated:** 2026-05-28 · **Reconsider by:** 2026-06-30 · **Confidence:** medium — module presence confirmed by files/routes; "shipped" vs "partial" calls need RJ confirmation for several modules. Flagship-surfaces framing added 2026-05-15 per ADR-013; module 3 (EOS) reclassified from "the flagship feature" to "Vivacity's internal operating system."
>
> **Reflects commit:** `<codebase>@a30052a0` (2026-05-28) — most recent update. Earlier baselines: `<codebase>@893fc01a` (2026-05-11) for module body content; `<codebase>@d240b112` (origin/main, 2026-05-15) — `DashboardLayout.tsx` nav structure. AI audit stack (7 edge functions, 4 migrations) shipped 29–30 April 2026; Modules 4 and 14 updated accordingly. PDP schema applied 11 May 2026 (Module 18 added). Client Files tab shared folder + inline browser shipped 28 May 2026 (Module 6 + 15 updated accordingly).
>
> Live tracker for each module. Grounded in the actual `unicorn-cms-f09c59e5` codebase (April–May 2026). Many features previously flagged as "historical reference only" are now present in this codebase.

---

## Flagship surfaces

Three product surfaces are flagship — what Vivacity sells and what clients consume. One additional surface (EOS) is load-bearing internally but not a flagship. The framing reset on 2026-05-15; see [reference/decision-trail.md#adr-013](../reference/decision-trail.md#adr-013).

| Surface | Type | Status | Module entries below |
|---|---|---|---|
| **CSC workflow** (`CLIENTS` section) | Flagship #1 — consultant-facing | ✅ Shipped — actively iterated | §2 (Tenants), §5 (Packages), §7 (Documents), §4 (Audits), §10 (RTO Tips), §15 (integrations) |
| **Client Portal** (`/client/*`) | Flagship #2 — client-facing | 🟡 Shipped, growing — see §6 | §6 (Client Portal), §17 (Resource Hub), §16 (Academy learner) |
| **Vivacity Academy** | Flagship #3 — client-facing | ✅ Core shipped; §18 PDP partial | §16 (Academy), §18 (Academy PDP) |
| EOS Level 10 (`EOS` section) | Internal operating system | ✅ Shipped | §3 |

Why the distinction matters: revenue and renewal hinge on the three flagships. EOS is how Vivacity runs *itself*; degrading EOS hurts Vivacity's operating cadence but doesn't directly affect a client's experience. When prioritising work, flagship surfaces sit above internal-operating-system work unless a specific client-impact path is identified.

---

## Status key

| Symbol | Meaning |
|---|---|
| 🔲 | Not started |
| 🟡 | In progress / partial |
| 🔵 | In review |
| ✅ | Shipped |
| 🚫 | Blocked |

---

## 1. Auth & User Management

**Status:** ✅ Shipped — active stabilisation

**What exists:**
- Email/password login ([src/pages/Login.tsx](../src/pages/Login.tsx))
- Invitation flow ([src/pages/AcceptInvitation.tsx](../src/pages/AcceptInvitation.tsx), [supabase/functions/invite-user/](../supabase/functions/invite-user/))
- Password reset + Super Admin force-change (`send-password-reset`, `send-self-password-reset` edge functions confirmed. ~~`admin-change-password`~~ **not found in `supabase/functions/` — verify with RJ whether removed or renamed**)
- User management UI (`/manage-users`, `/manage-invites`)
- Role matrix enforcement (Vivacity vs. client roles)
- Audit of Super Admin actions (inferred from recent commits)

**Recent activity (last 2 weeks):** Nearly all commits. Super Admin password change, auth user check for reset, password reset validation.

**Remaining:**
- Magic link flow — template exists but no dedicated route. Decide: ship or delete template.
- SSO / OAuth providers — not started, not confirmed in scope.

---

## 2. Tenants & Multi-tenancy

**Status:** ✅ Shipped

**What exists:**
- `tenants`, `tenant_members`, `user_invitations`, `tenant_settings` schema ([sql-setup/01-tenant-schema.sql](../sql-setup/01-tenant-schema.sql))
- Helper functions `is_vivacity()`, `is_superadmin()`, `current_tenant()`, `set_active_tenant()` ([sql-setup/02-tenant-functions.sql](../sql-setup/02-tenant-functions.sql))
- RLS policies ([sql-setup/03-tenant-policies.sql](../sql-setup/03-tenant-policies.sql))
- Admin tenant management (`/manage-tenants`, `/tenant/:id/*`)
- Tenant switcher for Vivacity staff

**Remaining:**
- Parent-child org relationships — mentioned in old docs as live; confirm equivalent in this project.

---

## 3. EOS Level 10 Meeting Module

**Status:** ✅ Shipped — Vivacity's internal operating system (not a client-facing flagship; see [Flagship surfaces](#flagship-surfaces) and [ADR-013](../reference/decision-trail.md#adr-013))

**What exists:**
- V/TO editor (`/eos/vto`)
- Rocks — quarterly priorities, client/team/company-tagged (`/eos/rocks`)
- Issues — IDS workflow (`/eos/issues`)
- To-Dos (`/eos/todos`)
- Scorecard — weekly metrics (`/eos/scorecard`)
- Meeting scheduler + calendar (`/eos/meetings`, `/eos/calendar`)
- Live meeting view — real-time multi-participant sync ([src/components/eos/LiveMeetingView.tsx](../src/components/eos/LiveMeetingView.tsx))
- Meeting summary (`/eos/meetings/:id/summary`)
- Quarterly Conversations (`/eos/qc`, `/eos/qc/:id`)
- Client view (`/client/eos`) — filtered to client-tagged items
- Accountability Chart (inferred from spec, components present in `src/components/eos/`)
- Hooks: `useEos`, `useEosAgendaTemplates`, `useEosDrafts`, `useEosHeadlines`, `useEosMeetingRecurrences`, `useEosMeetingSegments`, `useEosScorecardEntries`, `useEosScorecardMetrics`, `useMeetingIssues`, `useMeetingRealtime`, `useMeetingTodos`, `useQuarterlyConversations`

**Spec:** [docs/EOS_LEVEL10_SPECIFICATION.md](../docs/EOS_LEVEL10_SPECIFICATION.md)

**Remaining:**
- Tablet / facilitator focus mode (if planned)
- Meeting recording / transcription (if planned — AI suggestion hooks are present but not wired)
- Meeting rating analytics over time

---

## 4. Audits & Assessments

**Status:** 🟡 Workspace heavily expanded; AI drafting stack shipped 29–30 April 2026; audit CRUD still client-side direct DB

**What exists:**
- Audit templates ([sql-setup/05-audit-schema.sql](../sql-setup/05-audit-schema.sql), `/audits/create-template`)
- Question bank seed (395 questions, 91 sections, 5 templates — [sql-setup/08-audit-question-bank-seed.sql](../sql-setup/08-audit-question-bank-seed.sql))
- Audit workspace (`/audits/:id`) — built on [src/pages/AuditWorkspaceNew.tsx](../src/pages/AuditWorkspaceNew.tsx)
- Findings (`/audits/:id/findings`)
- Corrective actions (`/audits/:id/actions`)
- Report view (`/audits/:id/report`)
- RLS hardening ([sql-setup/06-audit-rls-policies.sql](../sql-setup/06-audit-rls-policies.sql))
- RPC functions ([sql-setup/07-audit-rpc-functions.sql](../sql-setup/07-audit-rpc-functions.sql))

**Workspace surface (`src/components/audit/workspace/`, ~24 files):**
- Tabbed shell — `OverviewTab`, `ScheduleTab`, `AuditFormTab`, `FindingsTab`, `ActionsTab`, `DocumentsTab`, `ReportTab` + `AuditSidebar`, `AuditSummaryPills`, `PhaseStepIndicator`
- **Three-phase lifecycle confirmed present** — `OpeningMeetingPhase.tsx`, `DocumentReviewPhase.tsx`, `ClosingMeetingPhase.tsx` (so the previous "verify with RJ" item is closed). Phase order: Opening → Document Review → Closing.
- Drawers / dialogs — `ActionDrawer`, `VerificationDrawer`, `SendEvidenceRequestDrawer`, `SendPreliminarySummaryDialog`, `AddFindingForm`, `AppointmentPanel`, `EvidenceRequestsSection`, `QuestionCard`
- **Autosave infrastructure (`a0dccf19`, 2026-04-23)** — `UnsavedAuditWorkContext.tsx` provider + `useDebouncedAutosave.ts` hook; replaces an earlier per-component save path that was dropping data on phase switch. If you're touching workspace fields, write through the context, not direct mutations.
- **Preliminary audit summary (`72ae466e`, `c337d624`, 2026-04-24)** — `SendPreliminarySummaryDialog` + helper `src/lib/buildPreliminaryAuditSummary.ts`; calculates audit completion % for the email body.
- **Risk rating UI (`cf8d1314`, 2026-04-25)** — `src/components/audit/AuditRiskBadge.tsx`; risk fields surfaced in `OverviewTab`, `FindingsTab`, `ActionsTab`, `AuditSummaryPills`.
- **AI audit stack (29–30 April 2026)** — full AI drafting pipeline; see `reference/ai-audit-stack.md` for the complete reference.
  - **SRTO RAG corpus** — `srto_corpus` table (pgvector 1536-dim, HNSW), `srto-source-documents` bucket, `embed-srto-corpus` (Super Admin ingestion), `retrieve-srto-context` (caller-JWT semantic search). Multi-framework: SRTO 2025, National Code 2018, ESOS Act 2000.
  - **AI Finding Drafter** — `draft-finding` edge function (RAG + Gemini 2.5 Pro, 40/user/day, logged to `client_audit_log`); `record-finding-decision` companion; `AddFindingForm.tsx` AI draft UI.
  - **AI Evidence Analyser** — `analyse-evidence` edge function (link docs → extract → RAG → Gemini 2.5 Pro → hallucination guard, 30/user/day); persists to `client_audit_responses.ai_*` columns; new `EvidencePanel.tsx` component in `QuestionCard`.
  - **AI Executive Summary Drafter** — `draft-executive-summary` edge function (synthesises 4-part executive narrative, 5 min cool-down/audit, min 3 findings, discriminated-union validator, fabricated-finding-ID guard); `record-executive-summary-decision` companion; `ReportTab.tsx` AI draft UI; `risk_rationale` column on `client_audits`.
  - **AI Drafting Insights dashboard** — `/admin/ai-insights` (Super Admin only): `SummaryTiles`, `PatternsPanel`, `RecentDraftsTable`, `DraftDrillDown`; `v_ai_finding_draft_outcomes` view + `ai_drafting_summary()` + `ai_drafting_by_clause()` RPCs.
  - New tables: `client_audit_response_documents` (evidence linking, full RLS), `ai_evidence_analysis_usage` (daily cap tracking), `srto_corpus` (RAG library, service-role writes only).

**Audit hooks (`src/hooks/`, 17 files):** `useAudits`, `useClientAudits`, `useClientAuditPortal`, `useAuditWorkspace`, `useAuditTemplates`, `useReusableAuditTemplates`, `useAuditPrep`, `useAuditSchedule`, `useAuditScheduler`, `useAuditActionPlan`, `useAuditReferences`, `useAuditReport`, `useComplianceAudits`, `useEngagementAudit`, `useDocumentSyncAudit`, `useStageAuditLink`, `useStageAuditLog` (+ `useUserAudit` for user-action audit log).

**Audit types:** [src/types/audit.ts](../src/types/audit.ts), [src/types/auditWorkspace.ts](../src/types/auditWorkspace.ts), [src/types/auditReferences.ts](../src/types/auditReferences.ts).

**Backend reality:**
- **No dedicated audit edge function.** Audit creation, save, and finding mutations all happen via the Supabase JS client direct against `client_audits` / related tables from `useClientAudits.ts` and `useAuditWorkspace.ts`. A `create-client-audit` Edge Function was added on 2026-04-20 (`65c426aa`) and **reverted the same day** (`084a5e17`); it is not at HEAD. If a server-side audit pipeline is wanted, this is greenfield again.
- AI-adjacent functions still in place: `analyze-document`, `research-audit-intelligence`, `research-evidence-gap-check`, `research-template-gap-analysis`, `scan-document` / `chunk-document` pipeline.
- **AI audit stack (7 new edge functions, 4 migrations, 29–30 April 2026)** — see bullet above and `reference/ai-audit-stack.md`.

**Still not confirmed in codebase:**
- `generate-audit-report` — not found; confirm with RJ
- `audit_appointments` scheduling table — `AppointmentPanel.tsx` and `useAuditScheduler.ts` exist, suggesting the table is present, but not verified directly

**Remaining:**
- AI report generation — verify scope
- Server-side audit creation / mutation pipeline — would replace current direct-DB pattern
- Client portal audit views — partial; confirm scope

---

## 5. Packages / Pipeline Stages

**Status:** ✅ Shipped

**What exists:**
- `packages`, `package_stages`, `package_stage_instances` schema
- Admin view (`/admin/manage-packages`, `/admin/package/:id`, `/admin/package/:id/tenant/:tenantId`)
- Tenant view (`/manage-packages`, `/package/:id`)
- Stages management (`/manage-stages`)
- `add-missing-packages` edge function — ensures default packages per tenant
- **Duplicate-package guard (`1ce4b026`, 2026-04-23)** — `start_client_package` RPC now refuses to add a package of the same regulatory stream (RTO / CRICOS / GTO / generic) a tenant already has. New helper `fn_package_stream(p_package_id)` derives the stream from the package name/slug. Migration: `supabase/migrations/20260423093423_781c87e1-…sql`.

**Remaining:**
- Pipeline automation / auto-stage-moves — old docs reference DB-trigger-based stage completion. Not yet evident here. Clarify scope.

---

## 6. Client Portal

**Status:** 🟡 Shipped, growing — **Flagship #2** (see [Flagship surfaces](#flagship-surfaces))

**What exists** — dedicated `/client/*` surface (sourced from `origin/main@d240b112` `DashboardLayout.tsx:125-143`):
- `/client/home` — client home dashboard
- `/client/documents` — client document library (RLS-scoped to own tenant)
- `/client/files` — **Shared Folder card + inline SharePoint folder browser** (shipped 28 May 2026, `a30052a0`). Shows the tenant's configured shared folder (name + "Open Shared Folder" link button) and an embedded browser bounded to the shared folder subtree only (breadcrumb nav, back button, folder/file list, per-file download). Root folder card removed. Card gates on `tenant_sharepoint_settings.shared_folder_url`; shows "not configured" message when null. Browser uses `useSharePointBrowser(tenantId, { useSharedFolder: true })` — scoped to `shared_folder_item_id` as boundary. Reference Library (Vivacity-shared links) shown below when configured. See `src/pages/client/ClientFilesPage.tsx`.
- `/client/resource-hub` — categorised compliance library (browser surface of the Resource Hub flagship-adjacent module §17)
- `/client/calendar` — calendar
- `/client/notifications` — notification inbox
- `/client/reports` — reports
- `/team-settings` — manage team (tenant admin only)
- Client portal also embeds the Academy learner surface for licenced tenants (see §16)
- ~14+ wrappers in `src/pages/client/` covering Files, Inbox, Profile, Suggestions, TGA Details, Packages, Tasks, Team, etc.
- Data-access RLS checklist: [docs/client-portal/data-access-checklist.md](../docs/client-portal/data-access-checklist.md)

**No EOS access for clients.** EOS is Vivacity-internal (see §3). Client-tagged EOS outputs reach clients via consultant-mediated surfaces (e.g. reports, document deliveries), not direct EOS access.

**Remaining:**
- Audit portal views for clients (reports, action plan, prep checklist) — partial; confirm scope
- Confirm the legacy `/tenant/:tenantId/*` admin-view routes are deprecated for client use now that `/client/*` is the canonical surface

---

## 7. Documents

**Status:** 🟡 Partial

**What exists:**
- Document management UI (`/manage-documents`, `/documents`)
- Document detail view (`/document/:id`)
- Tenant documents
- Categories (`/manage-categories`)
- Fields (`/manage-fields`) — custom metadata

**Remaining:**
- Version history / tracking (if planned)
- Document templates vs. instances distinction

---

## 8. Tasks

**Status:** ✅ Shipped

**What exists:**
- Global tasks (`/tasks`)
- Tenant-scoped tasks (`/tenant/:tenantId/tasks`)
- Task management wrapper

**Remaining:**
- Automation tying tasks to pipeline stages (old doc feature — "stage task auto-completion") — not evident here.

---

## 9. Campaigns / Email

**Status:** 🟡 Partial

**What exists:**
- Admin email template management (`/admin/manage-emails`)
- Mailgun templates in [templates/mailgun/](../templates/mailgun/) and [supabase/email-templates/](../supabase/email-templates/)
- Transactional email via `send-invitation-email` edge function
- Auth emails (invite, confirm-signup, password-reset, magic-link, reauth, email-change)

**Also present in this codebase:**
- `send-email-graph` and `send-composed-email` via Microsoft Graph (not Mailgun)
- `send-stage-email` — stage-triggered emails
- `generate-notifications` + `process-notification-outbox` — notification pipeline

**Not yet confirmed:**
- `send-automated-email` multi-handler dispatcher
- Broadcast / campaign builder UI
- Segmentation

**Remaining:**
- Confirm whether campaign engine is in scope for 2.0 or deferred.

---

## 10. RTO Tips

**Status:** ✅ Shipped

**What exists:**
- `/rto-tips` — [src/pages/RtoTips.tsx](../src/pages/RtoTips.tsx) / Wrapper
- Hook: [src/hooks/useRtoTips.ts](../src/hooks/useRtoTips.ts)

**Purpose:** Domain knowledge / quick-reference content for RTO clients.

---

## 11. Settings

**Status:** ✅ Shipped

**What exists:**
- General settings (`/settings`)
- Team settings (`/team-settings`)
- Notification settings (`/settings/notifications`)
- Integration settings (`/settings/integrations`)

---

## 12. Subscription / Membership (Stripe)

**Status:** 🔲 Not started

**No evidence in code:** no Stripe imports, no webhook handlers, no subscription schema. The old doc's "Superhero" and "Academy" membership tiers are aspirational, not present.

**Blockers:** Product decision on Stripe webhook handling (Edge Function vs. n8n), self-service portal scope.

---

## 13. Booking / Scheduling

**Status:** 🟡 EOS calendar only

**What exists:**
- EOS calendar (`/eos/calendar`) — meeting scheduling within the EOS module
- Meeting scheduler component
- QC scheduler component
- `generate-meeting-recurrence` edge function

**Now present:**
- Outlook calendar sync (`sync-outlook-calendar`) — ✅ exists
- `CalendarTimeCapture.tsx` / `TimeInbox.tsx` / `WorkCalendar.tsx` pages — ✅ exist (time tracking angle)
- `OutlookCallback.tsx` — Outlook OAuth callback

**Not confirmed:**
- General-purpose booking (OnceHub replacement for non-EOS contexts)
- Google calendar integration

---

## 14. AI / Automation

**Status:** 🟡 Partial

**What exists:**
- `ai-generate-suggestions` edge function ([supabase/functions/ai-generate-suggestions/](../supabase/functions/ai-generate-suggestions/))
- `useAISuggestions` hook

**Now present in this codebase:**
- `analyze-document` — ✅ exists
- `research-audit-intelligence` — ✅ exists
- `ai-orchestrator` — central AI routing hub — ✅ exists
- `compliance-assistant`, `client-ai-companion`, `copilot-chat`, `assistant-answer`, `help-center-chat` — ✅ all exist
- `research-answer`, `research-scrape`, `research-enrich-tenant`, `research-evidence-gap-check` — ✅ exist
- `calculate-predictive-risk`, `run-tenant-risk-forecast`, `run-strategic-signal-analysis` — ✅ exist
- `vector-search`, `vector-index-rebuild`, `query-knowledge-graph` — ✅ vector/knowledge layer exists

**AI audit stack (29–30 April 2026 — see `reference/ai-audit-stack.md`):**
- `embed-srto-corpus` — Super Admin ingestion; PDF → chunk → embed (text-embedding-3-small) → `srto_corpus`. Multi-framework: SRTO 2025, National Code 2018, ESOS Act 2000.
- `retrieve-srto-context` — caller-JWT semantic search over `srto_corpus`.
- `draft-finding` — RAG + Gemini 2.5 Pro finding draft; 40/user/day; append-only log.
- `record-finding-decision` — companion decision log (accepted/edited/rejected).
- `analyse-evidence` — RAG + Gemini 2.5 Pro evidence analysis from linked documents; 30/user/day; hallucination guard.
- `draft-executive-summary` — synthesises four-part executive narrative; 5-min cool-down/audit; discriminated-union validator.
- `record-executive-summary-decision` — companion per-field decision log.

**Not confirmed:**
- Six named AI agents (Alex, Casey, Morgan, Jordan, Riley, Sam) — check if these map to existing functions
- `generate-audit-report` — not found

**Unresolved:**
- LLM providers — partially resolved. Audit AI stack: Gemini 2.5 Pro + text-embedding-3-small, both via Lovable AI Gateway (`LOVABLE_API_KEY`). Legacy functions (`ai-orchestrator`, `compliance-assistant`, etc.) — model config still undocumented.

---

## 15. Integrations

| Integration | Status |
|---|---|
| Mailgun | ✅ Shipped (invites, auth emails) |
| Microsoft Graph email | ✅ Shipped (`send-email-graph`, `send-composed-email`, `send-stage-email`) |
| training.gov.au / TGA | ✅ Shipped (`search-organisations`, `get-organisation-details`, `tga-sync`, `tga-rto-import`, etc.) — see [docs/training-gov-au-integration.md](../docs/training-gov-au-integration.md) |
| Outlook calendar | ✅ Shipped (`sync-outlook-calendar`, `outlook-auth`, addin functions) |
| SharePoint | ✅ Shipped (browse, import, link, provision, deliver functions). Client portal `/client/files` now wired to `browse-sharepoint-folder` via `useSharePointBrowser { useSharedFolder: true }` — inline browser bounded to `shared_folder_item_id` (28 May 2026). Security fix: `effectiveRootId` hoisted in edge function so both list + download boundaries respect `use_shared_folder` flag. |
| ClickUp | ✅ Shipped (`sync-clickup-tasks`, `sync-clickup-time`, `import-clickup-csv`) |
| Microsoft 365 / M365 | ✅ Shipped (`provision-m365-user`, Outlook addin suite) |
| Stripe | 🔲 Not started |
| n8n / Awesomate | 🔲 Not confirmed in this codebase |

---

## 16. Academy

**Status:** ✅ Shipped — **Flagship #3** (see [Flagship surfaces](#flagship-surfaces))

**What exists:**
- Admin surface: `/academy`, `/academy/courses`, `/academy/certificates`, `/academy/events`, `/academy/community`, `/academy/team`, `/academy/settings`
- Role-specific client views: Trainer, Compliance Manager, Governance Person, Student Support Officer, Administration Assistant
- Course detail + lesson viewer (`/academy/course/:slug/*`), assessment player, assessment results
- Superadmin builder: `/superadmin/academy/builder`, `builder/:courseId`, enrollments, tenant access, package-course rules
- Components (`src/components/academy/`): `AcademyAccessGate`, `CourseCard`, `SeatLimitBanner`, `EnrolmentProgressDrawer`, builder tools, layout shell
- Hooks (`src/hooks/academy/`): `useAcademyCourses`, `useAcademyEnrollments`, `useAcademyCertificates`, `useAcademyPackageRules`, `useTenantAcademyAccess`, `useVideoLibrary`, builder hooks
- Edge functions: `academy-ai-generate`, `generate-certificate-pdf` (PDF generation from Angela's branded A4 landscape template — shipped 25 May 2026)
- Certificate template asset: `doc-templates/academy/certificate-template-a4.png` (private bucket — do not delete)
- Total: ~30 page/wrapper files, 22 components, 9+ hooks

**Admin tooling overhaul (`faafacb2`, 2026-04-21):**
- `src/components/academy/admin/EnrolmentProgressDrawer.tsx` (large rewrite — +454 lines), `src/components/academy/admin/NewEnrolmentModal.tsx` (new), `src/pages/superadmin/AcademyEnrolmentsPage.tsx` (significantly expanded), `src/hooks/academy/useAcademyEnrollments.ts` (expanded).
- Backed by new staff-only Postgres RPCs (Vivacity-gated via `is_vivacity()`):
  - `fn_academy_enrollment_stats()` — six-tile dashboard counts (total, active, completed, expired, revoked, auto-lifetime). Migration: `supabase/migrations/20260421085406_b2a157f8-…sql`.
  - `fn_academy_enrollment_lesson_detail(p_enrollment_id)` — per-enrolment lesson progress. Same migration.
  - `fn_academy_rule_dashboard_stats()` — package-rule dashboard tiles (active rules, total mappings, auto-enrolments to date, unmapped packages). Migration: `supabase/migrations/20260421082533_da37ce62-…sql`.

**Remaining:**
- No `docs/` spec — verify course content schema and role-gate logic with RJ
- Seat access gating (`AcademyAccessGate`, `SeatLimitBanner`) — confirm enforcement is RLS-backed, not frontend-only
- Stripe for seat-based billing — not wired

---

## 17. Resource Hub

**Status:** ✅ Shipped

**What exists:**
- Staff-facing hub (`/resource-hub`) with 11 category routes: audit-evidence, checklists, CI tools, favourites, guides-howto, most-used, recently-added, registers-forms, templates, training-webinars, updates
- Client-facing view (`/client/resource-hub`, `/client/resource-hub/:categoryId`)
- Pages: `ResourceHubDashboard`, `ResourceCategoryPage`, `ResourceRecentlyAdded`, `ResourceMostUsed`, `ResourceFavourites`, `ResourceUpdatesLog`, `ClientResourceHubPage`
- Components: `ResourceCard`, `ResourceGrid`, `ResourceSearch`
- Schema managed in timestamped migrations (no separate sql-setup folder — earlier KB reference to `sql-setup/09–12` is stale)

**Remaining:**
- No dedicated hook file found — confirm data fetching pattern with RJ
- Content upload/management workflow for new resources not confirmed

---

## 18. Academy — Professional Development Plan (PDP)

**Status:** 🟠 Schema + most UI shipped; 4 gaps remaining (see follow-up prompts)

**Last cross-checked:** 12 May 2026 (`unicorn-cms-f09c59e5` HEAD `aa81aab0`)

**Schema (applied 11 May 2026 to `yxkgdalkbrriasiyyrwk` — live but NOT in repo migrations; run `supabase db pull` before next DB session):**
- `pdp_audiences` — five audience categories with default target PD hours (Trainer 20h, Compliance Manager 15h, Governing Person 8h, Student Support Officer 12h, Administration Assistant 10h)
- `pdp_cycles` — annual PDP cycle per user per tenant
- `pdp_goals` — development goals mapped to a Standard (`standards_reference.standard_id`)
- `pdp_evidence_items` — polymorphic evidence rows (12 types); FKs to `academy_enrollments`, `academy_certificates`
- `pdp_reflections` — in-lesson and ad-hoc reflection notes; FK to `academy_lesson_progress`
- `pdp_reviews` — manager mid- and end-cycle reviews
- `v_pdp_cycle_summary` — per-cycle hours, goals, and percent_complete rollups (`security_invoker = true`)
- `v_pdp_user_currency` — latest cycle status with traffic-light `currency_status` (`security_invoker = true`)
- 21 RLS policies. Three-tier pattern: Vivacity staff ALL, tenant admins SELECT, users manage own cycle data.

**Standards anchoring:** `pdp_goals.standard_id` → `standards_reference`. Satisfies SRTO 2025 Standards 3.1, 3.2, 3.3 and the Credential Policy CPD obligations.

**Shipped UI (Lovable Prompts 1–10, 12 core):**
- `src/features/pdp/` — types, API helpers, hooks, workforce queries all present
- `src/pages/academy/pdp/index.tsx` — learner dashboard (progress dial, currency traffic light, action row, recommended courses, recent evidence, empty-state CTA)
- `src/pages/academy/pdp/cycle/[cycleId].tsx` — cycle detail with 5 tabs, right-rail export card, Close Cycle dialog
- `src/features/pdp/components/` — StandardsPicker, GoalSheet, EvidenceSheet all present
- `src/components/academy/pdp/QuickReflectionDrawer.tsx` — built but not yet wired (see gap F14)
- `src/pages/academy/pdp/reviews.tsx` — manager review hub and ReviewComposerDrawer
- `src/pages/superadmin/workforce-pdp.tsx` — workforce dashboard with KPI tiles, table, CSV export
- `supabase/functions/pdp-auto-evidence/` — auto-evidence on course completion (idempotent)
- `src/pages/client/StaffPdpsPage.tsx` — tenant admin staff PDPs view (CSV export only; ZIP pending)
- Storage bucket `academy-evidence` — private, 10 MB, correct MIME types, RLS policies

**Routes registered in `src/App.tsx`:** `/academy/pdp`, `/academy/pdp/reviews`, `/academy/pdp/cycle/:cycleId`, `/superadmin/workforce-pdp`, `/client/staff-pdps`

**Remaining gaps — follow-up prompts at `handoffs/pdp-follow-up-prompts.md`:**

| Follow-up | What | Status |
|-----------|------|--------|
| F13 | Add PDP to Academy sidebar nav (`AcademyLayout.tsx` `academyMainItems`) | ✅ Done — `f6a37e7b` |
| F14 | Wire `QuickReflectionDrawer` into `AcademyLessonViewerPage` on lesson completion | ✅ Done — already implemented per-lesson (more robust than spec) |
| F15-pre | Create `doc-templates` + `generated-docs` storage buckets (migration — DB change workflow applies) | ❌ Not done |
| F15 | `supabase/functions/pdp-export/` Edge Function (DOCX export) | ❌ Not done |
| F16 | ZIP audit pack in `StaffPdpsPage` (depends on F15) | ❌ Not done |

**Also remaining:**
- DOCX export template to be authored and uploaded to `doc-templates/pdp/pdp-cycle-export-v1.docx` — brand spec in `handoffs/pdp-lovable-prompts.md` under Prompt 11
- Calibration of default `target_pd_hours_default` per audience (current values are placeholders)

---

## Summary matrix

| Module | Current status | Delta from earlier survey |
|---|---|---|
| Auth & Users | ✅ | + bulk actions, resend/cancel invite, M365 provisioning |
| Multi-tenancy | ✅ | Same conceptual model |
| EOS Level 10 | ✅ | Vivacity's internal operating system — fully shipped; not a client-facing flagship (see ADR-013) |
| Audits | 🟡 | + `analyze-document`, `research-audit-intelligence` now present; `generate-audit-report` still missing |
| Packages / Pipeline | ✅ | `run-stage-health-monitor`, `calculate-phase-completeness` added |
| Client Portal | 🟡 | Many new client pages (`ClientDetail`, `ClientImpact`, `ClientInbox`, `ClientCommunications`) |
| Documents | 🟡 | + AI analysis, versions, categories, scan pipeline |
| Tasks | ✅ | Same scope |
| Campaigns/Email | 🟡 | + Microsoft Graph email; campaign builder still open |
| Subscriptions/Membership | 🔲 | `MembershipDashboard.tsx` manages tenant memberships/roles — NOT Stripe. Stripe is 🔲 Not started. |
| Booking | 🟡 | + Outlook calendar sync now live; time capture pages added |
| AI automation | ✅ | 40+ AI functions; orchestrator, vector layer, research, compliance AI |
| SharePoint | ✅ | Full SharePoint suite of edge functions |
| Outlook / M365 | ✅ | Calendar sync, addin suite, M365 provisioning |
| ClickUp | ✅ | Task + time sync |
| Academy | ✅ | Fully shipped — ~30 pages, 22 components, 9 hooks, role-specific client views, superadmin builder |
| Resource Hub | ✅ | Shipped — 12 staff + client routes, categorised library |
| **Academy PDP** | 🟡 | Schema applied 11 May 2026 (6 tables, 2 views, 21 RLS policies). UI not yet built — 12 Lovable prompts ready in `handoffs/pdp-lovable-prompts.md`. |

See [migration-1to2.md](../reference/migration-1to2.md) for what came from Unicorn 1.0 and what's net-new.
