import { lazy, Suspense, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RouteMeta } from "@/components/seo/RouteMeta";
import { AuthProvider } from "./hooks/useAuth";
import { ViewModeProvider } from "./contexts/ViewModeContext";

import { TenantTypeProvider } from "./contexts/TenantTypeContext";
import { PageTitleProvider } from "./contexts/PageTitleContext";
import { ClientPreviewProvider } from "./contexts/ClientPreviewContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LazyLoadFallback } from "./components/LazyLoadFallback";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { startVersionChecking, stopVersionChecking } from "./utils/versionCheck";
import { DevDiagnosticsPanel } from "./components/DevDiagnosticsPanel";
import { CelebrationProvider } from "./components/ui/celebration";
import { supportTicketsRoutes } from "./routes/supportTicketsRoutes";
import { academyLayoutRoutes } from "./routes/academyRoutes";
import { clientLayoutRoutes } from "./routes/clientRoutes";
import { dashboardLayoutRoutes } from "./routes/dashboardRoutes";

 // Lazy load all page components for code splitting
 const Index = lazy(() => import("./pages/Index"));
 const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MainDashboard = lazy(() => import("./pages/MainDashboard"));

 // TenantDetailWrapper removed — consolidated into ClientDetailWrapper
 const TenantDocumentDetailWrapper = lazy(() => import("./pages/TenantDocumentDetailWrapper"));

 const AcceptInvitationWrapper = lazy(() => import("./pages/AcceptInvitationWrapper"));
 const NotFound = lazy(() => import("./pages/NotFound"));
 const EosIssues = lazy(() => import("./pages/EosIssues"));
 const LiveMeetingView = lazy(() => import("./components/eos/LiveMeetingView").then(m => ({ default: m.LiveMeetingView })));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const PostSignInRedirect = lazy(() => import("./pages/PostSignInRedirect"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const IntegrationSettings = lazy(() => import("./pages/IntegrationSettings"));
const ClickUpTenantMapping = lazy(() => import("./pages/admin/ClickUpTenantMapping"));
const AddinShell = lazy(() => import("./pages/addin/AddinShell"));
const TeamsShell = lazy(() => import("./pages/teams/TeamsShell"));
 const ClientImpactPage = lazy(() => import("./pages/ClientImpactPage"));
  const ResetPassword = lazy(() => import("./pages/ResetPassword"));
  const ActivateAccount = lazy(() => import("./pages/ActivateAccount"));
 const Audits = lazy(() => import("./pages/Audits"));
 const AuditWorkspace = lazy(() => import("./pages/AuditWorkspace"));
 const AuditWorkspaceNew = lazy(() => import("./pages/AuditWorkspaceNew"));
 const AuditsAssessments = lazy(() => import("./pages/AuditsAssessments"));
 const AuditWorkspacePlaceholder = lazy(() => import("./pages/AuditWorkspacePlaceholder"));
 const AuditFindings = lazy(() => import("./pages/AuditFindings"));
 const AuditActions = lazy(() => import("./pages/AuditActions"));
 const AuditReport = lazy(() => import("./pages/AuditReport"));
 const AuditTemplateBuilder = lazy(() => import("./pages/AuditTemplateBuilder"));
 const TasksManagementWrapper = lazy(() => import("./pages/TasksManagementWrapper"));
 const ClickUpImport = lazy(() => import("./pages/ClickUpImport"));
 const RtoTipsWrapper = lazy(() => import("./pages/RtoTipsWrapper"));
 const MembershipDashboardWrapper = lazy(() => import("./pages/MembershipDashboardWrapper"));
 const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
 const ExecutiveFinancialControls = lazy(() => import("./pages/ExecutiveFinancialControls"));
 const ExecutiveClientCommitments = lazy(() => import("./pages/ExecutiveClientCommitments"));
 const ExecutiveDecisionQueue = lazy(() => import("./pages/ExecutiveDecisionQueue"));
 const AdminUserAudit = lazy(() => import("./pages/AdminUserAudit"));
const OnboardingHubPage = lazy(() => import("./pages/admin/OnboardingHubPage"));
const MyOnboardingPage = lazy(() => import("./pages/MyOnboardingPage"));
const MyExitInterview = lazy(() => import("./pages/MyExitInterview"));
 const ClientPackageDetailWrapper = lazy(() => import("./pages/ClientPackageDetailWrapper"));
 const AdminCompliancePacks = lazy(() => import("./pages/AdminCompliancePacks"));
const AdminReviews = lazy(() => import("./pages/AdminReviews"));
const MyKpiDashboardPage = lazy(() => import("./pages/MyKpiDashboardPage"));
const KpiPage = lazy(() => import("./pages/KpiPage"));
 const MyWork = lazy(() => import("./pages/MyWork"));
 const CalendarTimeCapture = lazy(() => import("./pages/CalendarTimeCapture"));
 const OutlookCallback = lazy(() => import("./pages/OutlookCallback"));
 const XeroCallback = lazy(() => import("./pages/XeroCallback"));
const TimeInbox = lazy(() => import("./pages/TimeInbox"));
const ProcessDetail = lazy(() => import("./pages/ProcessDetail"));
const ProcessForm = lazy(() => import("./pages/ProcessForm"));
const RoleReference = lazy(() => import("./pages/RoleReference"));
const AskVivAssistant = lazy(() => import("./pages/AskVivAssistant"));
const QAResponsiveHarness = lazy(() => import("./pages/admin/QAResponsiveHarness"));
const QASmokeTest = lazy(() => import("./pages/admin/QASmokeTest"));
 const ClientActivityFeed = lazy(() => import("./pages/ClientActivityFeed"));


// Academy pages (placeholder)
const AcademyCoursesListPage = lazy(() => import("./pages/academy/AcademyCoursesListPage"));
const AcademyCertificatesPage = lazy(() => import("./pages/academy/AcademyCertificatesPage"));
const AcademyWorkbooksPage = lazy(() => import("./pages/academy/AcademyWorkbooksPage"));
const AcademyEvents = lazy(() => import("./pages/academy/AcademyEvents"));
const AcademyCommunity = lazy(() => import("./pages/academy/AcademyCommunity"));
const AcademyPdpPage = lazy(() => import("./pages/academy/pdp"));
const AcademyPdpCyclePage = lazy(() => import("./pages/academy/pdp/cycle/[cycleId]"));
const AcademyPdpReviewsPage = lazy(() => import("./pages/academy/pdp/reviews"));

// Client Preview pages
const ClientPreview = lazy(() => import("./pages/ClientPreview"));

// ClientNotificationsWrapperLegacy removed — /client/notifications now redirects to /client/inbox?tab=notifications

// Client Portal pages (isolated layout)
// ClientNotificationsWrapperNew removed — consolidated into ClientInboxPage
// ClientCommunicationsWrapperNew removed — consolidated into ClientInboxPage
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
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="unicorn-theme">
  <QueryClientProvider client={queryClient}>
  <VersionGuard>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter useTransitions={false}>
        <RouteMeta />
        <AuthProvider>
          <ErrorBoundary>
            <TenantTypeProvider>
            <ClientPreviewProvider>
            <ViewModeProvider>
             <CelebrationProvider>
             <ChunkErrorBoundary>
             <Suspense fallback={<LazyLoadFallback />}>
           <PageTitleProvider>
           <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/activate" element={<ActivateAccount />} />
            <Route path="/accept-invitation" element={<AcceptInvitationWrapper />} />
            <Route path="/post-sign-in" element={<PostSignInRedirect />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <MainDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/triage-dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/my-onboarding"
              element={
                <ProtectedRoute>
                  <MyOnboardingPage />
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
              path="/admin/integrations/xero-callback"
              element={<XeroCallback />}
            />
            <Route
              path="/messages" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            {/* Superseded by /manage-documents, which uses the same GovernanceDocumentDetail
                drill-down but is the actively-maintained canonical documents page. */}
            <Route path="/admin/governance-documents" element={<Navigate to="/manage-documents" replace />} />
            <Route
              path="/tenant/:tenantId/document/:documentId"
              element={
                <ProtectedRoute>
                  <TenantDocumentDetailWrapper />
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
              path="/eos/issues"
              element={
                <Navigate to="/eos/risks-opportunities" replace />
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
              path="/tenant/:clientId/impact"
              element={
                <ProtectedRoute>
                  <ClientImpactPage />
                </ProtectedRoute>
              }
            />
            {/* Process Management Routes */}
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
                  <AuditsAssessments />
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
                  <AuditWorkspaceNew />
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
            {/* Membership Dashboard */}
            <Route path="/membership-dashboard" element={<ProtectedRoute><MembershipDashboardWrapper /></ProtectedRoute>} />
            {/* Executive Dashboard – Internal Only */}
            <Route path="/executive" element={<ProtectedRoute><ExecutiveDashboard /></ProtectedRoute>} />
            <Route path="/executive/financial-controls" element={<ProtectedRoute requireSuperAdmin><ExecutiveFinancialControls /></ProtectedRoute>} />
            <Route path="/executive/client-commitments" element={<ProtectedRoute requireSuperAdmin><ExecutiveClientCommitments /></ProtectedRoute>} />
            <Route path="/executive/decision-queue" element={<ProtectedRoute requireSuperAdmin><ExecutiveDecisionQueue /></ProtectedRoute>} />
            {/* Client Detail route removed — consolidated into /tenant/:tenantId above */}
            {/* Admin User Audit */}
            <Route path="/admin/user-audit" element={<ProtectedRoute><AdminUserAudit /></ProtectedRoute>} />
            {/* Team & Tenant Users */}
            <Route path="/my-exit-interview" element={<ProtectedRoute><MyExitInterview /></ProtectedRoute>} />
            <Route path="/admin/team-users/runs/:runId/onboarding" element={<ProtectedRoute requireSuperAdmin><OnboardingHubPage /></ProtectedRoute>} />
            {/* Admin Stages */}
            <Route path="/admin/compliance-packs" element={<ProtectedRoute requireSuperAdmin><AdminCompliancePacks /></ProtectedRoute>} />
            <Route path="/admin/reviews" element={<ProtectedRoute><AdminReviews /></ProtectedRoute>} />
            <Route path="/my/kpi" element={<ProtectedRoute><MyKpiDashboardPage /></ProtectedRoute>} />
            <Route path="/kpi" element={<ProtectedRoute><KpiPage /></ProtectedRoute>} />
            {/* Ask Viv Assistant - new conversational RAG bot, Vivacity staff only (self-gated inside the page via canAccessAskViv() + rollout flags) */}
            <Route path="/ask-viv" element={<ProtectedRoute><AskVivAssistant /></ProtectedRoute>} />
            {/* QA Responsive Harness - SuperAdmin/VivacityTeam only */}
            <Route path="/admin/qa/responsive" element={<ProtectedRoute requireSuperAdmin><QAResponsiveHarness /></ProtectedRoute>} />
            {/* QA Smoke Test - SuperAdmin/VivacityTeam only */}
            <Route path="/admin/qa/smoke" element={<ProtectedRoute requireSuperAdmin><QASmokeTest /></ProtectedRoute>} />
            <Route path="/admin/clickup-mapping" element={<ProtectedRoute requireSuperAdmin><ClickUpTenantMapping /></ProtectedRoute>} />
            <Route path="/admin/clickup-import" element={<ProtectedRoute requireSuperAdmin><ClickUpImport /></ProtectedRoute>} />
            <Route path="/client-activity" element={<ProtectedRoute><ClientActivityFeed /></ProtectedRoute>} />
            {supportTicketsRoutes}
            {/* Academy Routes */}
            <Route path="/academy/courses" element={<ProtectedRoute><AcademyCoursesListPage /></ProtectedRoute>} />
            <Route path="/academy/certificates" element={<ProtectedRoute><AcademyCertificatesPage /></ProtectedRoute>} />
            <Route path="/academy/workbooks" element={<ProtectedRoute><AcademyWorkbooksPage /></ProtectedRoute>} />
            <Route path="/academy/events" element={<ProtectedRoute><AcademyEvents /></ProtectedRoute>} />
            <Route path="/academy/community" element={<ProtectedRoute><AcademyCommunity /></ProtectedRoute>} />
            <Route path="/academy/pdp" element={<ProtectedRoute><AcademyPdpPage /></ProtectedRoute>} />
            <Route path="/academy/pdp/reviews" element={<ProtectedRoute><AcademyPdpReviewsPage /></ProtectedRoute>} />
            <Route path="/academy/pdp/cycle/:cycleId" element={<ProtectedRoute><AcademyPdpCyclePage /></ProtectedRoute>} />
            {/* Client Preview Routes */}
            <Route path="/client-preview" element={<ProtectedRoute><ClientPreview /></ProtectedRoute>} />
            
            {/* Client Portal Routes (isolated ClientLayout) */}
            <Route path="/client/communications" element={<Navigate to="/client/inbox?tab=messages" replace />} />
            <Route path="/client/documents" element={<Navigate to="/client/governance-documents" replace />} />
            <Route path="/client/notifications" element={<Navigate to="/client/inbox?tab=notifications" replace />} />
            <Route path="/client/team" element={<Navigate to="/client/users" replace />} />
            {clientLayoutRoutes}
            {academyLayoutRoutes}
            {dashboardLayoutRoutes}
            
            {/* Add-in Shell Route - works without full auth for add-in JWT holders */}
            <Route path="/addin" element={<AddinShell />} />
            
            {/* Teams Shell Route - embedded as Teams tab, supports ?mode=meeting */}
            <Route path="/teams" element={<TeamsShell />} />

            <Route path="*" element={<NotFound />} />
           </Routes>
           </PageTitleProvider>
             </Suspense>
             </ChunkErrorBoundary>
            </CelebrationProvider>
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
  </ThemeProvider>
);

export default App;
