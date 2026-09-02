import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionGate } from "@/components/PermissionGate";

const DashboardLayoutRoute = lazy(() => import("@/components/layout/DashboardLayoutRoute"));

// Non-SuperAdmin roles allowed on Academy Builder admin routes (SuperAdmin is
// always allowed by ProtectedRoute). Was a local const in App.tsx before
// these routes moved here.
const ACADEMY_BUILDER_ROLES = ["Team Leader", "Integrator", "CSC"];

const AdminManageStages = lazy(() => import("@/pages/AdminManageStages"));
const AdminStageDetail = lazy(() => import("@/pages/AdminStageDetail"));
const PackageBuilder = lazy(() => import("@/pages/PackageBuilder"));
const PackageBuilderDetail = lazy(() => import("@/pages/PackageBuilderDetail"));
const StageBuilder = lazy(() => import("@/pages/StageBuilder"));
const AdminStageAnalytics = lazy(() => import("@/pages/AdminStageAnalytics"));
const CrossTenantRiskRadar = lazy(() => import("@/pages/CrossTenantRiskRadar"));
const RiskCommandCentre = lazy(() => import("@/pages/RiskCommandCentre"));
const StrategicCommandCentre = lazy(() => import("@/pages/StrategicCommandCentre"));
const StrategicOrchestrationDashboard = lazy(() => import("@/pages/StrategicOrchestrationDashboard"));
const TemplateGapAnalysis = lazy(() => import("@/pages/TemplateGapAnalysis"));
const WorkflowOptimisation = lazy(() => import("@/pages/WorkflowOptimisation"));
const PackageDetail = lazy(() => import("@/pages/PackageDetail"));
const AdminPackageTenantDetail = lazy(() => import("@/pages/AdminPackageTenantDetail"));
const AdminTgaIntegration = lazy(() => import("@/pages/AdminTgaIntegration"));
const AdminXeroIntegration = lazy(() => import("@/pages/AdminXeroIntegration"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const ClientPortalDocuments = lazy(() => import("@/pages/ClientPortalDocuments"));
const EmailTriagePage = lazy(() => import("@/pages/EmailTriagePage"));
const ManageCategories = lazy(() => import("@/pages/ManageCategories"));
const ManageDocuments = lazy(() => import("@/pages/ManageDocuments"));
const ManageEmailTemplates = lazy(() => import("@/pages/ManageEmailTemplates"));
const ManageStages = lazy(() => import("@/pages/ManageStages"));
const ManageTenants = lazy(() => import("@/pages/ManageTenants"));
const ManageUsers = lazy(() => import("@/pages/ManageUsers"));
const Processes = lazy(() => import("@/pages/Processes"));
const Settings = lazy(() => import("@/pages/Settings"));
const SupportTicketsPage = lazy(() => import("@/pages/SupportTicketsPage"));
const TeamCommunicationsPage = lazy(() => import("@/pages/TeamCommunicationsPage"));
const TeamInboxTabs = lazy(() => import("@/pages/TeamInboxTabs"));
const TeamSettings = lazy(() => import("@/pages/TeamSettings"));
const TenantDocumentsHub = lazy(() => import("@/pages/TenantDocumentsHub"));
const TenantDocuments = lazy(() => import("@/pages/TenantDocuments"));
const TenantLogins = lazy(() => import("@/pages/TenantLogins"));
const TenantMembers = lazy(() => import("@/pages/TenantMembers"));
const TenantNotes = lazy(() => import("@/pages/TenantNotes"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const WorkCalendar = lazy(() => import("@/pages/WorkCalendar"));
const WorkMeetings = lazy(() => import("@/pages/WorkMeetings"));
const AcademyEnrolmentsPage = lazy(() => import("@/pages/superadmin/AcademyEnrolmentsPage"));
const SuperAdminWorkforcePdp = lazy(() => import("@/pages/superadmin/workforce-pdp"));
const AcademyTenantAccessPage = lazy(() => import("@/pages/superadmin/AcademyTenantAccessPage"));
const AcademyCertificatesAdminPage = lazy(() => import("@/pages/superadmin/AcademyCertificatesPage"));
const AcademyBuilderLibrary = lazy(() => import("@/pages/superadmin/AcademyBuilderLibrary"));
const AcademyBuilderCourse = lazy(() => import("@/pages/superadmin/AcademyBuilderCourse"));
const AcademyAddCoursePage = lazy(() => import("@/pages/superadmin/AcademyAddCoursePage"));
const AcademyBulkImportPage = lazy(() => import("@/pages/superadmin/AcademyBulkImportPage"));
const AcademyCourseCleanupPage = lazy(() => import("@/pages/superadmin/AcademyCourseCleanupPage"));
const AcademyTagManagementPage = lazy(() => import("@/pages/superadmin/AcademyTagManagementPage"));
const AcademyPackageCourseRulesPage = lazy(() => import("@/pages/superadmin/AcademyPackageCourseRulesPage"));
const AdminZeroProgressPackagesPage = lazy(() => import("@/pages/admin/AdminZeroProgressPackagesPage"));
const AdminOperations = lazy(() => import("@/pages/AdminOperations"));
const RolePermissionsEditor = lazy(() => import("@/pages/admin/RolePermissionsEditor"));
const AdminAssistant = lazy(() => import("@/pages/AdminAssistant"));
const AdminKnowledgeLibrary = lazy(() => import("@/pages/AdminKnowledgeLibrary"));
const AdminEOSProcesses = lazy(() => import("@/pages/AdminEOSProcesses"));
const AddinSettings = lazy(() => import("@/pages/admin/AddinSettings"));
const AddinDiagnostics = lazy(() => import("@/pages/admin/AddinDiagnostics"));
const AskVivFlags = lazy(() => import("@/pages/internal/AskVivFlags"));
const KnowledgeExplorer = lazy(() => import("@/pages/KnowledgeExplorer"));
const CodeTablesAdmin = lazy(() => import("@/pages/CodeTablesAdmin"));
const LifecycleChecklistsAdmin = lazy(() => import("@/pages/admin/LifecycleChecklistsAdmin"));
const MergeFieldTagsAdmin = lazy(() => import("@/pages/admin/MergeFieldTagsAdmin"));
const ReportingObligationsAdmin = lazy(() => import("@/pages/admin/settings/ReportingObligations"));
const ResourceHubDashboard = lazy(() => import("@/pages/ResourceHubDashboard"));
const ResourceCategoryPage = lazy(() => import("@/pages/ResourceCategoryPage"));
const ResourceRecentlyAdded = lazy(() => import("@/pages/ResourceRecentlyAdded"));
const ResourceMostUsed = lazy(() => import("@/pages/ResourceMostUsed"));
const ResourceFavourites = lazy(() => import("@/pages/ResourceFavourites"));
const ResourceUpdatesLog = lazy(() => import("@/pages/ResourceUpdatesLog"));
const ContactDirectory = lazy(() => import("@/pages/admin/ContactDirectory"));
const RegulatorWatchDashboard = lazy(() => import("@/pages/RegulatorWatchDashboard"));
const RegulatorChangeEventDetail = lazy(() => import("@/pages/RegulatorChangeEventDetail"));
const NewStarterWizard = lazy(() => import("@/pages/admin/NewStarterWizard"));
const ProvisioningRunDetailPage = lazy(() => import("@/pages/admin/ProvisioningRunDetailPage"));
const BulkInvite = lazy(() => import("@/pages/admin/BulkInvite"));
const CohortAccessSender = lazy(() => import("@/pages/admin/CohortAccessSender"));
const CohortAccessSenderJob = lazy(() => import("@/pages/admin/CohortAccessSenderJob"));

/**
 * Staff (DashboardLayout) pages that previously each used a dedicated
 * *Wrapper.tsx file to mount DashboardLayout individually (28 near-
 * mechanical files serving 32 routes -- ClientDetailWrapper and
 * AdminPackageTenantDetailWrapper each served two routes with the same
 * component). Converted to a nested layout route so DashboardLayout mounts
 * once per staff session instead of remounting on every click between
 * these pages (docs/kb/reference/codebase-optimization-plan-2026-08-28.md,
 * P1.3). See AGENTS.md -> "Client Portal / Academy route composition" for
 * the standing convention this extends to the staff shell too.
 *
 * These routes have no shared path prefix (unlike /academy and /client),
 * so this is a pathless parent layout route -- children keep their real,
 * absolute paths.
 *
 * Deliberate behavior change, confirmed with Carl: sidebar-open/section-
 * collapse state and the Ask Viv assistant's open/closed panel, active
 * conversation, message history, and any unsent draft text now persist
 * across navigation among these routes, instead of every one of those
 * resetting on every single page change (today, clicking any sidebar link
 * while mid-conversation with Ask Viv discards the whole chat). Confirmed
 * safe not to change anything else: the three sidebar badge-count hooks
 * (useTeamUnreadCount, useMyAssignedConversationsCount,
 * useSupportTicketsBadge) already self-refresh via realtime subscriptions
 * or polling, independent of mount/remount; useProfileSetupReminder's
 * "show at most once per day" guarantee is backed by a database check
 * keyed on calendar dates, not in-memory state, so it behaves identically
 * either way.
 *
 * Two routes (/admin/stages, /admin/stages/:stage_id) require SuperAdmin
 * specifically, stricter than every other route in this family. They live
 * under their own sibling parent route with <ProtectedRoute
 * requireSuperAdmin> guarding DashboardLayoutRoute directly, reusing the
 * same lazy component as the plain-tier parent below.
 *
 * Corrected 2026-09-02 (see docs/kb/reference/dashboard-direct-layout-
 * migration-plan-2026-09-01.md, council seat C): this was originally
 * implemented as a requireSuperAdmin guard nested *inside* the shared
 * plain-tier parent's children, which is unsafe -- the outer plain
 * ProtectedRoute authorizes and mounts DashboardLayoutRoute (the full
 * shell: sidebar, Ask Viv, realtime subscriptions) for ANY authenticated
 * staff member, and only the already-mounted child's inner guard then
 * redirects a non-SuperAdmin user away. That is a real protected-shell
 * mount for a rejected persona, not "the same combined effect" the
 * original comment claimed. Moving these two routes to their own
 * requireSuperAdmin-guarded parent (still pathless, still the same
 * DashboardLayoutRoute) ensures authorization completes before the shell
 * mounts, at the cost of a layout remount when navigating between this
 * tier and the plain tier -- an accepted, documented tradeoff, not a
 * regression, per the migration plan's guard-architecture section.
 *
 * Every child here is deliberately lazy-loaded, regardless of whether the
 * page it replaces was imported eagerly inside its retired Wrapper file
 * (all 28 were eager-imported internally): the Wrapper's own outer
 * lazy-loadedness (in App.tsx) was what kept an eagerly-imported inner
 * page out of the main bundle before. Since this route module is itself a
 * static top-level import in App.tsx (like DashboardLayoutRoute above),
 * each child now needs its own lazy boundary to preserve that "not loaded
 * until visited" property.
 *
 * Two special cases, not simple wrapper retirements:
 * - Processes: ProcessesWrapper.tsx was not the mechanical pattern -- the
 *   real DashboardLayout wrapping (in two separate return branches, a
 *   loading skeleton and the loaded state) lived inside Processes.tsx
 *   itself, with ProcessesWrapper.tsx only providing a nicer-looking
 *   pre-load skeleton. Unwrapped Processes.tsx directly and deleted
 *   ProcessesWrapper.tsx entirely -- the shared DashboardLayoutRoute
 *   Suspense fallback above now covers the pre-load state uniformly, same
 *   as every other route in this family.
 * - /inbox: TeamInboxWrapper.tsx combined two page components
 *   (MyNotificationsPage, TeamInboxPage) under one <Tabs> UI rather than
 *   rendering a single page -- kept that composition, renamed to
 *   TeamInboxTabs.tsx (it no longer wraps a layout) since "Wrapper" would
 *   now be a misleading name.
 *
 * NOT covered: SettingsWrapper.tsx (src/pages/SettingsWrapper.tsx) is
 * deliberately left untouched and NOT deleted, even though /settings below
 * uses the bare Settings component directly. SettingsWrapper.tsx is also
 * imported by src/routes/clientRoutes.tsx for the orphaned /client/settings
 * route (unreachable from any UI, not linked from anywhere -- a
 * pre-existing bug, not introduced by this PR) -- deleting it here would
 * break that reference. Not fixed as part of this PR; flagged separately.
 *
 * Ongoing migration (see docs/kb/reference/dashboard-direct-layout-
 * migration-plan-2026-09-01.md): the ~115 remaining staff pages that still
 * weave <DashboardLayout> directly into their own JSX (rather than the
 * *Wrapper.tsx mechanical pattern above) are being converted in batches,
 * each as its own PR, into the sibling guard-tier groups below. PR 1
 * (System Config: package/stage cohort) added PackageBuilder,
 * PackageBuilderDetail, StageBuilder, AdminStageAnalytics to the
 * requireSuperAdmin group -- all four kept their page-local access checks
 * (e.g. StageBuilder/AdminStageAnalytics's own `if (!isSuperAdmin)` early
 * return) unchanged; only the DashboardLayout wrap was removed, per the
 * plan's rule against removing page-local authorization just because a
 * route guard appears equivalent. PR 2 (Strategic Intelligence: SA cohort)
 * added CrossTenantRiskRadar, RiskCommandCentre, StrategicCommandCentre,
 * StrategicOrchestrationDashboard, TemplateGapAnalysis, WorkflowOptimisation
 * to the same requireSuperAdmin group -- all six kept their page-local
 * `if (!isSuperAdmin)` (or `!isSuperAdmin && !isVivacityTeam`) early return
 * unchanged, same rule. PR 3 (Academy Builder cohort) added a new
 * allowedRoles={ACADEMY_BUILDER_ROLES} sibling group (Team Leader,
 * Integrator, CSC, SuperAdmin implicitly) for 10 Academy Builder pages, plus
 * a third sibling group layering <PermissionGate featureKey=
 * "academy.mapping.view" minLevel="full"> inside the same allowedRoles tier
 * for AcademyPackageCourseRulesPage specifically -- that page's real access
 * gate is a role_permissions-driven check independent of unicorn_role
 * membership, previously implemented as a page-owned accessLoading spinner
 * + !hasAccess <Navigate>, both still shell-wrapped (see PermissionGate's
 * own doc comment). Moving it to a route-level guard above
 * DashboardLayoutRoute means the shell now never mounts for a role-
 * permitted-but-permission-denied user, closing a flash that pre-dates this
 * migration. Every other Academy Builder page's own DashboardLayout
 * removal preserved any multi-sibling return (a Dialog/AlertDialog/Sheet/
 * drawer alongside the main content div) with a Fragment rather than
 * silently dropping a sibling. PR 4 (System Config: remaining SA cohort)
 * added 14 more files to the requireSuperAdmin group: AdminZeroProgress
 * PackagesPage, AdminOperations, RolePermissionsEditor, AdminAssistant,
 * AdminKnowledgeLibrary, AdminEOSProcesses, AddinSettings,
 * AddinDiagnostics, AskVivFlags, KnowledgeExplorer, CodeTablesAdmin,
 * LifecycleChecklistsAdmin, MergeFieldTagsAdmin, ReportingObligationsAdmin.
 * All 14 kept whatever page-local access check they already had (several
 * are now redundant given the route's own requireSuperAdmin, e.g.
 * AskVivFlags's own hasAccess check gates on the broader
 * Vivacity-internal-staff status, not SuperAdmin specifically -- left
 * unchanged per the plan's page-local-check preservation rule).
 * ReportingObligationsAdmin needed a Fragment (three dialog siblings
 * alongside the main content div); every other page in this batch was
 * single-root. PR 5 (Resource Management cohort) added the 6-file/
 * 13-route Resource Hub family to the plain group: ResourceHubDashboard,
 * ResourceCategoryPage (rendered under 8 of the 13 routes, one per
 * category via its categoryId prop -- the component also reads a
 * :category route param for a separate client-portal route in
 * clientRoutes.tsx, untouched here), ResourceRecentlyAdded,
 * ResourceMostUsed, ResourceFavourites, ResourceUpdatesLog. All six were
 * already single-root with no page-local access checks to preserve.
 * PR 6 (Strategic/Administration VT cohort) added a new
 * allowVivacityTeam sibling group -- the fourth guard tier, distinct from
 * requireSuperAdmin/allowedRoles/plain -- for the 3 routes the migration
 * plan identified as unable to safely sit under the existing plain
 * parent: /administration/contacts (ContactDirectory), /admin/
 * regulator-watch (RegulatorWatchDashboard), and /admin/regulator-watch/
 * :eventId (RegulatorChangeEventDetail). Before this PR these 3 routes
 * used ProtectedRoute allowVivacityTeam directly in App.tsx (not nested
 * under the plain DashboardLayoutRoute parent), so this is a new tier,
 * not a guard-ordering fix like the /admin/stages one above.
 * RegulatorWatchDashboard and ContactDirectory each needed a Fragment
 * (a Dialog/AlertDialog sibling alongside the main content div);
 * RegulatorChangeEventDetail was single-root across all 3 of its return
 * branches. RegulatorWatchDashboard and RegulatorChangeEventDetail each
 * kept their page-local `!isSuperAdmin && !isVivacityTeam` "Access
 * Restricted" check unchanged, now redundant given the route's own
 * allowVivacityTeam guard, per the plan's page-local-check preservation
 * rule; ContactDirectory has no such page-local gate. PR 7 (Administration:
 * SA cohort) added 5 more files to the requireSuperAdmin group:
 * NewStarterWizard, ProvisioningRunDetailPage, BulkInvite,
 * CohortAccessSender, CohortAccessSenderJob. BulkInvite kept its
 * page-local `profile.unicorn_role !== "Super Admin"` Navigate redirect
 * and CohortAccessSender/CohortAccessSenderJob kept their page-local
 * `!isVivacityStaff` gate, both now redundant given the route's own
 * requireSuperAdmin, per the plan's page-local-check preservation rule.
 * NewStarterWizard and BulkInvite each needed a Fragment (a sibling
 * Dialog alongside the main content div); the other three were
 * single-root across all of their return branches.
 */
export const dashboardLayoutRoutes = (
  <>
    <Route element={<ProtectedRoute requireSuperAdmin><DashboardLayoutRoute /></ProtectedRoute>}>
      <Route path="/admin/stages" element={<AdminManageStages />} />
      <Route path="/admin/stages/:stage_id" element={<AdminStageDetail />} />
      <Route path="/admin/manage-packages" element={<PackageBuilder />} />
      <Route path="/admin/package-builder/:id" element={<PackageBuilderDetail />} />
      <Route path="/admin/stage-builder" element={<StageBuilder />} />
      <Route path="/admin/stage-analytics" element={<AdminStageAnalytics />} />
      <Route path="/admin/risk-radar" element={<CrossTenantRiskRadar />} />
      <Route path="/admin/risk-command" element={<RiskCommandCentre />} />
      <Route path="/admin/strategic-command" element={<StrategicCommandCentre />} />
      <Route path="/admin/strategic-orchestration" element={<StrategicOrchestrationDashboard />} />
      <Route path="/admin/template-gap-analysis" element={<TemplateGapAnalysis />} />
      <Route path="/admin/workflow-optimisation" element={<WorkflowOptimisation />} />
      <Route path="/admin/diagnostics/zero-progress-packages" element={<AdminZeroProgressPackagesPage />} />
      <Route path="/admin/operations" element={<AdminOperations />} />
      <Route path="/administration/role-permissions" element={<RolePermissionsEditor />} />
      <Route path="/admin/assistant" element={<AdminAssistant />} />
      <Route path="/admin/knowledge" element={<AdminKnowledgeLibrary />} />
      <Route path="/admin/eos-processes" element={<AdminEOSProcesses />} />
      <Route path="/admin/addin-settings" element={<AddinSettings />} />
      <Route path="/admin/addin-diagnostics" element={<AddinDiagnostics />} />
      <Route path="/internal/ask-viv/flags" element={<AskVivFlags />} />
      <Route path="/admin/knowledge-explorer" element={<KnowledgeExplorer />} />
      <Route path="/admin/code-tables" element={<CodeTablesAdmin />} />
      <Route path="/admin/lifecycle-checklists" element={<LifecycleChecklistsAdmin />} />
      <Route path="/admin/merge-field-tags" element={<MergeFieldTagsAdmin />} />
      <Route path="/admin/settings/reporting-obligations" element={<ReportingObligationsAdmin />} />
      <Route path="/admin/team-users/new-starter" element={<NewStarterWizard />} />
      <Route path="/admin/team-users/runs/:runId" element={<ProvisioningRunDetailPage />} />
      <Route path="/admin/bulk-invite" element={<BulkInvite />} />
      <Route path="/admin/cohort-sender" element={<CohortAccessSender />} />
      <Route path="/admin/cohort-sender/jobs/:jobId" element={<CohortAccessSenderJob />} />
    </Route>
    <Route element={<ProtectedRoute allowedRoles={ACADEMY_BUILDER_ROLES}><DashboardLayoutRoute /></ProtectedRoute>}>
      <Route path="/superadmin/academy/enrollments" element={<AcademyEnrolmentsPage />} />
      <Route path="/superadmin/workforce-pdp" element={<SuperAdminWorkforcePdp />} />
      <Route path="/superadmin/academy/tenant-access" element={<AcademyTenantAccessPage />} />
      <Route path="/superadmin/academy/certificates" element={<AcademyCertificatesAdminPage />} />
      <Route path="/superadmin/academy/builder" element={<AcademyBuilderLibrary />} />
      <Route path="/superadmin/academy/add-course" element={<AcademyAddCoursePage />} />
      <Route path="/superadmin/academy/bulk-import" element={<AcademyBulkImportPage />} />
      <Route path="/superadmin/academy/course-cleanup" element={<AcademyCourseCleanupPage />} />
      <Route path="/superadmin/academy/tag-management" element={<AcademyTagManagementPage />} />
      <Route path="/superadmin/academy/builder/:courseId" element={<AcademyBuilderCourse />} />
    </Route>
    <Route
      element={
        <ProtectedRoute allowedRoles={ACADEMY_BUILDER_ROLES}>
          <PermissionGate featureKey="academy.mapping.view" minLevel="full">
            <DashboardLayoutRoute />
          </PermissionGate>
        </ProtectedRoute>
      }
    >
      <Route path="/superadmin/academy/package-course-rules" element={<AcademyPackageCourseRulesPage />} />
    </Route>
    <Route element={<ProtectedRoute><DashboardLayoutRoute /></ProtectedRoute>}>
      <Route path="/admin/package/:id" element={<PackageDetail />} />
      <Route path="/admin/package/:id/tenant/:tenantId/instance/:instanceId" element={<AdminPackageTenantDetail />} />
      <Route path="/admin/package/:id/tenant/:tenantId" element={<AdminPackageTenantDetail />} />
      <Route path="/admin/integrations/tga" element={<AdminTgaIntegration />} />
      <Route path="/admin/integrations/xero" element={<AdminXeroIntegration />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/tenant/:tenantId" element={<ClientDetail />} />
      <Route path="/tenant-detail/:tenantId" element={<ClientDetail />} />
      <Route path="/client-portal/:tenantId/documents" element={<ClientPortalDocuments />} />
      <Route path="/email-triage" element={<EmailTriagePage />} />
      <Route path="/manage-categories" element={<ManageCategories />} />
      <Route path="/manage-documents" element={<ManageDocuments />} />
      <Route path="/admin/email-templates" element={<ManageEmailTemplates />} />
      <Route path="/manage-stages" element={<ManageStages />} />
      <Route path="/manage-tenants" element={<ManageTenants />} />
      <Route path="/manage-users" element={<ManageUsers />} />
      <Route path="/processes" element={<Processes />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/support-tickets" element={<SupportTicketsPage />} />
      <Route path="/communications" element={<TeamCommunicationsPage />} />
      <Route path="/inbox" element={<TeamInboxTabs />} />
      <Route path="/team-settings" element={<TeamSettings />} />
      <Route path="/tenant/:tenantId/documents-hub" element={<TenantDocumentsHub />} />
      <Route path="/tenant/:tenantId/documents" element={<TenantDocuments />} />
      <Route path="/tenant/:tenantId/logins" element={<TenantLogins />} />
      <Route path="/tenant/:tenantId/members" element={<TenantMembers />} />
      <Route path="/tenant/:tenantId/notes" element={<TenantNotes />} />
      <Route path="/user-profile/:userId" element={<UserProfile />} />
      <Route path="/work/calendar" element={<WorkCalendar />} />
      <Route path="/work/meetings" element={<WorkMeetings />} />
      <Route path="/resource-hub" element={<ResourceHubDashboard />} />
      <Route path="/resource-hub/templates" element={<ResourceCategoryPage categoryId="templates" />} />
      <Route path="/resource-hub/checklists" element={<ResourceCategoryPage categoryId="checklists" />} />
      <Route path="/resource-hub/registers-forms" element={<ResourceCategoryPage categoryId="registers-forms" />} />
      <Route path="/resource-hub/audit-evidence" element={<ResourceCategoryPage categoryId="audit-evidence" />} />
      <Route path="/resource-hub/training-webinars" element={<ResourceCategoryPage categoryId="training-webinars" />} />
      <Route path="/resource-hub/guides-howto" element={<ResourceCategoryPage categoryId="guides-howto" />} />
      <Route path="/resource-hub/ci-tools" element={<ResourceCategoryPage categoryId="ci-tools" />} />
      <Route path="/resource-hub/workbooks" element={<ResourceCategoryPage categoryId="workbooks" />} />
      <Route path="/resource-hub/recently-added" element={<ResourceRecentlyAdded />} />
      <Route path="/resource-hub/most-used" element={<ResourceMostUsed />} />
      <Route path="/resource-hub/favourites" element={<ResourceFavourites />} />
      <Route path="/resource-hub/updates" element={<ResourceUpdatesLog />} />
    </Route>
    <Route element={<ProtectedRoute allowVivacityTeam><DashboardLayoutRoute /></ProtectedRoute>}>
      <Route path="/administration/contacts" element={<ContactDirectory />} />
      <Route path="/admin/regulator-watch" element={<RegulatorWatchDashboard />} />
      <Route path="/admin/regulator-watch/:eventId" element={<RegulatorChangeEventDetail />} />
    </Route>
  </>
);
