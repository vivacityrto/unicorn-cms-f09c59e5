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
 * silently dropping a sibling.
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
    </Route>
  </>
);
