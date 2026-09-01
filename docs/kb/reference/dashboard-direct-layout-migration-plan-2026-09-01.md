# Dashboard Direct-Layout Composition Migration Plan

> **Last updated:** 2026-09-01 · **Reconsider by:** 2026-12-01 · **Confidence:** high on the repository inventory and route/guard mapping; medium on final PR boundaries until each batch is remeasured on its own base.
>
> **Reflects commit:** `unicorn-cms-f09c59e5@87c410e3` (`origin/main`, measured 2026-09-01 after PRs [#487](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/487), [#488](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/488), and [#489](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/489)).
>
> **Status:** Planning only. This document authorizes no route, guard, permission, page, or production change. Carl's fresh, explicit sign-off is required before implementation starts and before any exception that changes effective authorization or visible composition is accepted.

## 1. Executive decision

Continue Phase 2 by removing page-owned `DashboardLayout` composition from the 115 currently routed, in-scope staff-shell pages, but do it as a guarded migration program rather than a mechanical wrapper sweep.

The live scan found 122 page files containing `<DashboardLayout>`. Five appear unrouted/dead and one is a known `/client/settings` double-shell orphan; those six are investigation or product-decision candidates, not silent conversion work. Of all 122 files, 51 render the layout in two to four branches. One routed page, `AuditTemplateBuilder.tsx`, intentionally uses the shell only in one mode and is therefore a design exception. This is materially riskier than PRs #487–#489.

The desired end state is:

1. `DashboardLayout` ownership is declared in route composition, not repeated across pages.
2. Authorization completes before the shell mounts; no stricter route relies on a child guard that runs inside an already-mounted layout.
3. The existing lazy `DashboardLayoutRoute` and its inner `Suspense` remain load-bearing.
4. Page chunks stay independently lazy and do not leak into the main entry or layout chunks.
5. Shell persistence is proven in a live browser with an unsent Ask Viv draft and stable DOM identity, not inferred from JSX.
6. Dead, conditional, double-shell, or unrelated behavior is flagged and separately decided instead of being folded into a composition PR.

`/dashboard` is deliberately last. It is the highest-traffic entry, is reachable by client personas as well as staff under current `ProtectedRoute` semantics, and owns three layout-bearing return branches. It should consume a proven migration and rollback playbook rather than serve as the experiment.

## 2. Relationship to the parent optimization plan

This is a detailed child plan for Phase 2 of [`codebase-optimization-plan-2026-08-28.md`](codebase-optimization-plan-2026-08-28.md). Its §22 execution-progress snapshot is stale at the measured commit: it stops at PR #482 and still describes the wrapper/nested-layout work as not started, while PRs #487–#489 are merged. That historical discrepancy is recorded here; this plan-only change does not silently rewrite the parent plan. The implementation program should update §22 explicitly in its first or final documentation PR.

The established rules in [`docs/route-composition-conventions.md`](../../route-composition-conventions.md) remain authoritative:

- a layout is owned once by a parent route;
- child pages return page content, fragments, loaders, errors, or redirects without remounting the shell;
- routes and pages remain lazy-loaded;
- page-level authorization and workflow checks are not erased merely because route composition moves.

## 3. Measurement method and live baseline

### 3.1 Reproducible inventory

Run these checks from the exact PR base before starting every batch; do not treat the dated tables below as permanently current:

```powershell
rg -l '<DashboardLayout' src/pages -g '*.tsx'
rg -n '<DashboardLayout|</DashboardLayout>' src/pages -g '*.tsx'
npm run routes -- --json --out route-manifest.before.json
rg -n 'workMenuItems|clientsMenuItems|eosMenuItems|resourceManagementMenuItems|administrationMenuItems|academyBuilderMenuItems|systemConfigMenuItems|strategicIntelligenceMenuItems' src/components/DashboardLayout.tsx
```

For every candidate, also sweep its imports/callers, its `App.tsx` lazy declaration and `<Route>`, any adapter wrapper, page-local `Navigate`/permission checks, and real navigation links. The route manifest cannot detect page-local authorization.

### 3.2 Baseline at `87c410e3`

| Metric | Live result |
|---|---:|
| Page files containing `<DashboardLayout>` | 122 |
| Opening layout sites | 199 |
| Files with one layout site | 71 |
| Files with two to four layout sites | 51 |
| Route registrations associated with the 122 files | 130 |
| Current generated route registrations, repository-wide | 243 |
| Safe executable conversion backlog after explicit exceptions | 115 files / 127 registrations |
| Dead/unrouted candidates to investigate separately | 5 |
| Known orphan/double-shell product decision | 1 |

Current route-tier distribution across the 130 associated registrations is 84 plain `ProtectedRoute`, 32 `requireSuperAdmin`, 11 `allowedRoles={ACADEMY_BUILDER_ROLES}`, and 3 `allowVivacityTeam`. These are JSX-chain counts, not a substitute for an effective authorization decision matrix.

### 3.3 Build baseline

A clean production build on the measured commit passed with 4,813 modules and 639 JavaScript chunks.

| Asset | Raw | Gzip |
|---|---:|---:|
| Main entry | 301.34 kB | 72.50 kB |
| `DashboardLayout` chunk | 174.91 kB | 44.55 kB |
| `DashboardLayoutRoute` chunk | 0.46 kB | 0.31 kB |
| Total JavaScript | 8,454,665 bytes | Record gzip total per PR |

`ClientDetail` already produces the sole over-500-kB warning at 656.10 kB. It is a pre-existing baseline, not permission to add another large eager chunk. Notable independently lazy candidates include `AuditWorkspaceNew` (195.01 kB), `PackageBuilderDetail` (139.13 kB), `ExecutiveDashboard` (127.02 kB), `BulkMembershipCertificatesPage` (107.84 kB), `EosAccountabilityChart` (103.25 kB), and `AcademyBuilderCourse` (95.89 kB).

## 4. Guard architecture: the prerequisite decision

### 4.1 Why the current parent cannot receive every route unchanged

`src/routes/dashboardRoutes.tsx` currently has one pathless parent:

```tsx
<Route element={<ProtectedRoute><DashboardLayoutRoute /></ProtectedRoute>}>
  {/* children */}
</Route>
```

A strict child guard inside that parent runs after the plain parent has authorized and mounted the layout. That has two failure modes:

- a stricter child such as `requireSuperAdmin` can reject only after the shell has mounted, allowing protected shell effects or a protected-content flash;
- an `allowVivacityTeam` child under `/admin/*` or `/administration/*` can never broaden the plain parent's location-sensitive administration decision, because the plain parent may reject first.

The three `allowVivacityTeam` routes affected are `/administration/contacts`, `/admin/regulator-watch`, and `/admin/regulator-watch/:eventId`. The existing `/admin/stages*` children also deserve a separately approved correction because their strict child guards currently sit inside the plain parent.

### 4.2 Safe foundation selected by this council

Do not weaken the top-level guard to make composition convenient. The initial implementation should establish sibling pathless guarded groups, all reusing the same lazy `DashboardLayoutRoute` component:

1. exact current plain `ProtectedRoute` semantics;
2. `requireSuperAdmin`;
3. `allowedRoles={ACADEMY_BUILDER_ROLES}`;
4. `allowVivacityTeam`.

The relevant guard must remain outside `DashboardLayoutRoute`. This guarantees authorization-before-layout and preserves the current effective gate for each route. It also means moving between different guard tiers may remount the layout. Persistence is guaranteed within a tier, not falsely claimed across tiers.

A future single-instance shell across heterogeneous permission tiers would require a separately designed, approved, and tested route-policy mechanism that computes the matched route's exact authorization before mounting the shell. That is adjacent to RBAC route-metadata work and is not authorized by this composition plan.

### 4.3 Semantics that must not be flattened

- Plain `ProtectedRoute` is location-sensitive. `/admin*` and `/administration*` require `administration:access`; `/eos*` and `/processes*` apply EOS access behavior; other unknown staff routes follow internal-staff rules; exact client-safe paths include `/dashboard` and settings/profile/Academy families.
- Menu visibility is not route authorization. A sidebar role array does not authorize changing a route gate to match it.
- `ACADEMY_BUILDER_ROLES` is Team Leader, Integrator, and CSC, with SuperAdmin passing implicitly. These routes are not SuperAdmin-only despite their `/superadmin/*` paths and sidebar labeling.
- Page-local checks remain. Examples include `admin/ai-insights`, `BulkInvite`, EOS permission redirects, and Academy package-mapping permission checks.
- Disabled-user and profile-loading behavior remain characterized as-is. Any existing fail-open/fail-closed concern is a separate security finding, not a migration side effect.

### 4.4 Feature gates that currently deny before the shell mounts

Six active pages perform a local permission/role redirect before reaching their page-owned `DashboardLayout`: `admin/ai-insights/index.tsx`, `EosClientImpact.tsx`, `EosGWCTrends.tsx`, `EosLeadershipDashboard.tsx`, `EosRockAnalysis.tsx`, and `AcademyPackageCourseRulesPage.tsx`. Moving their page content under a route-owned shell without hoisting an exactly equivalent feature gate would make the shell mount for a user who previously saw a redirect first.

For each one, the implementing PR must do one of the following with explicit Carl approval:

1. introduce/reuse an outside-the-layout route guard that evaluates the same permission, loading, and redirect decision and prove before/after persona parity; or
2. leave the page-owned layout as a named exception and open a follow-up design item.

`ProtectedRoute` cannot currently express these feature permissions. Do not assert parity merely because the final page remains denied.

## 5. Live file-by-section inventory

Legend: `L1` means one layout site; `L2`–`L4` means multiple layout-bearing branches. `SA` means `requireSuperAdmin`; `AB` means `allowedRoles={ACADEMY_BUILDER_ROLES}`; `VT` means `allowVivacityTeam`; `plain` means current location-sensitive `ProtectedRoute`. “Local gate” means the page has additional authorization or redirect behavior that must remain.

### 5.1 Work and executive surfaces — 13 files

| File | Current route(s) | Tier | Shape / caution |
|---|---|---|---|
| `src/pages/AskVivAssistant.tsx` | `/ask-viv` | plain | L2; loading `null` branch |
| `src/pages/CalendarTimeCapture.tsx` | `/calendar/time-capture` | plain | L3 |
| `src/pages/Dashboard.tsx` | `/documents`, `/messages`, `/reports`, `/triage-dashboard` | plain | L3; move all aliases atomically |
| `src/pages/ExecutiveClientCommitments.tsx` | `/executive/client-commitments` | SA | L1 |
| `src/pages/ExecutiveDashboard.tsx` | `/executive` | plain | L3; page-local restriction |
| `src/pages/ExecutiveDecisionQueue.tsx` | `/executive/decision-queue` | SA | L1 |
| `src/pages/ExecutiveFinancialControls.tsx` | `/executive/financial-controls` | SA | L1 |
| `src/pages/KpiPage.tsx` | `/kpi` | plain | L1 |
| `src/pages/MainDashboard.tsx` | `/dashboard` | plain | L3; highest traffic; client-safe path; migrate last |
| `src/pages/MyKpiDashboardPage.tsx` | `/my/kpi` | plain | L1 |
| `src/pages/MyOnboardingPage.tsx` | `/my-onboarding` | plain | L3 |
| `src/pages/MyWork.tsx` | `/my-work` | plain | L2 |
| `src/pages/TimeInbox.tsx` | `/time-inbox` | plain | L1 |

### 5.2 Clients, audits, documents, and support — 14 routed files

| File | Current route(s) | Tier | Shape / caution |
|---|---|---|---|
| `src/pages/AuditActions.tsx` | `/audits/:id/actions` | plain | L2 |
| `src/pages/AuditFindings.tsx` | `/audits/:id/findings` | plain | L2 |
| `src/pages/AuditReport.tsx` | `/audits/:id/report` | plain | L2 |
| `src/pages/AuditTemplateBuilder.tsx` | `/audits/create-template`, `/audits/create-template/:templateId` | plain | L1 but conditional: inspection uses shell; builder is intentionally full-screen. Exclude pending design. |
| `src/pages/AuditWorkspaceNew.tsx` | `/audits/:id` | plain | L4; 195.01-kB chunk |
| `src/pages/AuditsAssessments.tsx` | `/audits` | plain | L1 |
| `src/pages/BulkDocumentJobProgress.tsx` | `/manage-documents/bulk-jobs/:id` | plain | L4 |
| `src/pages/BulkDocumentJobsList.tsx` | `/manage-documents/bulk-jobs` | plain | L3 |
| `src/pages/BulkGenerateNew.tsx` | `/manage-documents/bulk-generate/new` | plain | L3 |
| `src/pages/ClientActivityFeed.tsx` | `/client-activity` | plain | L1 |
| `src/pages/ClientImpactPage.tsx` | `/tenant/:clientId/impact` | plain | L3 |
| `src/pages/NewSupportTicketPage.tsx` | `/support-tickets/new` | plain | L1 |
| `src/pages/RtoTips.tsx` | `/rto-tips` | plain | L1; indirect `RtoTipsWrapper`; currently has a redundant second plain guard |
| `src/pages/SuggestionDetail.tsx` | `/support-tickets/:id`, `/suggestions/:id` | plain | L3; aliases move together |

### 5.3 EOS and processes — 26 routed files

| File | Current route(s) | Shape / caution |
|---|---|---|
| `src/pages/eos/EosAccountabilityChart.tsx` | `/eos/accountability` | L1; 103.25-kB chunk |
| `src/pages/eos/EosCalendar.tsx` | `/eos/calendar` | L1 |
| `src/pages/eos/EosClientImpact.tsx` | `/eos/client-impact` | L1; local permission redirect |
| `src/pages/eos/EosClientImpactDetail.tsx` | `/eos/client-impact/:reportId` | L3 |
| `src/pages/eos/EosConfigurationDetail.tsx` | `/eos/configurations/:id` | L1 |
| `src/pages/eos/EosConfigurations.tsx` | `/eos/configurations` | L1 |
| `src/pages/eos/EosFlightPlan.tsx` | `/eos/flight-plan` | L1 |
| `src/pages/eos/EosGWCTrends.tsx` | `/eos/gwc-trends` | L1; local permission redirect |
| `src/pages/eos/EosHealth.tsx` | `/eos/health` | L1 |
| `src/pages/eos/EosHealthCheck.tsx` | `/eos/health-check` | L1 |
| `src/pages/eos/EosLeadershipDashboard.tsx` | `/eos/leadership` | L1; two local redirects |
| `src/pages/eos/EosMeetingSummary.tsx` | `/eos/meetings/:meetingId/summary` | L1 |
| `src/pages/eos/EosMeetings.tsx` | `/eos/meetings` | L1; active workflow |
| `src/pages/eos/EosOnboarding.tsx` | `/eos/onboarding` | L1 |
| `src/pages/eos/EosOverview.tsx` | `/eos` | L1 |
| `src/pages/eos/EosPeopleAnalyzer.tsx` | `/eos/people-analyzer` | L2 |
| `src/pages/eos/EosQC.tsx` | `/eos/qc` | L1 |
| `src/pages/eos/EosQCSession.tsx` | `/eos/qc/:id` | L2 |
| `src/pages/eos/EosRisksOpportunities.tsx` | `/eos/risks-opportunities` | L1 |
| `src/pages/eos/EosRockAnalysis.tsx` | `/eos/rock-analysis` | L1; local permission redirect |
| `src/pages/eos/EosRocks.tsx` | `/eos/rocks` | L1 |
| `src/pages/eos/EosScorecard.tsx` | `/eos/scorecard` | L1 |
| `src/pages/eos/EosTodos.tsx` | `/eos/todos` | L1 |
| `src/pages/eos/EosVto.tsx` | `/eos/vto` | L1 |
| `src/pages/ProcessDetail.tsx` | `/processes/:id` | L3 |
| `src/pages/ProcessForm.tsx` | `/processes/:id/edit`, `/processes/new` | L2; aliases move together |

All are plain routes, but the location-aware EOS/process behavior must be characterized and preserved.

### 5.4 Resource Management — 6 files / 13 routes

| File | Current route(s) | Tier / shape |
|---|---|---|
| `src/pages/ResourceCategoryPage.tsx` | eight `/resource-hub/{audit-evidence,checklists,ci-tools,guides-howto,registers-forms,templates,training-webinars,workbooks}` routes | plain, L1; all aliases move together |
| `src/pages/ResourceFavourites.tsx` | `/resource-hub/favourites` | plain, L1 |
| `src/pages/ResourceHubDashboard.tsx` | `/resource-hub` | plain, L1 |
| `src/pages/ResourceMostUsed.tsx` | `/resource-hub/most-used` | plain, L1 |
| `src/pages/ResourceRecentlyAdded.tsx` | `/resource-hub/recently-added` | plain, L1 |
| `src/pages/ResourceUpdatesLog.tsx` | `/resource-hub/updates` | plain, L1 |

### 5.5 Administration — 12 files

| File | Current route | Tier | Shape / caution |
|---|---|---|---|
| `src/pages/ManageInvites.tsx` | `/manage-invites` | plain | L2; indirect non-layout adapter |
| `src/pages/TeamUsers.tsx` | `/admin/team-users` | plain | L2 |
| `src/pages/TenantUsers.tsx` | `/admin/tenant-users` | plain | L2 |
| `src/pages/admin/BulkInvite.tsx` | `/admin/bulk-invite` | SA | L3; local SA redirect |
| `src/pages/admin/BulkMembershipCertificatesPage.tsx` | `/clients/bulk-membership-certificates` | plain | L1; local CSC/SA navigation gate; 107.84-kB chunk |
| `src/pages/admin/CohortAccessSender.tsx` | `/admin/cohort-sender` | SA | L3 |
| `src/pages/admin/CohortAccessSenderJob.tsx` | `/admin/cohort-sender/jobs/:jobId` | SA | L4 |
| `src/pages/admin/ContactDirectory.tsx` | `/administration/contacts` | VT | L1; cannot sit under the current plain parent |
| `src/pages/admin/NewStarterWizard.tsx` | `/admin/team-users/new-starter` | SA | L1 |
| `src/pages/admin/ProvisioningRunDetailPage.tsx` | `/admin/team-users/runs/:runId` | SA | L2 |
| `src/pages/admin/StaffEngagementDetail.tsx` | `/admin/staff-engagements/:id` | plain | L3 |
| `src/pages/admin/StaffEngagements.tsx` | `/admin/staff-engagements` | plain | L2 |

### 5.6 Academy Builder — 11 files

Every route in this table is AB-tier, not SA-only.

| File | Route | Shape / caution |
|---|---|---|
| `src/pages/superadmin/AcademyAddCoursePage.tsx` | `/superadmin/academy/add-course` | L1 |
| `src/pages/superadmin/AcademyBuilderCourse.tsx` | `/superadmin/academy/builder/:courseId` | L3; 95.89-kB chunk |
| `src/pages/superadmin/AcademyBuilderLibrary.tsx` | `/superadmin/academy/builder` | L1 |
| `src/pages/superadmin/AcademyBulkImportPage.tsx` | `/superadmin/academy/bulk-import` | L1 |
| `src/pages/superadmin/AcademyCertificatesPage.tsx` | `/superadmin/academy/certificates` | L1 |
| `src/pages/superadmin/AcademyCourseCleanupPage.tsx` | `/superadmin/academy/course-cleanup` | L1 |
| `src/pages/superadmin/AcademyEnrolmentsPage.tsx` | `/superadmin/academy/enrollments` | L1 |
| `src/pages/superadmin/AcademyPackageCourseRulesPage.tsx` | `/superadmin/academy/package-course-rules` | L2; local mapping permission redirect |
| `src/pages/superadmin/AcademyTagManagementPage.tsx` | `/superadmin/academy/tag-management` | L1 |
| `src/pages/superadmin/AcademyTenantAccessPage.tsx` | `/superadmin/academy/tenant-access` | L1 |
| `src/pages/superadmin/workforce-pdp.tsx` | `/superadmin/workforce-pdp` | L1 |

### 5.7 Strategic Intelligence — 8 files

| File | Route | Tier | Shape / caution |
|---|---|---|---|
| `src/pages/CrossTenantRiskRadar.tsx` | `/admin/risk-radar` | SA | L2 |
| `src/pages/RegulatorChangeEventDetail.tsx` | `/admin/regulator-watch/:eventId` | VT | L3; cannot sit under current plain parent |
| `src/pages/RegulatorWatchDashboard.tsx` | `/admin/regulator-watch` | VT | L2; cannot sit under current plain parent |
| `src/pages/RiskCommandCentre.tsx` | `/admin/risk-command` | SA | L2 |
| `src/pages/StrategicCommandCentre.tsx` | `/admin/strategic-command` | SA | L2 |
| `src/pages/StrategicOrchestrationDashboard.tsx` | `/admin/strategic-orchestration` | SA | L2 |
| `src/pages/TemplateGapAnalysis.tsx` | `/admin/template-gap-analysis` | SA | L2 |
| `src/pages/WorkflowOptimisation.tsx` | `/admin/workflow-optimisation` | SA | L2 |

### 5.8 System Config and admin drill-downs — 23 files

| File | Route | Tier | Shape / caution |
|---|---|---|---|
| `src/pages/AdminAssistant.tsx` | `/admin/assistant` | SA | L2; local SA gate |
| `src/pages/AdminEOSProcesses.tsx` | `/admin/eos-processes` | SA | L2; local capability gate |
| `src/pages/AdminKnowledgeLibrary.tsx` | `/admin/knowledge` | SA | L2; local SA gate |
| `src/pages/AdminOperations.tsx` | `/admin/operations` | SA | L1 |
| `src/pages/AdminStageAnalytics.tsx` | `/admin/stage-analytics` | SA | L2; local SA gate |
| `src/pages/CodeTablesAdmin.tsx` | `/admin/code-tables` | SA | L1 |
| `src/pages/KnowledgeExplorer.tsx` | `/admin/knowledge-explorer` | SA | L2; local SA gate |
| `src/pages/PackageBuilder.tsx` | `/admin/manage-packages` | SA | L1 |
| `src/pages/PackageBuilderDetail.tsx` | `/admin/package-builder/:id` | SA | L1; 139.13-kB chunk |
| `src/pages/ResearchJobDetail.tsx` | `/admin/research-jobs/:jobId` | plain | L3 |
| `src/pages/ResearchJobs.tsx` | `/admin/research-jobs` | plain | L2; local Vivacity restriction |
| `src/pages/StageBuilder.tsx` | `/admin/stage-builder` | SA | L3; local SA gate |
| `src/pages/admin/AddinDiagnostics.tsx` | `/admin/addin-diagnostics` | SA | L1 |
| `src/pages/admin/AddinSettings.tsx` | `/admin/addin-settings` | SA | L2 |
| `src/pages/admin/AdminZeroProgressPackagesPage.tsx` | `/admin/diagnostics/zero-progress-packages` | SA | L1 |
| `src/pages/admin/LifecycleChecklistsAdmin.tsx` | `/admin/lifecycle-checklists` | SA | L1 |
| `src/pages/admin/MergeFieldTagsAdmin.tsx` | `/admin/merge-field-tags` | SA | L1 |
| `src/pages/admin/SharePointFolderMapping.tsx` | `/admin/sharepoint-folder-mapping` | plain | L1 |
| `src/pages/admin/SharePointSitesAdmin.tsx` | `/admin/sharepoint-sites` | plain | L1 |
| `src/pages/admin/ai-insights/index.tsx` | `/admin/ai-insights` | plain | L1; page-local SA behavior including `null`/redirect branches |
| `src/pages/internal/AskVivFlags.tsx` | `/internal/ask-viv/flags` | SA | L3 |
| `src/pages/admin/settings/ReportingObligations.tsx` | `/admin/settings/reporting-obligations` | SA | L1 |
| `src/pages/admin/RolePermissionsEditor.tsx` | `/administration/role-permissions` | SA | L1 |

### 5.9 Utility/settings — 4 files

| File | Route | Tier | Shape / caution |
|---|---|---|---|
| `src/pages/IntegrationSettings.tsx` | `/settings/integrations` | plain | L1 |
| `src/pages/NotificationSettings.tsx` | `/settings/notifications` | plain | L1 |
| `src/pages/RoleReference.tsx` | `/settings/roles` | plain | L1 |
| `src/pages/SettingsWrapper.tsx` | `/client/settings` | plain | L1; known orphan and `ClientLayout > DashboardLayout` double shell; exclude pending product decision |

### 5.10 Dead/unrouted candidates — 5 files

| File | Evidence | Required action |
|---|---|---|
| `src/pages/Audits.tsx` | Lazy-declared in `App.tsx`; no route renders it; `/audits` uses `AuditsAssessments` | Confirm with caller/route/history sweep; separate cleanup PR if approved |
| `src/pages/AuditWorkspace.tsx` | Lazy-declared but no route renders it; `:id` uses `AuditWorkspaceNew` | Same |
| `src/pages/eos/EosIssues.tsx` | Lazy-declared but no route renders it | Same |
| `src/pages/NewSuggestionForm.tsx` | No import/caller found | Same |
| `src/pages/SuggestionRegister.tsx` | No import/caller found | Same |

No file in this table is deleted merely because this snapshot found no caller. Regenerate the route/caller/history evidence at implementation time and make deletion an explicit PR scope.

## 6. Proposed PR stack

The numbers below describe the measured base. Each PR must rebase on the preceding merged PR, regenerate the inventory, and adjust its exact file list in its description. A PR may be split smaller; it must not absorb the next slice merely because the code edit appears repetitive.

| Order | Logical slice | Planned files | Why here |
|---:|---|---:|---|
| 0 | Guard/verification foundation | No direct-layout page conversion | Add characterization coverage for four tiers and location-sensitive behavior; establish sibling guard-before-layout groups; explicitly correct or park existing `/admin/stages*` ordering. Requires Carl sign-off. |
| 1 | System Config: package/stage cohort | 4 | `PackageBuilder`, detail, `StageBuilder`, `AdminStageAnalytics`; SA-only audience, exercises L1/L2/L3 and a large lazy chunk with a small file count. |
| 2 | Strategic Intelligence: SA cohort | 6 | Narrow audience; all L2; validates repeated multi-branch removal without broad role exposure. |
| 3 | Academy Builder | 11 | A distinct AB tier with known positive TL/Integrator/CSC personas and negatives; validates non-SA custom role parity. |
| 4 | System Config: remaining SA cohort | 14 | Proven SA group; keep all heavy pages lazy. This may split into admin-tools and content/config PRs if review is unwieldy. |
| 5 | Resource Management | 6 files / 13 routes | Mechanically simple L1 pages, but plain internal audience is broader; validates aliases and real sidebar navigation after guard foundation. |
| 6 | Strategic/administration VT cohort | 3 | `ContactDirectory` plus two Regulator Watch pages; only after VT guard foundation and positive/negative persona proof. |
| 7 | Administration: SA cohort | 5 | Bulk invite/cohort/new-starter/provisioning; narrow audience but 13 total layout branches and local checks. |
| 8 | Administration: plain cohort | 6 | Manage Invites, Team/Tenant Users, Staff Engagement list/detail, Bulk Membership Certificates; broader and workflow-heavy. |
| 9 | Remaining System Config plain cohort | 5 | Research list/detail, two SharePoint pages, AI Insights; preserve each page-local restriction even where the route is plain. |
| 10 | EOS: overview/read-only cohort | 14 | Start with list/overview/health/analysis surfaces; preserve location-sensitive EOS access and local redirects. Exact membership chosen during blast-radius pass. |
| 11 | EOS: interactive/detail cohort | 12 | Meetings, QC, configuration/detail, process forms, and other parameterized flows; higher live-workflow and state risk. |
| 12 | Clients: document jobs | 3 | Bulk job list/progress/new; related workflow and branch-heavy but bounded. |
| 13 | Clients: audit workspace | 5 routed files | Audits list/workspace/actions/findings/report, excluding `AuditTemplateBuilder` until its full-screen decision. |
| 14 | Clients: support/activity/impact | 5 | Support aliases, RTO wrapper, client impact/activity; document the redundant RTO guard normalization explicitly. |
| 15 | Work: utility/personal settings | 7 | Three settings pages plus KPI, My KPI, My Onboarding, Time Inbox; broad audience but bounded, no `/dashboard`. |
| 16 | Work: executive and personal work | 7 | Ask Viv, calendar, My Work, Executive root and three strict executive children; keep plain and SA groups separate despite one section. |
| 17 | Legacy dashboard aliases | 1 file / 4 routes | Move `Dashboard.tsx` aliases atomically; verify every legacy URL and navigation source. |
| 18 | Main dashboard | 1 | `/dashboard` alone, last. Highest traffic, three branches, client and staff personas, strongest persistence and rollback proof. |
| Decision | `AuditTemplateBuilder` | 1 | Decide whether inspection becomes a nested child while builder routes stay full-screen, or whether composition is redesigned. No mechanical unwrap. |
| Decision | `/client/settings` | 1 | Decide the intended portal and shell; do not normalize the double shell incidentally. |
| Optional cleanup | Five dead candidates | 5 | Separate deletion PR after confirmed evidence and explicit scope. |

The 115-file executable backlog is accounted for by orders 1–18. The two routed design exceptions and five dead candidates are accounted for separately. PR ordering is driven first by effective route-plus-local authorization audience, then structural variety, then production/workflow sensitivity. Sidebar visibility alone is not an audience measure: Resource Management is visually restricted but route-plain, Academy Builder is TL/Integrator/CSC plus implicit SA, and several System Config routes are plain despite the menu label. The sequence is intentionally not a simple count sort.

## 7. Per-PR implementation contract

### 7.1 Before editing

1. Obtain Carl's explicit approval for the named slice and its guard tier.
2. Record exact base SHA and confirm a clean worktree.
3. Generate `route-manifest.before.json`, the direct-layout count, caller map, and paired production-build baseline.
4. List every route alias, parameterized route, redirect, adapter wrapper, local permission check, and return branch for the selected files.
5. Fill the persona decision table with expected allow/deny outcomes. An unavailable persona is **Inconclusive**, never silently treated as passed.

### 7.2 Atomic route ownership move

For every included page:

1. Add an independently lazy child under the exact guarded dashboard group. Named exports use an explicit `.then(...)` mapping.
2. Remove the corresponding `App.tsx` route and lazy declaration in the same commit.
3. Remove only the page-owned `DashboardLayout` import/tags. Preserve loaders, errors, redirects, providers, fragments, and page-local gates.
4. If early returns shared the shell, use the minimum fragment/content restructuring necessary, as `Processes.tsx` did in PR #489. Do not rewrite business logic.
5. Keep `DashboardLayoutRoute` lazy in its own file and retain its inner `Suspense` around `<Outlet />`.
6. Sweep all callers before unwrapping; a component rendered both as a route and inside another shell is not a mechanical candidate.

### 7.3 Guard parity checklist

- [ ] Anonymous direct deep link is redirected before shell/page mount and without protected flash.
- [ ] Disabled/profile-loading behavior matches the base.
- [ ] Exact positive and negative personas match the before-state for every route.
- [ ] Plain `/admin`, `/administration`, `/eos`, `/processes`, unknown staff, and client-safe location semantics are not generalized.
- [ ] SA, AB, and VT props are byte-for-byte equivalent in meaning and execute before `DashboardLayoutRoute`.
- [ ] Page-local permission/role checks and redirects remain present and ordered.
- [ ] Route paths, params, aliases, redirects, declaration order, and duplicate-path behavior are unchanged.
- [ ] A denied persona never mounts a shell sentinel, opens a realtime subscription, or renders page content.
- [ ] Menu visibility changes are absent unless separately approved.

Minimum persona matrix across the program: anonymous; disabled; client Admin; client User; CSC; Integrator; Team Leader; BGT/CET/Team Member negative cases; SuperAdmin; Academy-only where available. For each PR, select all personas capable of distinguishing its tiers. The existing Playwright harness only has SuperAdmin and client-demo storage states; missing required accounts must be disclosed as a blocker to a full parity claim or verified live with Carl-provided QA personas.

### 7.4 Route and automated verification

Compare before/after manifests semantically. Repository-wide route count should remain 243 unless the PR explicitly and separately removes a confirmed dead registration; path, params, redirects, lazy source, declaration order, and effective authorization decisions must match. A source-file/composed-wrapper change is expected; an authorization outcome change is not.

Run, at minimum:

```powershell
npm run routes -- --json --out route-manifest.after.json
npm run routes:check-drift
npm run build
npm run test:frontend
npm run test:edge
npm run typecheck
$env:LINT_RATCHET_BASE = '<exact-base-sha>'; npm run lint:ratchet
npm run e2e:unauth
npm run e2e:personas
```

Record known baseline exceptions rather than laundering them as new failures. At the measured date, typecheck has one pre-existing `ContactDirectory.tsx` TS2345 error. Authenticated coverage is persona-limited. If a required command cannot run, the PR is not fully verified and must say why.

PR 0 should add focused `ProtectedRoute` characterization tests covering all four explicit tiers plus location-sensitive admin/EOS/client behavior. Existing tests do not fully cover the strict tiers.

### 7.5 Paired bundle check

Use the same Node/npm version, clean install state, and production-build command for the exact base and branch. Record raw and gzip sizes for:

- main entry;
- `DashboardLayoutRoute`;
- `DashboardLayout`;
- each migrated page chunk;
- total JavaScript and gzip total;
- the complete over-500-kB warning list;
- representative cold-route network requests.

Investigate before merge if any of these occur:

- main entry grows by more than 10 kB raw or 3 kB gzip;
- either untouched layout chunk changes by more than 2%;
- total JavaScript grows unexplained by more than 1%, or total gzip by more than 25 kB;
- any new chunk crosses 500 kB;
- a representative cold route gains more than 10 kB gzip;
- a moved page or its heavy dependency appears in the entry/layout chunk.

Thresholds trigger investigation, not automatic acceptance. Any justified exception must be itemized with Carl's sign-off.

### 7.6 Live persistence proof

A claim that “the layout should persist” is insufficient. On the actual branch dev server:

1. Start from an already-composed route in the same guard tier, such as `/manage-tenants` where authorized.
2. Open Ask Viv, enter a unique unsent draft, and capture the exact DOM node/reference for a stable shell element such as the Open Ask Viv control.
3. Navigate through a real sidebar/link to a newly migrated route, then to a second migrated route, then back to the established route. For a detail route, enter via its real list/card link and return via its breadcrumb/back control; do not use `page.goto` for the persistence assertion.
4. Verify the unsent draft and exact DOM node identity survive every within-tier navigation, with no page/console errors and no duplicate shell subscriptions.
5. Separately verify a cold direct deep link, refresh, parameterized route, and denied persona for the slice's strictest route.
6. Run the full existing 20-test Playwright suite on desktop and mobile where configured.

Cross-tier remounting under the selected safe architecture is expected and must not be advertised as a failure or as global persistence. Migrated-to-unmigrated navigation will also remount during partial rollout; each PR description must disclose that temporary boundary.

### 7.7 Definition of done

A section PR is done only when:

- every named route is owned once and only once;
- every included page has zero direct `DashboardLayout` imports/sites;
- every excluded exception is still explicitly listed;
- route and effective guard parity are evidenced;
- lazy chunk boundaries and bundle thresholds are evidenced;
- live persistence is proven within the correct guard tier;
- automated checks and limitations are reported honestly;
- the PR is independently reviewable and revertible;
- the remaining live direct-layout inventory is regenerated and included.

## 8. Risks and exception playbook

### Multiple return branches

Removing only the main branch leaves loaders/errors remounting the shell or produces mismatched JSX. Inventory all return branches first. Where the former shell provided a common root, return a fragment or the existing content node without changing state/effect order.

Seventeen active files have a `DashboardLayout` site with more than one direct JSX child and therefore need an explicit fragment/container preservation pass: `admin/BulkInvite`, `ClientActivityFeed`, `admin/ContactDirectory`, `admin/StaffEngagementDetail`, `admin/settings/ReportingObligations`, `MainDashboard`, `ManageInvites`, `NewSupportTicketPage`, `ProcessDetail`, `ProcessForm`, `RegulatorWatchDashboard`, `SuggestionDetail`, `superadmin/AcademyCertificatesPage`, `AcademyEnrolmentsPage`, `AcademyTagManagementPage`, `AcademyTenantAccessPage`, and `superadmin/workforce-pdp`. Dead candidate `Audits.tsx` has the same shape. This list is a dated AST result and must be regenerated per PR.

### Conditional shell composition

`AuditTemplateBuilder` intentionally shows `DashboardLayout` only in inspection mode; its normal builder is full-screen. Nesting both routes under the shell would be a product/UI regression. Split route modes only after an explicit design decision, or leave it excluded.

### Redirect and `null` branches

`BulkInvite`, AI Insights, Ask Viv, several EOS pages, and Academy package rules return redirects or `null` in some states. Do not wrap these merely to satisfy a syntactic pattern, and do not move the redirect after layout mount.

### Adapter wrappers and duplicate guards

`ManageInvitesWrapper` and `RtoTipsWrapper` are live indirect adapters. `RtoTipsWrapper` also adds a second plain guard. Removing a redundant identical guard may be reasonable, but it is still an observable composition change and must be called out, tested, and approved rather than disappearing inside a broad PR.

### Route aliases and ordering

`Dashboard.tsx`, `SuggestionDetail`, `ProcessForm`, `AuditTemplateBuilder`, and `ResourceCategoryPage` serve multiple registrations. Move all registrations for one page atomically and preserve order, dynamic params, redirects, and duplicate behavior.

### Lazy-loading regression

Importing route pages statically into `dashboardRoutes.tsx`, importing `DashboardLayout` directly there, or moving `Suspense` outside the persistent shell can erase the performance win or cause the shell to disappear during child chunk loading. These are plan-blocking regressions.

### Partial migration boundaries

Until all compatible routes move, crossing between composed and page-owned routes remounts the shell. This is temporary, testable, and should shrink monotonically. Guard-tier boundaries may remain by design.

### Realtime and unsaved state

The shell owns Ask Viv state, sidebar state, tenant/access checks, and realtime subscriptions. Persistence tests should check both retained UI state and absence of duplicate subscriptions or console errors. A stable visual appearance alone is not proof.

### Shared-worktree concurrency

Implementation must use an isolated worktree/branch under the repository's normal branch rules. Before trusting earlier edits or measurements, recheck branch and status because other agents share the base checkout.

## 9. Explicit non-goals and stop conditions

Do not silently do any of the following in a composition PR:

- change role definitions, permission grants, menu visibility, RBAC methodology, disabled-user behavior, or `ProtectedRoute` policy;
- consolidate all guard tiers under a broader parent;
- fix an unrelated page bug, stale copy, data query, effect dependency, type error, or lint backlog item;
- delete a dead candidate, wrapper, export, route, or import without explicit evidence and PR scope;
- redesign `AuditTemplateBuilder` full-screen behavior or `/client/settings` portal ownership;
- remove page-local authorization because a route guard appears equivalent;
- rename routes, change redirects, normalize duplicate registrations, or remove legacy aliases;
- refactor `DashboardLayout`, Ask Viv, realtime code, navigation arrays, or business components for style;
- introduce a generic route factory or premature abstraction solely to reduce lines;
- combine database, RLS, RPC, Edge Function, or production changes with this frontend composition work;
- update historical audit entries.

If any such issue is found, record it in the PR description with evidence and choose one of: park it, open a follow-up, or obtain explicit approval to split it into a separate PR. Discovery is not authorization.

Stop the slice before merge if route outcomes differ, an unauthorized shell mounts, the route manifest cannot explain a delta, a heavy page becomes eager, required live personas are unavailable for a permission-sensitive change, or live persistence fails.

## 10. Rollback design

Every implementation PR must be independently revertible. The rollback for a page batch is:

1. restore its `App.tsx` lazy declarations and route registrations;
2. restore the page-owned `DashboardLayout` imports/tags in every original branch;
3. remove only that batch's children from the guarded dashboard group;
4. rerun route-manifest parity and the relevant direct-link/persona smoke tests.

Do not change the shared `DashboardLayoutRoute` contract in an ordinary section PR. Keep foundation changes isolated so they can be reverted without untangling business pages. A rollback is successful when authorization and routes match the pre-PR state; shell remounting returning for that slice is the expected rollback tradeoff.

## 11. Council review record

The plan was reviewed against the live repository by four lenses. The findings below are retained so later implementers can see what changed during review rather than receiving only a polished conclusion.

### Seat A — React Router and migration correctness

**Finding.** The live count is 122, not an assumed “about 122”; 51 files have multiple layout sites, five have no route, and `AuditTemplateBuilder` is conditionally full-screen. Aliases, indirect wrappers, local redirects, and page-local gates make a bulk syntactic rewrite unsafe.

**Adjustment.** Added the file/route/branch inventory, atomic alias rule, caller sweep, conditional-page decision row, and explicit fragment/redirect handling. Added a monotonically shrinking live inventory to every PR's definition of done.

### Seat B — bundle size and lazy-loading

**Finding.** The optimization can reverse itself if the shared route module statically imports pages or layout code. The current `DashboardLayoutRoute` file and inner `Suspense` are load-bearing. Several candidate pages are large enough to expose an eager-import mistake immediately.

**Adjustment.** Added a measured production baseline, paired-build method, named numeric investigation thresholds, cold-route network check, and a rule that each page remains independently lazy. `/dashboard` remains last after earlier batches prove the bundle discipline.

### Seat C — guard and security parity

**Finding.** A single plain guarded parent with stricter child guards mounts the shell before strict denial and cannot represent the three broader VT routes. The existing `/admin/stages*` nesting already illustrates the ordering hazard. Menu roles and current route authorization also differ in places, while plain `ProtectedRoute` varies by location.

**Adjustment.** Security takes precedence over maximum cross-tier persistence. The plan now requires sibling exact-tier groups with guard-before-layout, a persona decision matrix, denied-shell sentinel checks, and explicit characterization of admin/EOS/client semantics. It records cross-tier remounting honestly and parks any single-instance heterogeneous policy design for separate RBAC approval.

### Seat D — verification and rollback safety

**Finding.** JSX inspection and a passing build cannot prove persistence, permission parity, parameterized navigation, or safe rollback. Existing authenticated Playwright states cover only SuperAdmin and a client demo, so permission claims can otherwise outrun evidence.

**Adjustment.** Added exact-base manifests, direct-link and denied-persona checks, live Ask Viv draft plus DOM-identity proof through real links, console/subscription checks, Inconclusive handling for missing personas, per-PR rollback steps, and a `/dashboard`-alone final slice.

### Council disposition

Proceed only after Carl approves PR 0's guard architecture and persona plan. The council does not approve a naive bulk move under the current plain parent. With the adjustments above, the work is divisible, permission-preserving, measurable, and reversible; without them, the performance refactor has an unacceptable authorization blast radius.

## 12. Completion outcome

When all approved conversion rows are complete, active compatible routes will share a persistent staff shell within their exact guard tier, direct page-owned `DashboardLayout` sites will fall from 199 to only explicitly decided exceptions, and adding a new staff page will have one discoverable route-composition path. The program will reduce repeated JSX/import noise and eliminate avoidable shell remounts without claiming that LOC reduction is more important than permission correctness.

The final documentation PR should:

- regenerate the 122-file/199-site baseline and report the remaining exceptions;
- update §22 of the parent optimization plan with PR links and measured outcomes;
- update route-composition conventions if guard-tier composition adds a reusable rule;
- record bundle before/after and the routes/personas actually verified;
- leave historical audit entries unchanged.
