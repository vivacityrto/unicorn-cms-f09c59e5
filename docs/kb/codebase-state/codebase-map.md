# Codebase Map

> **Last updated:** 2026-09-01 · **Reconsider by:** 2026-10-01 (file moves/renames desync this file fastest of any in the KB — a one-month shelf life is realistic here, not conservative) · **Confidence:** high on top-level structure and counts (regenerated via direct repository measurement); medium on per-file descriptions not individually re-verified in this pass (most of the page/component/hook prose below predates this regeneration and wasn't re-checked line by line — treat specific claims about a given file's behavior with the same caution as before, only the counts/structure are freshly verified).
>
> **Reflects commit:** `unicorn-cms-f09c59e5@5782860e` (2026-09-01). Supersedes the 2026-05-28 revision (`<codebase>@a30052a0`) — see this file's git history for that prior baseline rather than repeating its provenance here. The link-repair pass immediately before this one (`docs/kb/reference/codebase-optimization-plan-2026-08-28.md` Phase 1 PR1) already fixed every broken relative link in this file; this pass fixes stale counts/content and a handful of link *display text* that still named old files even though the target had already been corrected.
>
> A navigational reference. Where to find things, what depends on what, and the mental path for common tasks.
> Paths are relative to the repo root.

---

## Top-level structure

```
unicorn-cms-f09c59e5/
├── src/                              # Frontend (React + TS + Vite + Lovable)
│   ├── pages/                        # 289 route files (185 top-level + client/54, admin/28, superadmin/11, academy/8, addin/1, internal/1, teams/1)
│   ├── components/                   # UI components (many subdirs)
│   ├── features/                     # NEW since 2026-05-28 — emerging feature-module convention; currently just pdp/ (types, API, hooks, components)
│   ├── hooks/                        # 296 domain hooks
│   ├── contexts/                     # React contexts (ViewMode, ClientPreview, ClientTenant, PageTitle, TenantType)
│   ├── integrations/                 # Supabase client + generated types (73,463 lines, regenerated 2026-08-28)
│   ├── types/                        # Domain types
│   ├── lib/                          # Utilities (cn(), etc.)
│   ├── config/                       # navigationConfig.ts
│   ├── services/                     # codeTablesService.ts
│   ├── utils/                        # addressParser, qcPdfExport, etc.
│   ├── styles/                       # Additional style files
│   ├── assets/                       # Static images/icons — not previously listed here
│   └── test/                         # Test utilities
├── supabase/                         # Backend: edge functions, migrations, email templates
│   ├── functions/                    # 195 edge functions (repository count, not deployed count — see architecture.md), plus _shared/ (58 files) and _retired/ (3 stub dirs, not deployed)
│   ├── migrations/                   # 1,515 migrations, spanning Oct 2025 - Aug 2026; ~20% landed in the last two months alone
│   │   └── rollback/                 # 22 .down.sql rollback scripts — a convention from the July EOS overhaul, not previously documented here
│   └── email-templates/              # Auth email templates
├── sql-setup/                        # Seed SQL (12 files incl. resource hub schema)
├── docs/                             # Product specs + integration docs
├── templates/                        # Mailgun HTML templates
├── public/                           # Static assets
├── README.md, README_IMPLEMENTATION.md
├── MAILGUN_SETUP.md, SUPABASE_SETUP.md, CONTRIBUTING.md
├── package.json, tsconfig.*, vite.config.ts, tailwind.config.ts
└── components.json                   # shadcn-ui config
```

---

## Frontend — [src/](../../../src/)

### Entry points

| File | Purpose |
|---|---|
| [src/main.tsx](../../../src/main.tsx) | React entry; mounts `<App />` |
| [src/App.tsx](../../../src/App.tsx) | Provider stack + Router. Every route defined here. |
| [src/index.css](../../../src/index.css), [src/App.css](../../../src/App.css) | Global CSS, Tailwind layers |

### Providers (order in App.tsx matters)

```
QueryClientProvider        — react-query cache
  └── TooltipProvider      — Radix tooltip context
      └── BrowserRouter    — react-router
          └── AuthProvider — user/session/profile state
              └── ViewModeProvider — admin/client view toggle
                  └── Routes
```

### Pages — [src/pages/](../../../src/pages/)

289 files (185 top-level + client/54, admin/28, superadmin/11, academy/8, addin/1, internal/1, teams/1 — confirmed by direct count 2026-09-01, up from ~187 at the last count). Convention: one file per route. Many have `*Wrapper` companions handling layout/auth chrome. Subdirectories: `academy/`, `addin/`, `admin/` (including new `admin/ai-insights/` and `admin/settings/` subdirs), `client/`, `internal/`, `superadmin/`, `teams/`. The illustrative lists below are not exhaustive — for the authoritative current list of every route, component, and guard, generate the manifest directly: `node scripts/generate-route-manifest.mjs` (see `AGENTS.md` and `codebase-state/route-inventory-by-role.md`).

**Academy is scattered across three locations**, not one: `pages/academy/` (learner surface), several `Academy*` pages inside `pages/client/`, and all of `pages/superadmin/` (Academy Builder). Add all three up before citing a single "Academy page count."

**Auth & onboarding**
- [Login.tsx](../../../src/pages/Login.tsx)
- [ResetPassword.tsx](../../../src/pages/ResetPassword.tsx)
- AcceptInvitation / AcceptInvitationWrapper
- UserProfile / UserProfileWrapper

**Admin surfaces**
- ManageUsers / ManageUsersWrapper
- ManageInvites / ManageInvitesWrapper
- ManageTenants / ManageTenantsWrapper
- ManageDocuments / ManageDocumentsWrapper
- ManageCategories / ManageCategoriesWrapper
- ManageStages / ManageStagesWrapper
- ManageFields / ManageFieldsWrapper
- ManagePackages / ManagePackagesWrapper
- ManageEmails / ManageEmailsWrapper
- AdminManagePackages / Wrapper
- AdminPackageDetail / Wrapper
- AdminPackageTenantDetail / Wrapper

**Tenant detail**
- TenantDetail / TenantDetailWrapper
- TenantLogins / TenantLoginsWrapper
- TenantMembers / TenantMembersWrapper
- TenantDocuments / TenantDocumentsWrapper
- TenantDocumentDetail / Wrapper
- TenantNotes / TenantNotesWrapper

**Packages**
- PackageDetail
- DocumentDetail / Wrapper

**EOS Level 10**
- EosOverview, EosRocks, EosIssues, EosTodos, EosTodos, EosMeetings, EosMeetingSummary
- EosScorecard, EosVto, EosCalendar
- EosQC, EosQCSession

**Audits**
- Audits
- AuditWorkspace
- AuditFindings
- AuditActions
- AuditReport
- AuditTemplateBuilder

**Client portal** (`src/pages/client/`)
- ClientFilesPage — `/client/files` — shared folder card + inline SharePoint browser (bounded to shared folder subtree). Fetches `tenant_sharepoint_settings.shared_folder_name/url`; uses `useSharePointBrowser { useSharedFolder: true }`. Shipped 28 May 2026.
- ClientDocumentsWrapper, ClientResourceHubPage, StaffPdpsPage, and ~10+ others

**Other**
- Dashboard
- TasksManagement / TasksManagementWrapper
- RtoTips / RtoTipsWrapper
- Calendar / CalendarWrapper
- Settings / SettingsWrapper
- TeamSettings / TeamSettingsWrapper
- NotificationSettings
- IntegrationSettings
- Index (landing)
- NotFound

### Components — [src/components/](../../../src/components/)

**Primitive UI** — [src/components/ui/](../../../src/components/ui/)
shadcn-ui components: button, dialog, form, table, input, select, tabs (incl. `animated-tabs`), toast, sonner, tooltip, etc.

**Layout** — [src/components/layout/](../../../src/components/layout/)
Nav, sidebar, header, page shell.

**Admin** — [src/components/admin/](../../../src/components/admin/)
User / tenant / invite management dialogs and tables.

**EOS** — [src/components/eos/](../../../src/components/eos/)
The largest subtree. Rock/Issue/Todo forms, V/TO editor, Scorecard editor, Meeting controls, Agenda reorder (DnD), Live meeting view, the retired Client EOS implementation, QC scheduler, and Accountability chart.
- `eos/client/` — client-facing summaries and headlines
- `eos/qc/` — quarterly conversation flow

**Audit** — [src/components/audit/](../../../src/components/audit/)
Inspection dialogs, finding / action editors, report rendering, plus a substantial workspace subtree:
- `audit/workspace/` (~24 files) — tabbed shell (`OverviewTab`, `ScheduleTab`, `AuditFormTab`, `FindingsTab`, `ActionsTab`, `DocumentsTab`, `ReportTab`, `AuditSidebar`, `AuditSummaryPills`, `PhaseStepIndicator`); three lifecycle phases (`OpeningMeetingPhase`, `DocumentReviewPhase`, `ClosingMeetingPhase`); drawers and dialogs (`ActionDrawer`, `VerificationDrawer`, `SendEvidenceRequestDrawer`, `SendPreliminarySummaryDialog`, `AddFindingForm`, `AppointmentPanel`, `EvidenceRequestsSection`, `QuestionCard`); autosave plumbing (`UnsavedAuditWorkContext.tsx` + `useDebouncedAutosave.ts`).
- `audit/AuditRiskBadge.tsx` — risk-rating badge surfaced across workspace tabs.

**Dashboard** — [src/components/dashboard/](../../../src/components/dashboard/)
Stats cards, charts, week-tasks table.

**Profile, Tenant** — header cards, settings panels.

**Ask Viv** — [src/components/ask-viv/](../../../src/components/ask-viv/)
Client-facing Ask Viv panel (`ClientAskVivPanel.tsx`, calls `ask-viv-assistant-client`) and staff equivalents. New since the last revision — see `codebase-state/architecture.md → Edge functions` for the backing AI subsystem.

**Top-level components** — `ProtectedRoute.tsx`, and others.

### Features — [src/features/](../../../src/features/)

**New top-level directory since the 2026-05-28 revision.** Currently one module: `src/features/pdp/` (Academy PDP — types, API helpers, hooks, and a `components/` subdir), structured as a self-contained feature module rather than the flat `pages/`+`hooks/`+`components/` split everywhere else. This is the shape the optimization plan's "Lifecycle Checklists pilot" is expected to follow if/when it lands — watch for a second `src/features/<name>/` directory appearing, and note the pattern explicitly (not just the one instance) once there are two.

### Hooks — [src/hooks/](../../../src/hooks/)

| Hook | Purpose |
|---|---|
| [useAuth.tsx](../../../src/hooks/useAuth.tsx) | Session + profile; `AuthProvider` context |
| useAISuggestions | Wraps `ai-generate-suggestions` edge function |
| useClientAudits, useClientAuditPortal, useAuditWorkspace, useAuditTemplates, useReusableAuditTemplates, useAuditPrep, useAuditSchedule, useAuditScheduler, useAuditActionPlan, useAuditReferences, useAuditReport, useComplianceAudits, useEngagementAudit, useDocumentSyncAudit, useStageAuditLink, useStageAuditLog, useUserAudit | Audits domain (16 active hooks). `useClientAudits` and `useAuditWorkspace` carry the workspace-page reads/writes; mutations go direct against `client_audits` / related tables (no edge function). The retired legacy `useAudits` hook was removed in Phase 2.6 PR #588. |
| useDashboardData | Dashboard aggregates |
| useEos | Top-level EOS data |
| useEosAgendaTemplates, useEosDrafts, useEosHeadlines, useEosMeetingRecurrences, useEosMeetingSegments, useEosScorecardEntries, useEosScorecardMetrics | EOS subdomain hooks |
| useMeetingIssues, useMeetingRealtime, useMeetingTodos | Live meeting state + sync |
| useQuarterlyConversations | QC domain |
| useNotifications | In-app notifications |
| useRtoTips | RTO tips content |
| useSharePointBrowser | SharePoint folder browser — wraps `browse-sharepoint-folder` edge function. Supports `{ useSharedFolder: true }` option: starts at and bounds navigation to `shared_folder_item_id`. Used by admin config pickers and (since 28 May 2026) by `ClientFilesPage` for the client-facing inline browser. Download action passes `use_shared_folder` flag to match browse boundary. |
| useMobile | Viewport-based mobile detection |
| useToast | shadcn toast wrapper |

### Integrations — [src/integrations/](../../../src/integrations/)

- [src/integrations/supabase/client.ts](../../../src/integrations/supabase/client.ts) — Supabase JS client singleton. Import this everywhere; do not create new clients.

### Contexts — [src/contexts/](../../../src/contexts/)

- [ViewModeContext.tsx](../../../src/contexts/ViewModeContext.tsx) — admin/client view toggle.

### Types — [src/types/](../../../src/types/)

- Legacy `audit.ts` types were retired with the disconnected Audit island in Phase 2.6 PR #588.
- [auditWorkspace.ts](../../../src/types/auditWorkspace.ts) — Workspace-specific types (tabs, phases, autosave payloads)
- [auditReferences.ts](../../../src/types/auditReferences.ts) — Reference / evidence types
- [eos.ts](../../../src/types/eos.ts) — EOS domain types
- [qc.ts](../../../src/types/qc.ts) — Quarterly Conversation types

*Note: database types from `supabase gen types typescript` are NOT currently checked in. Consider adding — see brainstorm log.*

### Lib — [src/lib/](../../../src/lib/)

- [utils.ts](../../../src/lib/utils.ts) — `cn()` helper (Tailwind class merging) + misc utilities.
- [buildPreliminaryAuditSummary.ts](../../../src/lib/buildPreliminaryAuditSummary.ts) — composes the preliminary-audit summary email body (used by `audit/workspace/SendPreliminarySummaryDialog.tsx`); also calculates audit completion %.

### Config — [src/config/](../../../src/config/)

- [navigationConfig.ts](../../../src/config/navigationConfig.ts) — navigation structure config.

### Services — [src/services/](../../../src/services/)

- [codeTablesService.ts](../../../src/services/codeTablesService.ts) — code tables lookup service.

### Utils — [src/utils/](../../../src/utils/)

Utility helpers: `addressParser.ts`, `clickup-import-mappings.ts`, `qcPdfExport.ts`, `rockRollup.ts`, `rockStatusUtils.ts`, `staffTaskType.ts`, `versionCheck.ts`.

---

## Backend — [supabase/](../../../supabase/)

### Edge functions — [supabase/functions/](../../../supabase/functions/)

195 functions (repository count — see [architecture.md](architecture.md)'s "Edge functions" section for the repo-vs-deployed caveat and the full categorised list, now organized into ~14 categories including two entirely new ones since the last revision: the AI/Ask Viv subsystem's direct Anthropic integration, and Xero). All follow the canonical caller-gate pattern described there.

Key navigational landmarks:

| Function | Directory |
|---|---|
| invite-user | [supabase/functions/invite-user/](../../../supabase/functions/invite-user/) — canonical service-role pattern |
| browse-sharepoint-folder | [supabase/functions/browse-sharepoint-folder/](../../../supabase/functions/browse-sharepoint-folder/) — list/download actions with `verifyWithinRoot` boundary check. `effectiveRootId` resolves to `shared_folder_item_id` when `use_shared_folder: true`, otherwise `root_item_id`. Boundary applies to both list and download (hardened 28 May 2026). |
| ai-orchestrator | [supabase/functions/ai-orchestrator/](../../../supabase/functions/ai-orchestrator/) — central AI routing hub |
| sync-outlook-calendar | [supabase/functions/sync-outlook-calendar/](../../../supabase/functions/sync-outlook-calendar/) |
| outlook-auth | [supabase/functions/outlook-auth/](../../../supabase/functions/outlook-auth/) |
| search-organisations | [supabase/functions/search-organisations/](../../../supabase/functions/search-organisations/) |
| analyze-document | [supabase/functions/analyze-document/](../../../supabase/functions/analyze-document/) |
| vector-search | [supabase/functions/vector-search/](../../../supabase/functions/vector-search/) |
| _shared | [supabase/functions/_shared/](../../../supabase/functions/_shared/) — 58 files: CORS/auth basics, `requireCaller.ts` (the canonical caller gate — see Constraints in `architecture.md`), webhook/URL/redirect safety helpers, Microsoft Graph clients, and the AI/vector helpers backing the Ask Viv subsystem. See `architecture.md → Edge functions` for the full breakdown. |
| ask-viv-assistant-client | [supabase/functions/ask-viv-assistant-client/](../../../supabase/functions/ask-viv-assistant-client/) — client-facing Ask Viv, calls Anthropic directly via `_shared/anthropic-client.ts` |
| xero-webhook | [supabase/functions/xero-webhook/](../../../supabase/functions/xero-webhook/) — new integration, see `architecture.md` |

### Migrations — [supabase/migrations/](../../../supabase/migrations/)

1,515 migrations (confirmed by direct count 2026-09-01, up from ~895 at the last count), plus a `rollback/` subdirectory (22 `.down.sql` scripts, a convention from the July EOS overhaul — not a migration count itself). Timestamped filenames, spanning 2 October 2025 to 28 August 2026 (newest at this measurement: `20260828055136_get_academy_course_lesson_outline_safe.sql`). Velocity is high and uneven — roughly 20% of the entire history (313 of 1,515) landed in just the last two months; February 2026 was the single busiest month (354 migrations). Don't assume a flat rate when estimating "how much has landed since X" — check the actual monthly distribution if it matters (`ls supabase/migrations | grep -c '^202608'` style counts, adjusted per month).

### Email templates — [supabase/email-templates/](../../../supabase/email-templates/)

Supabase-hosted auth email templates:
- confirm-signup.html
- email-change.html
- invite-user.html
- magic-link.html
- password-reset.html
- reauthentication.html

(Separate from `templates/mailgun/` which holds Mailgun-side templates.)

### Config — [supabase/config.toml](../../../supabase/config.toml)

Project ID: `yxkgdalkbrriasiyyrwk`.

---

## SQL setup — [sql-setup/](../../../sql-setup/)

Initial / reproducible seed:
1. [00-security-helpers-reference.sql](../../../sql-setup/00-security-helpers-reference.sql) — security helper reference
2. [01-tenant-schema.sql](../../../sql-setup/01-tenant-schema.sql) — core tenant tables
3. [02-tenant-functions.sql](../../../sql-setup/02-tenant-functions.HISTORICAL.sql) — `is_vivacity()`, `is_superadmin()`, `current_tenant()`, `invite_user()`, `accept_invite()`, `set_active_tenant()`
4. [03-tenant-policies.sql](../../../sql-setup/03-tenant-policies.sql) — tenant RLS
5. [04-seed-data.sql](../../../sql-setup/04-seed-data.sql) — initial tenants, SuperAdmin users
6. [05-audit-schema.sql](../../../sql-setup/05-audit-schema.sql) — audits tables
7. [06-audit-rls-policies.sql](../../../sql-setup/06-audit-rls-policies.sql) — audits RLS
8. [07-audit-rpc-functions.sql](../../../sql-setup/07-audit-rpc-functions.sql) — audit RPC functions
9. [08-audit-question-bank-seed.sql](../../../sql-setup/08-audit-question-bank-seed.sql) — 395 questions across 5 templates
10. [09-resource-hub-schema.sql](../../../sql-setup/09-resource-hub-schema.sql) — Resource Hub tables
11. [10-resource-hub-storage.sql](../../../sql-setup/10-resource-hub-storage.sql) — Resource Hub storage buckets
12. [11-resource-hub-functions.sql](../../../sql-setup/11-resource-hub-functions.sql) — Resource Hub functions
13. [12-resource-hub-seed.sql](../../../sql-setup/12-resource-hub-seed.sql) — Resource Hub seed data
14. [README.md](../../../sql-setup/README.md) — setup guide

> **`stages` table note:** The authoritative stage catalogue lives in the `stages` table (not `package_stages`). The legacy `documents_stages` table is deprecated — do not reference it. See [docs/stage-registry.md](../../../docs/stage-registry.md) for the full schema and migration mapping.

---

## Docs — [docs/](../../../docs/)

| File | Use it for |
|---|---|
| [EOS_LEVEL10_SPECIFICATION.md](../../../docs/EOS_LEVEL10_SPECIFICATION.md) | Authoritative spec for the EOS module |
| [INVITE_USER_DIAGNOSTICS.md](../../../docs/INVITE_USER_DIAGNOSTICS.md) | Invite error code reference + SMTP checklist |
| [DESIGN_SYSTEM.md](../../../docs/DESIGN_SYSTEM.md) | Design system reference |
| [INTERACTION_SYSTEM.md](../../../docs/INTERACTION_SYSTEM.md) | Interaction system reference |
| [layout-integration.md](../../../docs/layout-integration.md) | Layout system integration notes |
| [training-gov-au-api-reference.md](../../../docs/training-gov-au-api-reference.md) | External API reference |
| [training-gov-au-integration.md](../../../docs/training-gov-au-integration.md) | Integration-specific notes |
| [TGA_PRODUCTION_INTEGRATION.md](../../../docs/TGA_PRODUCTION_INTEGRATION.md) | TGA production integration details |
| [phase-naming-conventions.md](../../../docs/phase-naming-conventions.md) | Phase naming conventions |
| [stage-naming-conventions.md](../../../docs/stage-naming-conventions.md) | Stage naming conventions |
| [stage-registry.md](../../../docs/stage-registry.md) | Stage registry reference |
| [consultant-assignment-capacity.md](../../../docs/consultant-assignment-capacity.md) | Consultant assignment and capacity |
| [eos-audit-report.md](../../../docs/eos-audit-report.md) | EOS audit report reference |
| [eos-meetings-attendance.md](../../../docs/eos-meetings-attendance.md) | EOS meetings attendance |
| [eos-test-matrix.md](../../../docs/eos-test-matrix.md) | EOS test matrix |
| [tga-staged-sync.md](../../../docs/tga-staged-sync.md) | TGA staged sync process |
| [ui-definition-of-done.md](../../../docs/ui-definition-of-done.md) | UI definition of done |
| [ui-smoke-tests.md](../../../docs/ui-smoke-tests.md) | UI smoke test checklist |
| [ui-definition-of-done.md](../../../docs/ui-definition-of-done.md) | UI DoD checklist + QA routes (`/admin/qa/responsive`, `/admin/qa/smoke`) |
| [stage-registry.md](../../../docs/stage-registry.md) | `stages` table schema — the authoritative stage catalogue (`documents_stages` is deprecated) |
| [consultant-assignment-capacity.md](../../../docs/consultant-assignment-capacity.md) | Automatic consultant assignment algorithm and membership tier config |
| [eos-audit-report.md](../../../docs/eos-audit-report.md) | Full EOS schema audit (Feb 2026): table list, enums, accountability chart subsystem, RLS status |
| [eos-meetings-attendance.md](../../../docs/eos-meetings-attendance.md) | EOS meeting attendance tracking |
| [eos-test-matrix.md](../../../docs/eos-test-matrix.md) | EOS module test matrix |
| [tga-staged-sync.md](../../../docs/tga-staged-sync.md) | TGA staged sync process |
| [tga-sync-troubleshooting.md](../../../docs/tga-sync-troubleshooting.md) | TGA sync troubleshooting guide |
| [docs/eos/](../../../docs/eos/) | EOS phase specs (phase-2 through phase-7, quarterly-annual, recurring-meetings) |
| [docs/ui/](../../../docs/ui/) | UI component standards (form layout, modal/drawer, print/PDF, responsive, text overflow) |
| [docs/client-portal/](../../../docs/client-portal/) | Client portal data-access checklist — every `/client/*` route, allowed tables, RLS patterns |

---

## Historical context

The earlier codebase (`unicorn-2-0-dev`) was a smaller, earlier-stage repo with ~82 pages, 13 edge functions, and 201 migrations. The current codebase (`unicorn-cms-f09c59e5`) is a substantially more mature evolution — as of 2026-09-01, 195 edge functions, 1,515 migrations, and 289 pages, up again from the 117/894/187 figures cited at the previous (2026-05-28) revision of this doc. Many features previously absent (SharePoint, Outlook, AI orchestration, vector layer, ClickUp, and — new since the last revision — Xero and a direct-Anthropic AI subsystem) are now present. When KB files reference "sibling project" or "historical reference only", those notes may be outdated — verify against the current codebase.

---

## Common-task paths

### "I need to add a new page"

1. Create `src/pages/NewThing.tsx` (pure page)
2. Create `src/pages/NewThingWrapper.tsx` if you need auth/layout chrome
3. Import in [src/App.tsx](../../../src/App.tsx)
4. Add `<Route>` ABOVE the catch-all `*` route
5. If protected, wrap in `<ProtectedRoute>`

### "I need to add an edge function"

1. Create `supabase/functions/<name>/index.ts`
2. Gate through `requireCaller`/`requireSharedSecret` from `supabase/functions/_shared/requireCaller.ts` before any DB read/write branch — not a hand-rolled auth check. See `AGENTS.md → Edge Function security guardrails` for the full checklist (every mode/branch needs the same gate; runtime allowlists for any union-typed role/action field).
3. Return `{ ok, code, detail }` envelope
4. Add/update its `.test.mjs` alongside the function; run `npm run test:edge` before considering it done
5. Deploy via the Supabase MCP tools (`AGENTS.md → Supabase deployment workflow` — not the Supabase CLI or GitHub Actions)
6. Invoke from frontend via `supabase.functions.invoke('<name>', { body })`

### "I need to add a table"

1. Read [conventions.md → RLS](../pinned/conventions.md#rls) for the three-step ritual
2. Draft the migration with tenant_id, timestamps, RLS policies (BOTH), and `ENABLE ROW LEVEL SECURITY`
3. If NOT NULL columns may receive writes from Lovable, add coercion triggers
4. Deploy via the Supabase MCP tools per `AGENTS.md → Supabase deployment workflow` (no RJ review gate exists today — see ADR-011 in `reference/decision-trail.md`); write an audit entry per `AGENTS.md → Schema / RLS / trigger changes`
5. Regenerate DB types (`src/integrations/supabase/types.ts` — this is an active workflow step now, not a maybe; see the file's own regeneration cadence noted in `architecture.md`)

### "I need to add a real-time feature"

1. Subscribe via `supabase.channel(<unique-name>).on('postgres_changes', {...}, handler).subscribe()`
2. Cleanup in the effect return: `supabase.removeChannel(channel)`
3. Mirror the pattern in [src/hooks/useMeetingRealtime.tsx](../../../src/hooks/useMeetingRealtime.tsx)

### "I need to query the DB from a component"

1. Use `useQuery` from react-query
2. Query key: `[domain, subentity, ...args]`
3. Gate with `enabled: !!requiredArg` to avoid fetching before auth resolves
4. For mutations, use `useMutation` + `invalidateQueries` on success

### "I need to show the user something"

1. Transient success/info → `import { toast } from 'sonner'` then `toast.success(...)`
2. Structured with variants → `const { toast } = useToast()` then `toast({ title, description, variant })`

### "I need to debug why RLS is blocking a query"

1. Is RLS enabled on the table? (Check Supabase Studio.)
2. Does the table have both a tenant-read SELECT and a staff-ALL policy?
3. Is the user's `tenant_id` in `tenant_members` for the target row's tenant? Is the user in tenant 6372 (Vivacity)?
4. Run the query in the SQL editor impersonating the user (Supabase Studio has this).
5. If still stuck, read [decision-trail.md → ADR-005](../reference/decision-trail.md#adr-005) — same failure modes keep recurring.
