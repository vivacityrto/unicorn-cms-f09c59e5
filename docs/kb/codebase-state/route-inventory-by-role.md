# Route Inventory by Role

> **Last updated:** 2026-08-27 (full mechanical regeneration plus legacy compatibility route) · **Reconsider by:** 2026-10-27 — routes churn fast; re-derive rather than trust this list once stale.
>
> **Reflects:** cleanup branch `hotfix/dead-code-route-cleanup`, 2026-08-27. The legacy `/client/eos` page is retired, but its protected compatibility redirect remains in the inventory; `/package/:id` remains wired pending an explicit retirement decision.
>
> **Methodology:** every `<Route>` in [`src/App.tsx`](../../../src/App.tsx) (**250 total**), extracted mechanically by [`scripts/generate-route-inventory.mjs`](../../../scripts/generate-route-inventory.mjs) — path, rendered component, and guard tier read directly from the JSX, not hand-transcribed. **Re-run that script and paste its output back into the tables below whenever this doc goes stale** — that's the "drift check" F-024 asked for; there's no separate CI job for it yet (nothing enforces re-running it, it's on whoever next relies on this doc to notice the count looks wrong).
>
> **Confidence:** high for the route→file→guard mapping (mechanically extracted, not transcribed). Low for "who actually uses this" and for the deeper product question of which `requireSuperAdmin` routes are *intentionally* hard-gated vs. should be permission-gated instead — that's [`rbac-v6-gate-closure-plan.md`](../handoffs/rbac-v6-gate-closure-plan.md) Phase 0, not this doc.

---

## How routes are gated

Four guard patterns found in `App.tsx`:
- **`public`** — no wrapper, reachable pre-auth (`Login`, `ResetPassword`, etc.) — or a `<Navigate>` redirect registered without `<ProtectedRoute>`, which just bounces to another (usually protected) path rather than rendering anything itself.
- **`ProtectedRoute`** — any authenticated user; the *page itself* usually does further role/tenant checks internally (e.g. client vs staff view). `useRBAC`'s client-route allowlist (`isClientAccessibleRoute` — see [`useRBAC.tsx`](../../../src/hooks/useRBAC.tsx)) additionally fails closed here for non-staff users on any route not explicitly classified as client-accessible.
- **`requireSuperAdmin`** — hard-gated, redirects non-SuperAdmins to `/dashboard`.
- **`allowVivacityTeam`** / **`allowedRoles={CONST}`** — narrower allowlists layered on top of `ProtectedRoute` (an explicit role list, or "any Vivacity Team member" as a softer alternative to `requireSuperAdmin`).

**Known issue found during this regeneration:** `/support-tickets` is registered twice (`SupportTicketsWrapper` and, later in the file, `SupportTicketsPage`) — React Router only ever reaches the first match, so the second registration is dead code. Not fixed as part of this doc regeneration; flagged for a follow-up hotfix.

---

<!-- BEGIN GENERATED TABLES — regenerate with `node scripts/generate-route-inventory.mjs` -->

## public (24 routes)

| Route segment | Route | Component |
|---|---|---|
| (catch-all) | `*` | `NotFound` |
| / | `/` | `Login` |
| /.lovable | `/.lovable/oauth/consent` | `OAuthConsent` |
| /accept-invitation | `/accept-invitation` | `AcceptInvitationWrapper` |
| /activate | `/activate` | `ActivateAccount` |
| /addin | `/addin` | `AddinShell` |
| /admin | `/admin/governance-documents` | `Navigate` |
| /admin | `/admin/integrations/xero-callback` | `XeroCallback` |
| /calendar | `/calendar/outlook-callback` | `OutlookCallback` |
| /client | `/client/communications` | `Navigate` |
| /client | `/client/documents` | `Navigate` |
| /client | `/client/notifications` | `Navigate` |
| /client | `/client/suggestions` | `Navigate` |
| /client | `/client/suggestions/:id` | `Navigate` |
| /client | `/client/suggestions/new` | `Navigate` |
| /client | `/client/team` | `Navigate` |
| /eos | `/eos/issues` | `Navigate` |
| /login | `/login` | `Login` |
| /oauth | `/oauth/consent` | `OAuthConsent` |
| /post-sign-in | `/post-sign-in` | `PostSignInRedirect` |
| /reset-password | `/reset-password` | `ResetPassword` |
| /suggestions | `/suggestions` | `Navigate` |
| /suggestions | `/suggestions/new` | `Navigate` |
| /teams | `/teams` | `TeamsShell` |

## ProtectedRoute (171 routes)

| Route segment | Route | Component |
|---|---|---|
| /academy | `/academy` | `AcademyDashboardWrapperNew` |
| /academy | `/academy/administration-assistant` | `AcademyAdminAssistantWrapper` |
| /academy | `/academy/certificates` | `AcademyCertificatesPage` |
| /academy | `/academy/community` | `AcademyCommunity` |
| /academy | `/academy/compliance-manager` | `AcademyComplianceManagerWrapperNew` |
| /academy | `/academy/course/:slug` | `AcademyCourseDetailWrapper` |
| /academy | `/academy/course/:slug/assessment/:assessmentId` | `AcademyAssessmentWrapper` |
| /academy | `/academy/course/:slug/assessment/:assessmentId/result/:attemptId` | `AcademyAssessmentResultWrapper` |
| /academy | `/academy/course/:slug/lesson/:lessonId` | `AcademyLessonViewerWrapper` |
| /academy | `/academy/courses` | `AcademyCoursesListPage` |
| /academy | `/academy/events` | `AcademyEvents` |
| /academy | `/academy/governance-person` | `AcademyGovernancePersonWrapperNew` |
| /academy | `/academy/pdp` | `AcademyPdpPage` |
| /academy | `/academy/pdp/cycle/:cycleId` | `AcademyPdpCyclePage` |
| /academy | `/academy/pdp/reviews` | `AcademyPdpReviewsPage` |
| /academy | `/academy/profile` | `AcademyProfileWrapperNew` |
| /academy | `/academy/student-support-officer` | `AcademyStudentSupportWrapper` |
| /academy | `/academy/team` | `AcademyTeam` |
| /academy | `/academy/trainer` | `AcademyTrainerWrapperNew` |
| /academy | `/academy/workbooks` | `AcademyWorkbooksPage` |
| /admin | `/admin/ai-insights` | `AiInsightsPage` |
| /admin | `/admin/client-packages/:clientPackageId` | `ClientPackageDetailWrapper` |
| /admin | `/admin/email-templates` | `ManageEmailTemplatesWrapper` |
| /admin | `/admin/integrations/tga` | `AdminTgaIntegrationWrapper` |
| /admin | `/admin/integrations/xero` | `AdminXeroIntegrationWrapper` |
| /admin | `/admin/package/:id` | `AdminPackageDetailWrapper` |
| /admin | `/admin/package/:id/tenant/:tenantId` | `AdminPackageTenantDetailWrapper` |
| /admin | `/admin/package/:id/tenant/:tenantId/instance/:instanceId` | `AdminPackageTenantDetailWrapper` |
| /admin | `/admin/research-jobs` | `ResearchJobs` |
| /admin | `/admin/research-jobs/:jobId` | `ResearchJobDetail` |
| /admin | `/admin/reviews` | `AdminReviews` |
| /admin | `/admin/sharepoint-folder-mapping` | `SharePointFolderMapping` |
| /admin | `/admin/sharepoint-sites` | `SharePointSitesAdmin` |
| /admin | `/admin/staff-engagements` | `StaffEngagements` |
| /admin | `/admin/staff-engagements/:id` | `StaffEngagementDetail` |
| /admin | `/admin/team-users` | `TeamUsers` |
| /admin | `/admin/tenant-users` | `TenantUsers` |
| /admin | `/admin/user-audit` | `AdminUserAudit` |
| /audits | `/audits` | `AuditsAssessments` |
| /audits | `/audits/:id` | `AuditWorkspaceNew` |
| /audits | `/audits/:id/actions` | `AuditActions` |
| /audits | `/audits/:id/findings` | `AuditFindings` |
| /audits | `/audits/:id/report` | `AuditReport` |
| /audits | `/audits/create-template` | `AuditTemplateBuilder` |
| /audits | `/audits/create-template/:templateId` | `AuditTemplateBuilder` |
| /calendar | `/calendar` | `CalendarWrapper` |
| /calendar | `/calendar/time-capture` | `CalendarTimeCapture` |
| /client-activity | `/client-activity` | `ClientActivityFeed` |
| /client-portal | `/client-portal/:tenantId/documents` | `ClientPortalDocumentsWrapper` |
| /client-preview | `/client-preview` | `ClientPreview` |
| /client | `/client/academy-activity` | `AcademyActivityWrapperNew` |
| /client | `/client/calendar` | `ClientCalendarWrapperNew` |
| /client | `/client/certificate` | `ClientCertificateWrapper` |
| /client | `/client/files` | `ClientFilesWrapperNew` |
| /client | `/client/governance-documents` | `ClientGovernanceDocumentsWrapperNew` |
| /client | `/client/home` | `ClientHomeWrapperNew` |
| /client | `/client/eos` | `Navigate` (compatibility redirect to `/client/home`) |
| /client | `/client/inbox` | `ClientInboxWrapperNew` |
| /client | `/client/packages` | `ClientPackagesWrapperNew` |
| /client | `/client/profile` | `ClientProfileWrapperNew` |
| /client | `/client/regulatory-updates` | `RegulatoryUpdatesWrapper` |
| /client | `/client/regulatory-updates/:eventId` | `RegulatoryUpdateDetailWrapper` |
| /client | `/client/reports` | `ClientReportsWrapperNew` |
| /client | `/client/resource-hub` | `ClientResourceHubWrapperNew` |
| /client | `/client/resource-hub/:categoryId` | `ClientResourceHubWrapperNew` |
| /client | `/client/settings` | `ClientSettingsWrapperNew` |
| /client | `/client/staff-pdps` | `StaffPdpsWrapperNew` |
| /client | `/client/support-tickets` | `SupportTicketsPortalWrapper` |
| /client | `/client/support-tickets/:id` | `SupportTicketPortalDetailWrapper` |
| /client | `/client/tasks` | `ClientTasksWrapperNew` |
| /client | `/client/tga` | `ClientTgaDetailsWrapperNew` |
| /client | `/client/users` | `ClientUsersWrapperNew` |
| /clients | `/clients/bulk-membership-certificates` | `BulkMembershipCertificatesPage` |
| /communications | `/communications` | `TeamCommunicationsWrapper` |
| /compliance-audits | `/compliance-audits` | `ComplianceAuditGlobal` |
| /compliance-audits | `/compliance-audits/:tenantId` | `ComplianceAuditList` |
| /compliance-audits | `/compliance-audits/:tenantId/audit/:auditId` | `ComplianceAuditForm` |
| /compliance-audits | `/compliance-audits/:tenantId/audit/:auditId/report` | `ComplianceAuditReport` |
| /dashboard | `/dashboard` | `MainDashboard` |
| /documents | `/documents` | `Dashboard` |
| /email-triage | `/email-triage` | `EmailTriageWrapper` |
| /eos | `/eos` | `EosOverview` |
| /eos | `/eos/accountability` | `EosAccountabilityChart` |
| /eos | `/eos/calendar` | `EosCalendar` |
| /eos | `/eos/client-impact` | `EosClientImpact` |
| /eos | `/eos/client-impact/:reportId` | `EosClientImpactDetail` |
| /eos | `/eos/configurations` | `EosConfigurations` |
| /eos | `/eos/configurations/:id` | `EosConfigurationDetail` |
| /eos | `/eos/flight-plan` | `EosFlightPlan` |
| /eos | `/eos/gwc-trends` | `EosGWCTrends` |
| /eos | `/eos/health` | `EosHealth` |
| /eos | `/eos/health-check` | `EosHealthCheck` |
| /eos | `/eos/leadership` | `EosLeadershipDashboard` |
| /eos | `/eos/meetings` | `EosMeetings` |
| /eos | `/eos/meetings/:meetingId/live` | `LiveMeetingView` |
| /eos | `/eos/meetings/:meetingId/summary` | `EosMeetingSummary` |
| /eos | `/eos/onboarding` | `EosOnboarding` |
| /eos | `/eos/people-analyzer` | `EosPeopleAnalyzer` |
| /eos | `/eos/qc` | `EosQC` |
| /eos | `/eos/qc/:id` | `EosQCSession` |
| /eos | `/eos/risks-opportunities` | `EosRisksOpportunities` |
| /eos | `/eos/rock-analysis` | `EosRockAnalysis` |
| /eos | `/eos/rocks` | `EosRocks` |
| /eos | `/eos/scorecard` | `EosScorecard` |
| /eos | `/eos/todos` | `EosTodos` |
| /eos | `/eos/vto` | `EosVto` |
| /executive | `/executive` | `ExecutiveDashboard` |
| /inbox | `/inbox` | `TeamInboxWrapper` |
| /kpi | `/kpi` | `KpiPage` |
| /manage-categories | `/manage-categories` | `ManageCategoriesWrapper` |
| /manage-documents | `/manage-documents` | `ManageDocumentsWrapper` |
| /manage-documents | `/manage-documents/bulk-generate/new` | `BulkGenerateNew` |
| /manage-documents | `/manage-documents/bulk-jobs` | `BulkDocumentJobsList` |
| /manage-documents | `/manage-documents/bulk-jobs/:id` | `BulkDocumentJobProgress` |
| /manage-invites | `/manage-invites` | `ManageInvitesWrapper` |
| /manage-stages | `/manage-stages` | `ManageStagesWrapper` |
| /manage-tenants | `/manage-tenants` | `ManageTenantsWrapper` |
| /manage-users | `/manage-users` | `ManageUsersWrapper` |
| /membership-dashboard | `/membership-dashboard` | `MembershipDashboardWrapper` |
| /messages | `/messages` | `Dashboard` |
| /my-exit-interview | `/my-exit-interview` | `MyExitInterview` |
| /my-onboarding | `/my-onboarding` | `MyOnboardingPage` |
| /my-work | `/my-work` | `MyWork` |
| /my | `/my/kpi` | `MyKpiDashboardPage` |
| /processes | `/processes` | `ProcessesWrapper` |
| /processes | `/processes/:id` | `ProcessDetail` |
| /processes | `/processes/:id/edit` | `ProcessForm` |
| /processes | `/processes/new` | `ProcessForm` |
| /profile | `/profile` | `Navigate` |
| /reports | `/reports` | `Dashboard` |
| /resource-hub | `/resource-hub` | `ResourceHubDashboard` |
| /resource-hub | `/resource-hub/audit-evidence` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/checklists` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/ci-tools` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/favourites` | `ResourceFavourites` |
| /resource-hub | `/resource-hub/guides-howto` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/most-used` | `ResourceMostUsed` |
| /resource-hub | `/resource-hub/recently-added` | `ResourceRecentlyAdded` |
| /resource-hub | `/resource-hub/registers-forms` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/templates` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/training-webinars` | `ResourceCategoryPage` |
| /resource-hub | `/resource-hub/updates` | `ResourceUpdatesLog` |
| /resource-hub | `/resource-hub/workbooks` | `ResourceCategoryPage` |
| /rto-tips | `/rto-tips` | `RtoTipsWrapper` |
| /settings | `/settings` | `SettingsWrapper` |
| /settings | `/settings/calendar` | `Navigate` |
| /settings | `/settings/integrations` | `IntegrationSettings` |
| /settings | `/settings/notifications` | `NotificationSettings` |
| /settings | `/settings/roles` | `RoleReference` |
| /suggestions | `/suggestions/:id` | `SuggestionDetail` |
| /support-tickets | `/support-tickets` | `SupportTicketsWrapper` |
| /support-tickets | `/support-tickets` | `SupportTicketsPage` |
| /support-tickets | `/support-tickets/:id` | `SuggestionDetail` |
| /support-tickets | `/support-tickets/new` | `NewSupportTicketPage` |
| /tasks | `/tasks` | `TasksManagementWrapper` |
| /team-settings | `/team-settings` | `TeamSettingsWrapper` |
| /tenant-detail | `/tenant-detail/:tenantId` | `ClientDetailWrapper` |
| /tenant | `/tenant/:clientId/impact` | `ClientImpactPage` |
| /tenant | `/tenant/:tenantId` | `ClientDetailWrapper` |
| /tenant | `/tenant/:tenantId/document/:documentId` | `TenantDocumentDetailWrapper` |
| /tenant | `/tenant/:tenantId/documents` | `TenantDocumentsWrapper` |
| /tenant | `/tenant/:tenantId/documents-hub` | `TenantDocumentsHubWrapper` |
| /tenant | `/tenant/:tenantId/logins` | `TenantLoginsWrapper` |
| /tenant | `/tenant/:tenantId/members` | `TenantMembersWrapper` |
| /tenant | `/tenant/:tenantId/notes` | `TenantNotesWrapper` |
| /tenant | `/tenant/:tenantId/tasks` | `TasksManagementWrapper` |
| /time-inbox | `/time-inbox` | `TimeInbox` |
| /triage-dashboard | `/triage-dashboard` | `Dashboard` |
| /user-profile | `/user-profile/:userId` | `UserProfileWrapper` |
| /work | `/work/calendar` | `WorkCalendarWrapper` |
| /work | `/work/meetings` | `WorkMeetings` |

## requireSuperAdmin (42 routes)

| Route segment | Route | Component |
|---|---|---|
| /admin | `/admin/addin-diagnostics` | `AddinDiagnostics` |
| /admin | `/admin/addin-settings` | `AddinSettings` |
| /admin | `/admin/assistant` | `AdminAssistant` |
| /admin | `/admin/bulk-invite` | `BulkInvite` |
| /admin | `/admin/clickup-import` | `ClickUpImport` |
| /admin | `/admin/clickup-mapping` | `ClickUpTenantMapping` |
| /admin | `/admin/code-tables` | `CodeTablesAdmin` |
| /admin | `/admin/cohort-sender` | `CohortAccessSender` |
| /admin | `/admin/cohort-sender/jobs/:jobId` | `CohortAccessSenderJob` |
| /admin | `/admin/compliance-packs` | `AdminCompliancePacks` |
| /admin | `/admin/diagnostics/zero-progress-packages` | `AdminZeroProgressPackagesPage` |
| /admin | `/admin/eos-processes` | `AdminEOSProcesses` |
| /admin | `/admin/knowledge` | `AdminKnowledgeLibrary` |
| /admin | `/admin/knowledge-explorer` | `KnowledgeExplorer` |
| /admin | `/admin/lifecycle-checklists` | `LifecycleChecklistsAdmin` |
| /admin | `/admin/manage-packages` | `PackageBuilder` |
| /admin | `/admin/merge-field-tags` | `MergeFieldTagsAdmin` |
| /admin | `/admin/operations` | `AdminOperations` |
| /admin | `/admin/package-builder/:id` | `PackageBuilderDetail` |
| /admin | `/admin/qa/responsive` | `QAResponsiveHarness` |
| /admin | `/admin/qa/smoke` | `QASmokeTest` |
| /admin | `/admin/risk-command` | `RiskCommandCentre` |
| /admin | `/admin/risk-radar` | `CrossTenantRiskRadar` |
| /admin | `/admin/settings/reporting-obligations` | `ReportingObligationsAdmin` |
| /admin | `/admin/stage-analytics` | `AdminStageAnalytics` |
| /admin | `/admin/stage-builder` | `StageBuilder` |
| /admin | `/admin/stages` | `AdminManageStagesWrapper` |
| /admin | `/admin/stages/:stage_id` | `AdminStageDetailWrapper` |
| /admin | `/admin/strategic-command` | `StrategicCommandCentre` |
| /admin | `/admin/strategic-orchestration` | `StrategicOrchestrationDashboard` |
| /admin | `/admin/team-users/new-starter` | `NewStarterWizard` |
| /admin | `/admin/team-users/runs/:runId` | `ProvisioningRunDetailPage` |
| /admin | `/admin/team-users/runs/:runId/onboarding` | `OnboardingHubPage` |
| /admin | `/admin/template-gap-analysis` | `TemplateGapAnalysis` |
| /admin | `/admin/workflow-optimisation` | `WorkflowOptimisation` |
| /administration | `/administration/contacts` | `ContactDirectory` |
| /administration | `/administration/role-permissions` | `RolePermissionsEditor` |
| /ask-viv | `/ask-viv` | `AskVivAssistant` |
| /executive | `/executive/client-commitments` | `ExecutiveClientCommitments` |
| /executive | `/executive/decision-queue` | `ExecutiveDecisionQueue` |
| /executive | `/executive/financial-controls` | `ExecutiveFinancialControls` |
| /internal | `/internal/ask-viv/flags` | `AskVivFlags` |

## allowVivacityTeam (2 routes)

| Route segment | Route | Component |
|---|---|---|
| /admin | `/admin/regulator-watch` | `RegulatorWatchDashboard` |
| /admin | `/admin/regulator-watch/:eventId` | `RegulatorChangeEventDetail` |

## allowedRoles=ACADEMY_BUILDER_ROLES (11 routes)

| Route segment | Route | Component |
|---|---|---|
| /superadmin | `/superadmin/academy/builder` | `AcademyBuilderLibrary` |
| /superadmin | `/superadmin/academy/builder/:courseId` | `AcademyBuilderCourse` |
| /superadmin | `/superadmin/academy/bulk-import` | `AcademyBulkImportPage` |
| /superadmin | `/superadmin/academy/certificates` | `AcademyCertificatesAdminPage` |
| /superadmin | `/superadmin/academy/course-cleanup` | `AcademyCourseCleanupPage` |
| /superadmin | `/superadmin/academy/enrollments` | `AcademyEnrolmentsPage` |
| /superadmin | `/superadmin/academy/package-course-rules` | `AcademyPackageCourseRulesPage` |
| /superadmin | `/superadmin/academy/quick-add` | `AcademyQuickAddPage` |
| /superadmin | `/superadmin/academy/tag-management` | `AcademyTagManagementPage` |
| /superadmin | `/superadmin/academy/tenant-access` | `AcademyTenantAccessPage` |
| /superadmin | `/superadmin/workforce-pdp` | `SuperAdminWorkforcePdp` |

<!-- END GENERATED TABLES -->

---

## Known open questions from this pass

1. **`/support-tickets` duplicate registration** (new this pass) — `SupportTicketsWrapper` and `SupportTicketsPage` both claim it; the second is dead code. Needs a hotfix to remove the unreachable registration (or confirm intent and rename one).
2. **Legacy route compatibility** — the old `/client/eos` page is retired, but `/client/eos` remains as a protected redirect to `/client/home` so saved links do not become 404s. `/package/:id` remains wired and is not safe to remove until bookmark/operational usage and a redirect destination are confirmed; its shared `PackageDetail` implementation is used by active admin routes.
3. `/my/kpi` (deprecated v1) is still wired — not removed, just superseded per [`unicorn_app_url`](../../memory/unicorn_app_url.md).
4. `/client-portal/:tenantId/documents` is `ProtectedRoute`-only (no `requireSuperAdmin`/`allowedRoles`) despite the staff-facing naming — same caution as before, confirm who actually lands on this before relying on this doc's tier bucketing for it specifically. F-001's `isClientAccessibleRoute()` allowlist does NOT include this path, so client roles are denied by the RBAC layer regardless of the route's own `ProtectedRoute`-only guard — see `src/test/rbac/useRBAC.test.ts` and `ProtectedRoute.test.tsx`.
5. The `requireSuperAdmin` (42) vs `allowedRoles`/`allowVivacityTeam` (13) split is exactly what rbac-v6 Phase 0 needs to work through — which of the 42 hard-SA routes are *intentionally* SA-only (system config, the Role Permission Editor itself) vs. candidates for the Phase 1 permission-based route guard. Not decided here.

## Cross-references

- [`scripts/generate-route-inventory.mjs`](../../../scripts/generate-route-inventory.mjs) — regenerates the tables above; re-run and paste back in whenever this doc is suspected stale
- [`codebase-map.md`](codebase-map.md) — file-path/component structure (this doc adds the role lens on top)
- [`rbac-v6-gate-closure-plan.md`](../handoffs/rbac-v6-gate-closure-plan.md) — the deeper per-route product classification this doc's mechanical extraction feeds into
- [`super-admin-exploration-2026-05-21.md`](super-admin-exploration-2026-05-21.md) — prior admin-side bug/hygiene findings, due for re-verification against current `main`
- [`feature-matrix-2026-05-20.md`](feature-matrix-2026-05-20.md) — per-route feature status for client-side roles
