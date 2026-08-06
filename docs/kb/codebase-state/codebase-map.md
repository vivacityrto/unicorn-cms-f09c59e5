# Codebase Map

> **Last updated:** 2026-05-28 · **Reconsider by:** 2026-06-27 · **Confidence:** medium — tenant ID and docs table updated April 2026 audit; file moves/renames will desync this file fastest of any in the KB.
>
> **Reflects commit:** `<codebase>@a30052a0` (2026-05-28) — most recent addition (client Files tab + SharePoint browser). Core structure reflects `<codebase>@cf8d1314` (2026-04-25).
>
> A navigational reference. Where to find things, what depends on what, and the mental path for common tasks.
> Paths are relative to the repo root (`~/repository/unicorn-workspace/<codebase>` — alias defined in workspace root `CLAUDE.md`).

---

## Top-level structure

```
unicorn-cms-f09c59e5/
├── src/                              # Frontend (React + TS + Vite + Lovable)
│   ├── pages/                        # ~187 route files
│   ├── components/                   # UI components (many subdirs)
│   ├── hooks/                        # ~238 domain hooks (230 top-level + academy/ subdir)
│   ├── contexts/                     # React contexts
│   ├── integrations/                 # Supabase client
│   ├── types/                        # Domain types
│   ├── lib/                          # Utilities (cn(), etc.)
│   ├── config/                       # navigationConfig.ts
│   ├── services/                     # codeTablesService.ts
│   ├── utils/                        # addressParser, qcPdfExport, etc.
│   ├── styles/                       # Additional style files
│   └── test/                         # Test utilities
├── supabase/                         # Backend: edge functions, migrations, email templates
│   ├── functions/                    # 117 edge functions
│   ├── migrations/                   # 895 migrations
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

## Frontend — [src/](../src/)

### Entry points

| File | Purpose |
|---|---|
| [src/main.tsx](../src/main.tsx) | React entry; mounts `<App />` |
| [src/App.tsx](../src/App.tsx) | Provider stack + Router. Every route defined here. |
| [src/index.css](../src/index.css), [src/App.css](../src/App.css) | Global CSS, Tailwind layers |

### Providers (order in App.tsx matters)

```
QueryClientProvider        — react-query cache
  └── TooltipProvider      — Radix tooltip context
      └── BrowserRouter    — react-router
          └── AuthProvider — user/session/profile state
              └── ViewModeProvider — admin/client view toggle
                  └── Routes
```

### Pages — [src/pages/](../src/pages/)

~187 files. Convention: one file per route. Many have `*Wrapper` companions handling layout/auth chrome. Subdirectories: `academy/`, `addin/`, `admin/`, `client/`, `internal/`, `superadmin/`, `teams/`.

**Auth & onboarding**
- [Login.tsx](../src/pages/Login.tsx)
- [ResetPassword.tsx](../src/pages/ResetPassword.tsx)
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
- ClientEosOverview

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

### Components — [src/components/](../src/components/)

**Primitive UI** — [src/components/ui/](../src/components/ui/)
shadcn-ui components: button, dialog, form, table, input, select, tabs (incl. `animated-tabs`), toast, sonner, tooltip, etc.

**Layout** — [src/components/layout/](../src/components/layout/)
Nav, sidebar, header, page shell.

**Admin** — [src/components/admin/](../src/components/admin/)
User / tenant / invite management dialogs and tables.

**EOS** — [src/components/eos/](../src/components/eos/)
The largest subtree. Rock/Issue/Todo forms, V/TO editor, Scorecard editor, Meeting controls, Agenda reorder (DnD), Live meeting view, Client EOS view, QC scheduler, Accountability chart.
- `eos/client/` — client-facing summaries and headlines
- `eos/qc/` — quarterly conversation flow

**Audit** — [src/components/audit/](../src/components/audit/)
Inspection dialogs, finding / action editors, report rendering, plus a substantial workspace subtree:
- `audit/workspace/` (~24 files) — tabbed shell (`OverviewTab`, `ScheduleTab`, `AuditFormTab`, `FindingsTab`, `ActionsTab`, `DocumentsTab`, `ReportTab`, `AuditSidebar`, `AuditSummaryPills`, `PhaseStepIndicator`); three lifecycle phases (`OpeningMeetingPhase`, `DocumentReviewPhase`, `ClosingMeetingPhase`); drawers and dialogs (`ActionDrawer`, `VerificationDrawer`, `SendEvidenceRequestDrawer`, `SendPreliminarySummaryDialog`, `AddFindingForm`, `AppointmentPanel`, `EvidenceRequestsSection`, `QuestionCard`); autosave plumbing (`UnsavedAuditWorkContext.tsx` + `useDebouncedAutosave.ts`).
- `audit/AuditRiskBadge.tsx` — risk-rating badge surfaced across workspace tabs.

**Dashboard** — [src/components/dashboard/](../src/components/dashboard/)
Stats cards, charts, week-tasks table.

**Profile, Tenant** — header cards, settings panels.

**Top-level components** — `ProtectedRoute.tsx`, and others.

### Hooks — [src/hooks/](../src/hooks/)

| Hook | Purpose |
|---|---|
| [useAuth.tsx](../src/hooks/useAuth.tsx) | Session + profile; `AuthProvider` context |
| useAISuggestions | Wraps `ai-generate-suggestions` edge function |
| useAudits, useClientAudits, useClientAuditPortal, useAuditWorkspace, useAuditTemplates, useReusableAuditTemplates, useAuditPrep, useAuditSchedule, useAuditScheduler, useAuditActionPlan, useAuditReferences, useAuditReport, useComplianceAudits, useEngagementAudit, useDocumentSyncAudit, useStageAuditLink, useStageAuditLog, useUserAudit | Audits domain (17 hooks). `useClientAudits` and `useAuditWorkspace` carry the workspace-page reads/writes; mutations go direct against `client_audits` / related tables (no edge function). |
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

### Integrations — [src/integrations/](../src/integrations/)

- [src/integrations/supabase/client.ts](../src/integrations/supabase/client.ts) — Supabase JS client singleton. Import this everywhere; do not create new clients.

### Contexts — [src/contexts/](../src/contexts/)

- [ViewModeContext.tsx](../src/contexts/ViewModeContext.tsx) — admin/client view toggle.

### Types — [src/types/](../src/types/)

- [audit.ts](../src/types/audit.ts) — Audit domain types
- [auditWorkspace.ts](../src/types/auditWorkspace.ts) — Workspace-specific types (tabs, phases, autosave payloads)
- [auditReferences.ts](../src/types/auditReferences.ts) — Reference / evidence types
- [eos.ts](../src/types/eos.ts) — EOS domain types
- [qc.ts](../src/types/qc.ts) — Quarterly Conversation types

*Note: database types from `supabase gen types typescript` are NOT currently checked in. Consider adding — see brainstorm log.*

### Lib — [src/lib/](../src/lib/)

- [utils.ts](../src/lib/utils.ts) — `cn()` helper (Tailwind class merging) + misc utilities.
- [buildPreliminaryAuditSummary.ts](../src/lib/buildPreliminaryAuditSummary.ts) — composes the preliminary-audit summary email body (used by `audit/workspace/SendPreliminarySummaryDialog.tsx`); also calculates audit completion %.

### Config — [src/config/](../src/config/)

- [navigationConfig.ts](../src/config/navigationConfig.ts) — navigation structure config.

### Services — [src/services/](../src/services/)

- [codeTablesService.ts](../src/services/codeTablesService.ts) — code tables lookup service.

### Utils — [src/utils/](../src/utils/)

Utility helpers: `addressParser.ts`, `clickup-import-mappings.ts`, `qcPdfExport.ts`, `rockRollup.ts`, `rockStatusUtils.ts`, `staffTaskType.ts`, `versionCheck.ts`.

---

## Backend — [supabase/](../supabase/)

### Edge functions — [supabase/functions/](../supabase/functions/)

117 functions. All follow the canonical pattern in [02-system-design.md](02-system-design.md#edge-functions). See [01-architecture.md](01-architecture.md#edge-functions-117-live) for the full categorised list.

Key navigational landmarks:

| Function | Directory |
|---|---|
| invite-user | [supabase/functions/invite-user/](../supabase/functions/invite-user/) — canonical service-role pattern |
| browse-sharepoint-folder | [supabase/functions/browse-sharepoint-folder/](../supabase/functions/browse-sharepoint-folder/) — list/download actions with `verifyWithinRoot` boundary check. `effectiveRootId` resolves to `shared_folder_item_id` when `use_shared_folder: true`, otherwise `root_item_id`. Boundary applies to both list and download (hardened 28 May 2026). |
| ai-orchestrator | [supabase/functions/ai-orchestrator/](../supabase/functions/ai-orchestrator/) — central AI routing hub |
| sync-outlook-calendar | [supabase/functions/sync-outlook-calendar/](../supabase/functions/sync-outlook-calendar/) |
| outlook-auth | [supabase/functions/outlook-auth/](../supabase/functions/outlook-auth/) |
| search-organisations | [supabase/functions/search-organisations/](../supabase/functions/search-organisations/) |
| analyze-document | [supabase/functions/analyze-document/](../supabase/functions/analyze-document/) |
| vector-search | [supabase/functions/vector-search/](../supabase/functions/vector-search/) |
| _shared | [supabase/functions/_shared/](../supabase/functions/_shared/) — shared utilities |

### Migrations — [supabase/migrations/](../supabase/migrations/)

900+ migrations. Timestamped filenames. Most recent known: 2026-05-28 (`20260528043747_…` — `shared_folder_url TEXT NULL` on `tenant_sharepoint_settings`). Earlier landmark: 2026-04-23 (`20260423093423_…` — `fn_package_stream` + duplicate-package guard in `start_client_package`).

### Email templates — [supabase/email-templates/](../supabase/email-templates/)

Supabase-hosted auth email templates:
- confirm-signup.html
- email-change.html
- invite-user.html
- magic-link.html
- password-reset.html
- reauthentication.html

(Separate from `templates/mailgun/` which holds Mailgun-side templates.)

### Config — [supabase/config.toml](../supabase/config.toml)

Project ID: `yxkgdalkbrriasiyyrwk`.

---

## SQL setup — [sql-setup/](../sql-setup/)

Initial / reproducible seed:
1. [00-security-helpers-reference.sql](../sql-setup/00-security-helpers-reference.sql) — security helper reference
2. [01-tenant-schema.sql](../sql-setup/01-tenant-schema.sql) — core tenant tables
3. [02-tenant-functions.sql](../sql-setup/02-tenant-functions.sql) — `is_vivacity()`, `is_superadmin()`, `current_tenant()`, `invite_user()`, `accept_invite()`, `set_active_tenant()`
4. [03-tenant-policies.sql](../sql-setup/03-tenant-policies.sql) — tenant RLS
5. [04-seed-data.sql](../sql-setup/04-seed-data.sql) — initial tenants, SuperAdmin users
6. [05-audit-schema.sql](../sql-setup/05-audit-schema.sql) — audits tables
7. [06-audit-rls-policies.sql](../sql-setup/06-audit-rls-policies.sql) — audits RLS
8. [07-audit-rpc-functions.sql](../sql-setup/07-audit-rpc-functions.sql) — audit RPC functions
9. [08-audit-question-bank-seed.sql](../sql-setup/08-audit-question-bank-seed.sql) — 395 questions across 5 templates
10. [09-resource-hub-schema.sql](../sql-setup/09-resource-hub-schema.sql) — Resource Hub tables
11. [10-resource-hub-storage.sql](../sql-setup/10-resource-hub-storage.sql) — Resource Hub storage buckets
12. [11-resource-hub-functions.sql](../sql-setup/11-resource-hub-functions.sql) — Resource Hub functions
13. [12-resource-hub-seed.sql](../sql-setup/12-resource-hub-seed.sql) — Resource Hub seed data
14. [README.md](../sql-setup/README.md) — setup guide

> **`stages` table note:** The authoritative stage catalogue lives in the `stages` table (not `package_stages`). The legacy `documents_stages` table is deprecated — do not reference it. See [docs/stage-registry.md](../docs/stage-registry.md) for the full schema and migration mapping.

---

## Docs — [docs/](../docs/)

| File | Use it for |
|---|---|
| [EOS_LEVEL10_SPECIFICATION.md](../docs/EOS_LEVEL10_SPECIFICATION.md) | Authoritative spec for the EOS module |
| [INVITE_USER_DIAGNOSTICS.md](../docs/INVITE_USER_DIAGNOSTICS.md) | Invite error code reference + SMTP checklist |
| [DESIGN_SYSTEM.md](../docs/DESIGN_SYSTEM.md) | Design system reference |
| [INTERACTION_SYSTEM.md](../docs/INTERACTION_SYSTEM.md) | Interaction system reference |
| [layout-integration.md](../docs/layout-integration.md) | Layout system integration notes |
| [training-gov-au-api-reference.md](../docs/training-gov-au-api-reference.md) | External API reference |
| [training-gov-au-integration.md](../docs/training-gov-au-integration.md) | Integration-specific notes |
| [TGA_PRODUCTION_INTEGRATION.md](../docs/TGA_PRODUCTION_INTEGRATION.md) | TGA production integration details |
| [phase-naming-conventions.md](../docs/phase-naming-conventions.md) | Phase naming conventions |
| [stage-naming-conventions.md](../docs/stage-naming-conventions.md) | Stage naming conventions |
| [stage-registry.md](../docs/stage-registry.md) | Stage registry reference |
| [consultant-assignment-capacity.md](../docs/consultant-assignment-capacity.md) | Consultant assignment and capacity |
| [eos-audit-report.md](../docs/eos-audit-report.md) | EOS audit report reference |
| [eos-meetings-attendance.md](../docs/eos-meetings-attendance.md) | EOS meetings attendance |
| [eos-test-matrix.md](../docs/eos-test-matrix.md) | EOS test matrix |
| [tga-staged-sync.md](../docs/tga-staged-sync.md) | TGA staged sync process |
| [ui-definition-of-done.md](../docs/ui-definition-of-done.md) | UI definition of done |
| [ui-smoke-tests.md](../docs/ui-smoke-tests.md) | UI smoke test checklist |
| [ui-definition-of-done.md](../docs/ui-definition-of-done.md) | UI DoD checklist + QA routes (`/admin/qa/responsive`, `/admin/qa/smoke`) |
| [stage-registry.md](../docs/stage-registry.md) | `stages` table schema — the authoritative stage catalogue (`documents_stages` is deprecated) |
| [consultant-assignment-capacity.md](../docs/consultant-assignment-capacity.md) | Automatic consultant assignment algorithm and membership tier config |
| [eos-audit-report.md](../docs/eos-audit-report.md) | Full EOS schema audit (Feb 2026): table list, enums, accountability chart subsystem, RLS status |
| [eos-meetings-attendance.md](../docs/eos-meetings-attendance.md) | EOS meeting attendance tracking |
| [eos-test-matrix.md](../docs/eos-test-matrix.md) | EOS module test matrix |
| [tga-staged-sync.md](../docs/tga-staged-sync.md) | TGA staged sync process |
| [tga-sync-troubleshooting.md](../docs/tga-sync-troubleshooting.md) | TGA sync troubleshooting guide |
| [docs/eos/](../docs/eos/) | EOS phase specs (phase-2 through phase-7, quarterly-annual, recurring-meetings) |
| [docs/ui/](../docs/ui/) | UI component standards (form layout, modal/drawer, print/PDF, responsive, text overflow) |
| [docs/client-portal/](../docs/client-portal/) | Client portal data-access checklist — every `/client/*` route, allowed tables, RLS patterns |

---

## Historical context

The earlier codebase (`unicorn-2-0-dev`) was a smaller, earlier-stage repo with ~82 pages, 13 edge functions, and 201 migrations. The current codebase (`unicorn-cms-f09c59e5`) is a substantially more mature evolution with 117 edge functions, 894 migrations, and 187 pages. Many features previously absent (SharePoint, Outlook, AI orchestration, vector layer, ClickUp) are now present. When KB files reference "sibling project" or "historical reference only", those notes may be outdated — verify against the current codebase.

---

## Common-task paths

### "I need to add a new page"

1. Create `src/pages/NewThing.tsx` (pure page)
2. Create `src/pages/NewThingWrapper.tsx` if you need auth/layout chrome
3. Import in [src/App.tsx](../src/App.tsx)
4. Add `<Route>` ABOVE the catch-all `*` route
5. If protected, wrap in `<ProtectedRoute>`

### "I need to add an edge function"

1. Create `supabase/functions/<name>/index.ts`
2. Copy the canonical pattern from [supabase/functions/invite-user/index.ts](../supabase/functions/invite-user/index.ts)
3. Validate caller auth + role
4. Return `{ ok, code, detail }` envelope
5. Deploy via Supabase CLI
6. Invoke from frontend via `supabase.functions.invoke('<name>', { body })`

### "I need to add a table"

1. Read [02-system-design.md → New table checklist](02-system-design.md#new-table-checklist)
2. Draft the migration with tenant_id, timestamps, RLS policies (BOTH), and `ENABLE ROW LEVEL SECURITY`
3. If NOT NULL columns may receive writes from Lovable, add coercion triggers
4. RJ reviews before apply
5. Generate updated DB types (if that's in the workflow yet)

### "I need to add a real-time feature"

1. Subscribe via `supabase.channel(<unique-name>).on('postgres_changes', {...}, handler).subscribe()`
2. Cleanup in the effect return: `supabase.removeChannel(channel)`
3. Mirror the pattern in [src/hooks/useMeetingRealtime.ts](../src/hooks/useMeetingRealtime.ts)

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
5. If still stuck, read [06-decision-trail.md → ADR-005](06-decision-trail.md#adr-005) — same failure modes keep recurring.
