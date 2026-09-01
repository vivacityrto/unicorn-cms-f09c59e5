import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const ClientLayoutRoute = lazy(() => import("@/components/layout/ClientLayoutRoute"));

const ClientHomePage = lazy(() =>
  import("@/components/client/ClientHomePage").then((m) => ({ default: m.ClientHomePage })),
);
const ClientInboxPage = lazy(() => import("@/pages/ClientInboxPage"));
const ClientTasksPage = lazy(() => import("@/pages/ClientTasksPage"));
const ClientPackagesPage = lazy(() => import("@/components/client/ClientPackagesPage"));
const ClientGovernanceDocumentsPage = lazy(() =>
  import("@/components/client/ClientGovernanceDocumentsPage").then((m) => ({
    default: m.ClientGovernanceDocumentsPage,
  })),
);
const ClientResourceHubPage = lazy(() => import("@/pages/client/ClientResourceHubPage"));
const ClientCalendar = lazy(() => import("@/pages/ClientCalendar"));
const ClientUsersPage = lazy(() => import("@/components/client/ClientUsersPage"));
const StaffPdpsPage = lazy(() => import("@/pages/client/StaffPdpsPage"));
const AcademyActivityPage = lazy(() => import("@/pages/client/AcademyActivityPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsWrapper"));
const ClientProfilePage = lazy(() => import("@/pages/client/ClientProfilePage"));
const ClientTgaDetailsPage = lazy(() => import("@/pages/client/ClientTgaDetailsPage"));
const ClientFilesPage = lazy(() => import("@/pages/client/ClientFilesPage"));
const MembershipCertificatePage = lazy(() =>
  import("@/pages/client/MembershipCertificatePage").then((m) => ({
    default: m.MembershipCertificatePage,
  })),
);
const SupportTicketsPortalPage = lazy(() => import("@/pages/client/SupportTicketsPortalPage"));
const SupportTicketPortalDetailPage = lazy(() => import("@/pages/client/SupportTicketPortalDetailPage"));
const ClientReportsPage = lazy(() => import("@/pages/client/ClientReportsPage"));
const RegulatoryUpdatesPage = lazy(() => import("@/pages/client/RegulatoryUpdatesPage"));
const RegulatoryUpdateDetailPage = lazy(() => import("@/pages/client/RegulatoryUpdateDetailPage"));

/**
 * Client Portal pages that previously each used a dedicated *Wrapper.tsx
 * file to mount ClientLayout individually. Converted to a nested layout
 * route so ClientLayout mounts once per client-portal visit instead of
 * remounting on every click between these pages
 * (docs/kb/reference/codebase-optimization-plan-2026-08-28.md, P1.3). See
 * AGENTS.md -> "Client Portal / Academy route composition" for the
 * standing convention this establishes for any new page under /client/*
 * or /academy/*.
 *
 * Deliberate behavior change, confirmed with Carl: sidebar-open state, the
 * Ask Viv chat panel's open/closed state, and the live
 * client-inbox-notifier realtime channel now all persist across navigation
 * among these routes, instead of resetting/reconnecting on every page
 * change. This also fixes a real (if minor) pre-existing bug:
 * usePageViewTracking's own per-page-duration tracking only works
 * correctly when the component doesn't remount between page views --
 * previously it always did, so "previous page duration" was always null in
 * practice.
 *
 * Every child here is deliberately lazy-loaded, regardless of whether the
 * page it replaces was imported eagerly or lazily inside its retired
 * Wrapper file: the Wrapper's own outer lazy-loadedness (in App.tsx) was
 * what kept an eagerly-imported inner page out of the main bundle before.
 * Since this route module is itself a static top-level import in App.tsx
 * (like ClientLayoutRoute below), each child now needs its own lazy
 * boundary to preserve that "not loaded until visited" property.
 *
 * ClientReportsPage, RegulatoryUpdatesPage, and RegulatoryUpdateDetailPage
 * were initially left out of this conversion (their retired *Wrapper.tsx
 * files had real data-fetching/rendering logic directly inside them,
 * rather than the mechanical <ClientLayout><Suspense><Page/></Suspense>
 * </ClientLayout> pattern the others used) -- Carl caught the resulting
 * layout-persistence inconsistency by hand-testing this PR's dev preview
 * (collapsing the sidebar and opening Ask Viv, then noticing both reset on
 * Regulatory Updates specifically) and asked for full consistency, so they
 * were unwrapped and folded in too: same content, same component, just
 * with the outer <ClientLayout> tags removed and the file renamed to drop
 * "Wrapper" (it no longer wraps anything).
 */
export const clientLayoutRoutes = (
  <Route path="/client" element={<ProtectedRoute><ClientLayoutRoute /></ProtectedRoute>}>
    <Route path="home" element={<ClientHomePage />} />
    <Route path="inbox" element={<ClientInboxPage />} />
    <Route path="tasks" element={<ClientTasksPage />} />
    <Route path="packages" element={<ClientPackagesPage />} />
    <Route path="governance-documents" element={<ClientGovernanceDocumentsPage />} />
    <Route path="resource-hub" element={<ClientResourceHubPage />} />
    <Route path="resource-hub/:categoryId" element={<ClientResourceHubPage />} />
    <Route path="calendar" element={<ClientCalendar />} />
    <Route path="users" element={<ClientUsersPage />} />
    <Route path="staff-pdps" element={<StaffPdpsPage />} />
    <Route path="academy-activity" element={<AcademyActivityPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="profile" element={<ClientProfilePage />} />
    <Route path="tga" element={<ClientTgaDetailsPage />} />
    <Route path="files" element={<ClientFilesPage />} />
    <Route path="certificate" element={<MembershipCertificatePage />} />
    <Route path="support-tickets" element={<SupportTicketsPortalPage />} />
    <Route path="support-tickets/:id" element={<SupportTicketPortalDetailPage />} />
    <Route path="reports" element={<ClientReportsPage />} />
    <Route path="regulatory-updates" element={<RegulatoryUpdatesPage />} />
    <Route path="regulatory-updates/:eventId" element={<RegulatoryUpdateDetailPage />} />
  </Route>
);
