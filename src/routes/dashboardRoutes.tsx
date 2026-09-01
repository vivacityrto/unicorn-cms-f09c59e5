import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const DashboardLayoutRoute = lazy(() => import("@/components/layout/DashboardLayoutRoute"));

const AdminManageStages = lazy(() => import("@/pages/AdminManageStages"));
const AdminStageDetail = lazy(() => import("@/pages/AdminStageDetail"));
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
 * specifically, stricter than every other route in this family. Rather
 * than lifting that onto the shared parent guard (which would wrongly
 * gate every other staff page behind SuperAdmin), they keep their own
 * additional <ProtectedRoute requireSuperAdmin> layered inside the shared
 * parent's plain <ProtectedRoute> -- same combined effect as today's single
 * requireSuperAdmin prop, since the parent guard was already a strict
 * subset of what these two additionally require.
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
 */
export const dashboardLayoutRoutes = (
  <Route element={<ProtectedRoute><DashboardLayoutRoute /></ProtectedRoute>}>
    <Route path="/admin/stages" element={<ProtectedRoute requireSuperAdmin><AdminManageStages /></ProtectedRoute>} />
    <Route path="/admin/stages/:stage_id" element={<ProtectedRoute requireSuperAdmin><AdminStageDetail /></ProtectedRoute>} />
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
);
