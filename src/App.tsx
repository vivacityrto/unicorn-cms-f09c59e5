import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ViewModeProvider } from "./contexts/ViewModeContext";
import { FacilitatorModeProvider } from "./contexts/FacilitatorModeContext";
import { TenantTypeProvider } from "./contexts/TenantTypeContext";
import { ClientPreviewProvider } from "./contexts/ClientPreviewContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LazyLoadFallback } from "./components/LazyLoadFallback";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { startVersionChecking, stopVersionChecking } from "./utils/versionCheck";
import { DevDiagnosticsPanel } from "./components/DevDiagnosticsPanel";

 // Lazy load all page components for code splitting
 const Index = lazy(() => import("./pages/Index"));
 const Login = lazy(() => import("./pages/Login"));
 const Dashboard = lazy(() => import("./pages/Dashboard"));
 const ManageUsersWrapper = lazy(() => import("./pages/ManageUsersWrapper"));
 const ManageInvitesWrapper = lazy(() => import("./pages/ManageInvitesWrapper"));
 const ManageTenantsWrapper = lazy(() => import("./pages/ManageTenantsWrapper"));
 const ManageDocumentsWrapper = lazy(() => import("./pages/ManageDocumentsWrapper"));
 const ManageCategoriesWrapper = lazy(() => import("./pages/ManageCategoriesWrapper"));
 const ManageStagesWrapper = lazy(() => import("./pages/ManageStagesWrapper"));
 const ManageFieldsWrapper = lazy(() => import("./pages/ManageFieldsWrapper"));
 const UserProfileWrapper = lazy(() => import("./pages/UserProfileWrapper"));
 // TenantDetailWrapper removed — consolidated into ClientDetailWrapper
 const TenantLoginsWrapper = lazy(() => import("./pages/TenantLoginsWrapper"));
 const TenantMembersWrapper = lazy(() => import("./pages/TenantMembersWrapper"));
 const TenantDocumentsWrapper = lazy(() => import("./pages/TenantDocumentsWrapper"));
 const TenantDocumentsHubWrapper = lazy(() => import("./pages/TenantDocumentsHubWrapper"));
 const TenantDocumentDetailWrapper = lazy(() => import("./pages/TenantDocumentDetailWrapper"));
 const TenantNotesWrapper = lazy(() => import("./pages/TenantNotesWrapper"));
 const ClientPortalDocumentsWrapper = lazy(() => import("./pages/ClientPortalDocumentsWrapper"));
 const ManagePackagesWrapper = lazy(() => import("./pages/ManagePackagesWrapper"));
 const PackageDetail = lazy(() => import("./pages/PackageDetail"));
 const AdminPackageDetailWrapper = lazy(() => import("./pages/AdminPackageDetailWrapper"));
 const AdminPackageTenantDetailWrapper = lazy(() => import("./pages/AdminPackageTenantDetailWrapper"));
 const PackageBuilder = lazy(() => import("./pages/PackageBuilder"));
 const PackageBuilderDetail = lazy(() => import("./pages/PackageBuilderDetail"));
 const ManageEmailTemplatesWrapper = lazy(() => import("./pages/ManageEmailTemplatesWrapper"));
 const DocumentDetailWrapper = lazy(() => import("./pages/DocumentDetailWrapper"));
 const TeamSettingsWrapper = lazy(() => import("./pages/TeamSettingsWrapper"));
 const SettingsWrapper = lazy(() => import("./pages/SettingsWrapper"));
 const CalendarWrapper = lazy(() => import("./pages/CalendarWrapper"));
 const AcceptInvitationWrapper = lazy(() => import("./pages/AcceptInvitationWrapper"));
 const NotFound = lazy(() => import("./pages/NotFound"));
 const EosOverview = lazy(() => import("./pages/EosOverview"));
 const EosRocks = lazy(() => import("./pages/EosRocks"));
 const EosIssues = lazy(() => import("./pages/EosIssues"));
 const EosTodos = lazy(() => import("./pages/EosTodos"));
 const EosMeetings = lazy(() => import("./pages/EosMeetings"));
 const EosScorecard = lazy(() => import("./pages/EosScorecard"));
 const EosVto = lazy(() => import("./pages/EosVto"));
 const EosMeetingSummary = lazy(() => import("./pages/EosMeetingSummary"));
 const LiveMeetingView = lazy(() => import("./components/eos/LiveMeetingView").then(m => ({ default: m.LiveMeetingView })));
 const ClientEosOverview = lazy(() => import("./pages/ClientEosOverview"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const IntegrationSettings = lazy(() => import("./pages/IntegrationSettings"));
const AddinSettings = lazy(() => import("./pages/admin/AddinSettings"));
const AddinDiagnostics = lazy(() => import("./pages/admin/AddinDiagnostics"));
const AddinShell = lazy(() => import("./pages/addin/AddinShell"));
const TeamsShell = lazy(() => import("./pages/teams/TeamsShell"));
const EosCalendar = lazy(() => import("./pages/EosCalendar"));
 const EosQC = lazy(() => import("./pages/EosQC"));
 const EosQCSession = lazy(() => import("./pages/EosQCSession"));
 const EosFlightPlan = lazy(() => import("./pages/EosFlightPlan"));
 const EosRisksOpportunities = lazy(() => import("./pages/EosRisksOpportunities"));
 const EosAccountabilityChart = lazy(() => import("./pages/EosAccountabilityChart"));
 const EosOnboarding = lazy(() => import("./pages/EosOnboarding"));
 const EosHealth = lazy(() => import("./pages/EosHealth"));
 const EosPeopleAnalyzer = lazy(() => import("./pages/EosPeopleAnalyzer"));
 const EosGWCTrends = lazy(() => import("./pages/EosGWCTrends"));
 const EosClientImpact = lazy(() => import("./pages/EosClientImpact"));
 const EosClientImpactDetail = lazy(() => import("./pages/EosClientImpactDetail"));
 const ClientImpactPage = lazy(() => import("./pages/ClientImpactPage"));
 const EosRockAnalysis = lazy(() => import("./pages/EosRockAnalysis"));
 const EosLeadershipDashboard = lazy(() => import("./pages/EosLeadershipDashboard"));
 const ResetPassword = lazy(() => import("./pages/ResetPassword"));
 const Audits = lazy(() => import("./pages/Audits"));
 const AuditWorkspace = lazy(() => import("./pages/AuditWorkspace"));
 const AuditFindings = lazy(() => import("./pages/AuditFindings"));
 const AuditActions = lazy(() => import("./pages/AuditActions"));
 const AuditReport = lazy(() => import("./pages/AuditReport"));
 const AuditTemplateBuilder = lazy(() => import("./pages/AuditTemplateBuilder"));
 const TasksManagementWrapper = lazy(() => import("./pages/TasksManagementWrapper"));
 const RtoTipsWrapper = lazy(() => import("./pages/RtoTipsWrapper"));
 const ResourceHubDashboard = lazy(() => import("./pages/ResourceHubDashboard"));
 const ResourceCategoryPage = lazy(() => import("./pages/ResourceCategoryPage"));
 const ResourceRecentlyAdded = lazy(() => import("./pages/ResourceRecentlyAdded"));
 const ResourceMostUsed = lazy(() => import("./pages/ResourceMostUsed"));
 const ResourceFavourites = lazy(() => import("./pages/ResourceFavourites"));
 const ResourceUpdatesLog = lazy(() => import("./pages/ResourceUpdatesLog"));
 const MembershipDashboardWrapper = lazy(() => import("./pages/MembershipDashboardWrapper"));
 const ClientDetailWrapper = lazy(() => import("./pages/ClientDetailWrapper"));
 const AdminTgaIntegrationWrapper = lazy(() => import("./pages/AdminTgaIntegrationWrapper"));
 const AdminUserAudit = lazy(() => import("./pages/AdminUserAudit"));
 const TeamUsers = lazy(() => import("./pages/TeamUsers"));
 const TenantUsers = lazy(() => import("./pages/TenantUsers"));
 const ClientPackageDetailWrapper = lazy(() => import("./pages/ClientPackageDetailWrapper"));
 const AdminManageStagesWrapper = lazy(() => import("./pages/AdminManageStagesWrapper"));
 const AdminStageDetailWrapper = lazy(() => import("./pages/AdminStageDetailWrapper"));
 const StageBuilder = lazy(() => import("./pages/StageBuilder"));
const AdminStageAnalytics = lazy(() => import("./pages/AdminStageAnalytics"));
const AdminOperations = lazy(() => import("./pages/AdminOperations"));
 const AdminCompliancePacks = lazy(() => import("./pages/AdminCompliancePacks"));
 const AdminReviews = lazy(() => import("./pages/AdminReviews"));
 const MyWork = lazy(() => import("./pages/MyWork"));
 const CalendarTimeCapture = lazy(() => import("./pages/CalendarTimeCapture"));
 const OutlookCallback = lazy(() => import("./pages/OutlookCallback"));
const TimeInbox = lazy(() => import("./pages/TimeInbox"));
const WorkCalendarWrapper = lazy(() => import("./pages/WorkCalendarWrapper"));
const WorkMeetings = lazy(() => import("./pages/WorkMeetingsWrapper"));
const ProcessesWrapper = lazy(() => import("./pages/ProcessesWrapper"));
const ProcessDetail = lazy(() => import("./pages/ProcessDetail"));
const ProcessForm = lazy(() => import("./pages/ProcessForm"));
const RoleReference = lazy(() => import("./pages/RoleReference"));
const AdminAssistant = lazy(() => import("./pages/AdminAssistant"));
const AdminKnowledgeLibrary = lazy(() => import("./pages/AdminKnowledgeLibrary"));
const AdminEOSProcesses = lazy(() => import("./pages/AdminEOSProcesses"));
const EosHealthCheck = lazy(() => import("./pages/EosHealthCheck"));
const QAResponsiveHarness = lazy(() => import("./pages/admin/QAResponsiveHarness"));
const QASmokeTest = lazy(() => import("./pages/admin/QASmokeTest"));
const AskVivFlags = lazy(() => import("./pages/internal/AskVivFlags"));

// Academy pages (placeholder)
const AcademyDashboard = lazy(() => import("./pages/academy/AcademyDashboard"));
const AcademyCourses = lazy(() => import("./pages/academy/AcademyCourses"));
const AcademyCertificates = lazy(() => import("./pages/academy/AcademyCertificates"));
const AcademyEvents = lazy(() => import("./pages/academy/AcademyEvents"));
const AcademyCommunity = lazy(() => import("./pages/academy/AcademyCommunity"));
const AcademyTeam = lazy(() => import("./pages/academy/AcademyTeam"));
const AcademySettings = lazy(() => import("./pages/academy/AcademySettings"));

// Client Preview pages
const ClientPreview = lazy(() => import("./pages/ClientPreview"));
const ClientPreviewAcademy = lazy(() => import("./pages/ClientPreviewAcademy"));
const ClientCalendarWrapperLegacy = lazy(() => import("./pages/ClientCalendarWrapper"));
const ClientNotificationsWrapperLegacy = lazy(() => import("./pages/ClientNotificationsWrapper"));

// Client Portal pages (isolated layout)
const ClientHomeWrapperNew = lazy(() => import("./pages/client/ClientHomeWrapper"));
const ClientDocumentsWrapperNew = lazy(() => import("./pages/client/ClientDocumentsWrapper"));
const ClientResourceHubWrapperNew = lazy(() => import("./pages/client/ClientResourceHubWrapper"));
const ClientCalendarWrapperNew = lazy(() => import("./pages/client/ClientCalendarWrapper"));
const ClientNotificationsWrapperNew = lazy(() => import("./pages/client/ClientNotificationsWrapper"));
const ClientReportsWrapperNew = lazy(() => import("./pages/client/ClientReportsWrapper"));
const ClientUsersWrapperNew = lazy(() => import("./pages/client/ClientUsersWrapper"));
const ClientSettingsWrapperNew = lazy(() => import("./pages/client/ClientSettingsWrapper"));
const ClientTeamWrapperNew = lazy(() => import("./pages/client/ClientTeamWrapper"));
const ClientProfileWrapperNew = lazy(() => import("./pages/client/ClientProfileWrapper"));
const ClientTgaDetailsWrapperNew = lazy(() => import("./pages/client/ClientTgaDetailsWrapper"));
const ClientFilesWrapperNew = lazy(() => import("./pages/client/ClientFilesWrapper"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes — data is fresh for this window
      refetchOnWindowFocus: true, // Re-fetch when user tabs back
      retry: 1,
    },
  },
});

/**
 * Root wrapper that starts the build-version auto-reload checker.
 */
function VersionGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    startVersionChecking();
    return () => stopVersionChecking();
  }, []);
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
  <VersionGuard>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <TenantTypeProvider>
            <ClientPreviewProvider>
            <ViewModeProvider>
            <FacilitatorModeProvider>
             <Suspense fallback={<LazyLoadFallback />}>
           <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invitation" element={<AcceptInvitationWrapper />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/documents" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/reports" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/time-inbox" 
              element={
                <ProtectedRoute>
                  <TimeInbox />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/calendar" 
              element={
                <ProtectedRoute>
                  <CalendarWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/work/calendar" 
              element={
                <ProtectedRoute>
                  <WorkCalendarWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/work/meetings" 
              element={
                <ProtectedRoute>
                  <WorkMeetings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar/time-capture" 
              element={
                <ProtectedRoute>
                  <CalendarTimeCapture />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/calendar/outlook-callback" 
              element={<OutlookCallback />} 
            />
            <Route 
              path="/messages" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <SettingsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-users" 
              element={
                <ProtectedRoute>
                  <ManageUsersWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-invites" 
              element={
                <ProtectedRoute>
                  <ManageInvitesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-tenants" 
              element={
                <ProtectedRoute>
                  <ManageTenantsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-documents" 
              element={
                <ProtectedRoute>
                  <ManageDocumentsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-categories"
              element={
                <ProtectedRoute>
                  <ManageCategoriesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/email-templates"
              element={
                <ProtectedRoute>
                  <ManageEmailTemplatesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/manage-stages"
              element={
                <ProtectedRoute>
                  <ManageStagesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-fields" 
              element={
                <ProtectedRoute>
                  <ManageFieldsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/document/:id" 
              element={
                <ProtectedRoute>
                  <DocumentDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/user-profile/:userId"
              element={
                <ProtectedRoute>
                  <UserProfileWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId" 
              element={
                <ProtectedRoute>
                  <ClientDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId/logins" 
              element={
                <ProtectedRoute>
                  <TenantLoginsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId/members" 
              element={
                <ProtectedRoute>
                  <TenantMembersWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId/documents" 
              element={
                <ProtectedRoute>
                  <TenantDocumentsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId/documents-hub" 
              element={
                <ProtectedRoute>
                  <TenantDocumentsHubWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId/document/:documentId" 
              element={
                <ProtectedRoute>
                  <TenantDocumentDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/client-portal/:tenantId/documents" 
              element={
                <ProtectedRoute>
                  <ClientPortalDocumentsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:tenantId/notes" 
              element={
                <ProtectedRoute>
                  <TenantNotesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant-detail/:tenantId"
              element={
                <ProtectedRoute>
                  <ClientDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manage-packages" 
              element={
                <ProtectedRoute>
                  <ManagePackagesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/client-packages/:clientPackageId" 
              element={
                <ProtectedRoute>
                  <ClientPackageDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/my-work" 
              element={
                <ProtectedRoute>
                  <MyWork />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/tasks" 
              element={
                <ProtectedRoute>
                  <TasksManagementWrapper />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/tenant/:tenantId/tasks" 
              element={
                <ProtectedRoute>
                  <TasksManagementWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/rto-tips" 
              element={
                <ProtectedRoute>
                  <RtoTipsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/package/:id"
              element={
                <ProtectedRoute>
                  <PackageDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/manage-packages"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <PackageBuilder />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/package-builder/:id"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <PackageBuilderDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/package/:id"
              element={
                <ProtectedRoute>
                  <AdminPackageDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/package/:id/tenant/:tenantId/instance/:instanceId"
              element={
                <ProtectedRoute>
                  <AdminPackageTenantDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/package/:id/tenant/:tenantId"
              element={
                <ProtectedRoute>
                  <AdminPackageTenantDetailWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/email-templates"
              element={
                <ProtectedRoute>
                  <ManageEmailTemplatesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/team-settings" 
              element={
                <ProtectedRoute>
                  <TeamSettingsWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos" 
              element={
                <ProtectedRoute>
                  <EosOverview />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/onboarding" 
              element={
                <ProtectedRoute>
                  <EosOnboarding />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/health" 
              element={
                <ProtectedRoute>
                  <EosHealth />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/rocks" 
              element={
                <ProtectedRoute>
                  <EosRocks />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/flight-plan" 
              element={
                <ProtectedRoute>
                  <EosFlightPlan />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/risks-opportunities" 
              element={
                <ProtectedRoute>
                  <EosRisksOpportunities />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/issues" 
              element={
                <Navigate to="/eos/risks-opportunities" replace />
              } 
            />
            <Route 
              path="/eos/todos" 
              element={
                <ProtectedRoute>
                  <EosTodos />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/meetings" 
              element={
                <ProtectedRoute>
                  <EosMeetings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/meetings/:meetingId/summary" 
              element={
                <ProtectedRoute>
                  <EosMeetingSummary />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/meetings/:meetingId/live"
              element={
                <ProtectedRoute>
                  <LiveMeetingView />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/scorecard" 
              element={
                <ProtectedRoute>
                  <EosScorecard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/vto" 
              element={
                <ProtectedRoute>
                  <EosVto />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/calendar" 
              element={
                <ProtectedRoute>
                  <EosCalendar />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/qc" 
              element={
                <ProtectedRoute>
                  <EosQC />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/qc/:id" 
              element={
                <ProtectedRoute>
                  <EosQCSession />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/client/eos"
              element={
                <ProtectedRoute>
                  <ClientEosOverview />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/accountability" 
              element={
                <ProtectedRoute>
                  <EosAccountabilityChart />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/people-analyzer" 
              element={
                <ProtectedRoute>
                  <EosPeopleAnalyzer />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/gwc-trends" 
              element={
                <ProtectedRoute>
                  <EosGWCTrends />
                </ProtectedRoute>
              } 
            />
            {/* Client Impact Reporting Routes */}
            <Route 
              path="/eos/client-impact" 
              element={
                <ProtectedRoute>
                  <EosClientImpact />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/client-impact/:reportId" 
              element={
                <ProtectedRoute>
                  <EosClientImpactDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tenant/:clientId/impact" 
              element={
                <ProtectedRoute>
                  <ClientImpactPage />
                </ProtectedRoute>
              } 
            />
            {/* Rock Analysis Route */}
            <Route 
              path="/eos/rock-analysis" 
              element={
                <ProtectedRoute>
                  <EosRockAnalysis />
                </ProtectedRoute>
              } 
            />
            {/* Leadership Dashboard Route */}
            <Route 
              path="/eos/leadership" 
              element={
                <ProtectedRoute>
                  <EosLeadershipDashboard />
                </ProtectedRoute>
              } 
            />
            {/* EOS Health Check Route */}
            <Route 
              path="/eos/health-check" 
              element={
                <ProtectedRoute>
                  <EosHealthCheck />
                </ProtectedRoute>
              } 
            />
            {/* Process Management Routes */}
            <Route 
              path="/processes" 
              element={
                <ProtectedRoute>
                  <ProcessesWrapper />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/processes/new" 
              element={
                <ProtectedRoute>
                  <ProcessForm />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/processes/:id" 
              element={
                <ProtectedRoute>
                  <ProcessDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/processes/:id/edit" 
              element={
                <ProtectedRoute>
                  <ProcessForm />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Navigate to="/settings?tab=profile" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/calendar"
              element={
                <ProtectedRoute>
                  <Navigate to="/settings?tab=calendar" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/notifications" 
              element={
                <ProtectedRoute>
                  <NotificationSettings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings/integrations"
              element={
                <ProtectedRoute>
                  <IntegrationSettings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings/roles" 
              element={
                <ProtectedRoute>
                  <RoleReference />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/audits" 
              element={
                <ProtectedRoute>
                  <Audits />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/audits/create-template" 
              element={
                <ProtectedRoute>
                  <AuditTemplateBuilder />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/audits/create-template/:templateId" 
              element={
                <ProtectedRoute>
                  <AuditTemplateBuilder />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/audits/:id" 
              element={
                <ProtectedRoute>
                  <AuditWorkspace />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/audits/:id/findings" 
              element={
                <ProtectedRoute>
                  <AuditFindings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/audits/:id/actions" 
              element={
                <ProtectedRoute>
                  <AuditActions />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/audits/:id/report" 
              element={
                <ProtectedRoute>
                  <AuditReport />
                </ProtectedRoute>
              } 
            />
            {/* Resource Hub Routes */}
            <Route path="/resource-hub" element={<ProtectedRoute><ResourceHubDashboard /></ProtectedRoute>} />
            <Route path="/resource-hub/templates" element={<ProtectedRoute><ResourceCategoryPage categoryId="templates" /></ProtectedRoute>} />
            <Route path="/resource-hub/checklists" element={<ProtectedRoute><ResourceCategoryPage categoryId="checklists" /></ProtectedRoute>} />
            <Route path="/resource-hub/registers-forms" element={<ProtectedRoute><ResourceCategoryPage categoryId="registers-forms" /></ProtectedRoute>} />
            <Route path="/resource-hub/audit-evidence" element={<ProtectedRoute><ResourceCategoryPage categoryId="audit-evidence" /></ProtectedRoute>} />
            <Route path="/resource-hub/training-webinars" element={<ProtectedRoute><ResourceCategoryPage categoryId="training-webinars" /></ProtectedRoute>} />
            <Route path="/resource-hub/guides-howto" element={<ProtectedRoute><ResourceCategoryPage categoryId="guides-howto" /></ProtectedRoute>} />
            <Route path="/resource-hub/ci-tools" element={<ProtectedRoute><ResourceCategoryPage categoryId="ci-tools" /></ProtectedRoute>} />
            <Route path="/resource-hub/recently-added" element={<ProtectedRoute><ResourceRecentlyAdded /></ProtectedRoute>} />
            <Route path="/resource-hub/most-used" element={<ProtectedRoute><ResourceMostUsed /></ProtectedRoute>} />
            <Route path="/resource-hub/favourites" element={<ProtectedRoute><ResourceFavourites /></ProtectedRoute>} />
            <Route path="/resource-hub/updates" element={<ProtectedRoute><ResourceUpdatesLog /></ProtectedRoute>} />
            {/* Membership Dashboard */}
            <Route path="/membership-dashboard" element={<ProtectedRoute><MembershipDashboardWrapper /></ProtectedRoute>} />
            {/* Client Detail route removed — consolidated into /tenant/:tenantId above */}
            {/* Admin Integrations */}
            <Route path="/admin/integrations/tga" element={<ProtectedRoute><AdminTgaIntegrationWrapper /></ProtectedRoute>} />
            {/* Admin User Audit */}
            <Route path="/admin/user-audit" element={<ProtectedRoute><AdminUserAudit /></ProtectedRoute>} />
            {/* Team & Tenant Users */}
            <Route path="/admin/team-users" element={<ProtectedRoute><TeamUsers /></ProtectedRoute>} />
            <Route path="/admin/tenant-users" element={<ProtectedRoute><TenantUsers /></ProtectedRoute>} />
            {/* Admin Stages */}
            <Route path="/admin/stages" element={<ProtectedRoute requireSuperAdmin><AdminManageStagesWrapper /></ProtectedRoute>} />
            <Route path="/admin/stages/:stage_id" element={<ProtectedRoute requireSuperAdmin><AdminStageDetailWrapper /></ProtectedRoute>} />
            <Route path="/admin/stage-builder" element={<ProtectedRoute requireSuperAdmin><StageBuilder /></ProtectedRoute>} />
            <Route path="/admin/stage-analytics" element={<ProtectedRoute requireSuperAdmin><AdminStageAnalytics /></ProtectedRoute>} />
            <Route path="/admin/operations" element={<ProtectedRoute requireSuperAdmin><AdminOperations /></ProtectedRoute>} />
            <Route path="/admin/compliance-packs" element={<ProtectedRoute requireSuperAdmin><AdminCompliancePacks /></ProtectedRoute>} />
            <Route path="/admin/reviews" element={<ProtectedRoute><AdminReviews /></ProtectedRoute>} />
            {/* AI Assistant - SuperAdmin only */}
            <Route path="/admin/assistant" element={<ProtectedRoute requireSuperAdmin><AdminAssistant /></ProtectedRoute>} />
           <Route path="/admin/knowledge" element={<ProtectedRoute requireSuperAdmin><AdminKnowledgeLibrary /></ProtectedRoute>} />
           <Route path="/admin/eos-processes" element={<ProtectedRoute requireSuperAdmin><AdminEOSProcesses /></ProtectedRoute>} />
            {/* QA Responsive Harness - SuperAdmin/VivacityTeam only */}
            <Route path="/admin/qa/responsive" element={<ProtectedRoute requireSuperAdmin><QAResponsiveHarness /></ProtectedRoute>} />
            {/* QA Smoke Test - SuperAdmin/VivacityTeam only */}
            <Route path="/admin/qa/smoke" element={<ProtectedRoute requireSuperAdmin><QASmokeTest /></ProtectedRoute>} />
            {/* Add-in Settings - SuperAdmin only */}
            <Route path="/admin/addin-settings" element={<ProtectedRoute requireSuperAdmin><AddinSettings /></ProtectedRoute>} />
            <Route path="/admin/addin-diagnostics" element={<ProtectedRoute requireSuperAdmin><AddinDiagnostics /></ProtectedRoute>} />
            {/* Internal Ask Viv Flags - Vivacity Team only */}
            <Route path="/internal/ask-viv/flags" element={<ProtectedRoute requireSuperAdmin><AskVivFlags /></ProtectedRoute>} />
            {/* Academy Routes */}
            <Route path="/academy" element={<ProtectedRoute><AcademyDashboard /></ProtectedRoute>} />
            <Route path="/academy/courses" element={<ProtectedRoute><AcademyCourses /></ProtectedRoute>} />
            <Route path="/academy/certificates" element={<ProtectedRoute><AcademyCertificates /></ProtectedRoute>} />
            <Route path="/academy/events" element={<ProtectedRoute><AcademyEvents /></ProtectedRoute>} />
            <Route path="/academy/community" element={<ProtectedRoute><AcademyCommunity /></ProtectedRoute>} />
            <Route path="/academy/team" element={<ProtectedRoute><AcademyTeam /></ProtectedRoute>} />
            <Route path="/academy/settings" element={<ProtectedRoute><AcademySettings /></ProtectedRoute>} />
            {/* Client Preview Routes */}
            <Route path="/client-preview" element={<ProtectedRoute><ClientPreview /></ProtectedRoute>} />
            <Route path="/client-preview/academy" element={<ProtectedRoute><ClientPreviewAcademy /></ProtectedRoute>} />
            {/* Client Portal Routes (isolated ClientLayout) */}
            <Route path="/client/home" element={<ProtectedRoute><ClientHomeWrapperNew /></ProtectedRoute>} />
            <Route path="/client/documents" element={<ProtectedRoute><ClientDocumentsWrapperNew /></ProtectedRoute>} />
            <Route path="/client/resource-hub" element={<ProtectedRoute><ClientResourceHubWrapperNew /></ProtectedRoute>} />
            <Route path="/client/resource-hub/:categoryId" element={<ProtectedRoute><ClientResourceHubWrapperNew /></ProtectedRoute>} />
            <Route path="/client/calendar" element={<ProtectedRoute><ClientCalendarWrapperNew /></ProtectedRoute>} />
            <Route path="/client/notifications" element={<ProtectedRoute><ClientNotificationsWrapperNew /></ProtectedRoute>} />
            <Route path="/client/reports" element={<ProtectedRoute><ClientReportsWrapperNew /></ProtectedRoute>} />
            <Route path="/client/users" element={<ProtectedRoute><ClientUsersWrapperNew /></ProtectedRoute>} />
            <Route path="/client/team" element={<ProtectedRoute><ClientTeamWrapperNew /></ProtectedRoute>} />
            <Route path="/client/settings" element={<ProtectedRoute><ClientSettingsWrapperNew /></ProtectedRoute>} />
            <Route path="/client/profile" element={<ProtectedRoute><ClientProfileWrapperNew /></ProtectedRoute>} />
            <Route path="/client/tga" element={<ProtectedRoute><ClientTgaDetailsWrapperNew /></ProtectedRoute>} />
            <Route path="/client/files" element={<ProtectedRoute><ClientFilesWrapperNew /></ProtectedRoute>} />
            
            {/* Add-in Shell Route - works without full auth for add-in JWT holders */}
            <Route path="/addin" element={<AddinShell />} />
            
            {/* Teams Shell Route - embedded as Teams tab, supports ?mode=meeting */}
            <Route path="/teams" element={<TeamsShell />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
             </Suspense>
            </FacilitatorModeProvider>
            </ViewModeProvider>
            </ClientPreviewProvider>
            </TenantTypeProvider>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    <DevDiagnosticsPanel />
  </VersionGuard>
  </QueryClientProvider>
);

export default App;
