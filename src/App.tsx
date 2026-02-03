import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ViewModeProvider } from "./contexts/ViewModeContext";
import { FacilitatorModeProvider } from "./contexts/FacilitatorModeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ManageUsersWrapper from "./pages/ManageUsersWrapper";
import ManageInvitesWrapper from "./pages/ManageInvitesWrapper";
import ManageTenantsWrapper from "./pages/ManageTenantsWrapper";
import ManageDocumentsWrapper from "./pages/ManageDocumentsWrapper";
import ManageCategoriesWrapper from "./pages/ManageCategoriesWrapper";
import ManageStagesWrapper from "./pages/ManageStagesWrapper";
import ManageFieldsWrapper from "./pages/ManageFieldsWrapper";
import UserProfileWrapper from "./pages/UserProfileWrapper";
import TenantDetailWrapper from "./pages/TenantDetailWrapper";
import TenantLoginsWrapper from "./pages/TenantLoginsWrapper";
import TenantMembersWrapper from "./pages/TenantMembersWrapper";
import TenantDocumentsWrapper from "./pages/TenantDocumentsWrapper";
import TenantDocumentDetailWrapper from "./pages/TenantDocumentDetailWrapper";
import TenantNotesWrapper from "./pages/TenantNotesWrapper";
import ManagePackagesWrapper from "./pages/ManagePackagesWrapper";
import PackageDetail from "./pages/PackageDetail";
import AdminPackageDetailWrapper from "./pages/AdminPackageDetailWrapper";
import AdminPackageTenantDetailWrapper from "./pages/AdminPackageTenantDetailWrapper";
import PackageBuilder from "./pages/PackageBuilder";
import PackageBuilderDetail from "./pages/PackageBuilderDetail";
import ManageEmailTemplatesWrapper from "./pages/ManageEmailTemplatesWrapper";
import DocumentDetailWrapper from "./pages/DocumentDetailWrapper";
import TeamSettingsWrapper from "./pages/TeamSettingsWrapper";
import SettingsWrapper from "./pages/SettingsWrapper";
import CalendarWrapper from "./pages/CalendarWrapper";
import AcceptInvitationWrapper from "./pages/AcceptInvitationWrapper";
import NotFound from "./pages/NotFound";
import EosOverview from "./pages/EosOverview";
import EosRocks from "./pages/EosRocks";
import EosIssues from "./pages/EosIssues";
import EosTodos from "./pages/EosTodos";
import EosMeetings from "./pages/EosMeetings";
import EosScorecard from "./pages/EosScorecard";
import EosVto from "./pages/EosVto";
import EosMeetingSummary from "./pages/EosMeetingSummary";
import { LiveMeetingView } from "./components/eos/LiveMeetingView";
import ClientEosOverview from "./pages/ClientEosOverview";
import NotificationSettings from "./pages/NotificationSettings";
import IntegrationSettings from "./pages/IntegrationSettings";
import EosCalendar from "./pages/EosCalendar";
import EosQC from "./pages/EosQC";
import EosQCSession from "./pages/EosQCSession";
import EosFlightPlan from "./pages/EosFlightPlan";
import EosRisksOpportunities from "./pages/EosRisksOpportunities";
import EosAccountabilityChart from "./pages/EosAccountabilityChart";
import EosOnboarding from "./pages/EosOnboarding";
import EosHealth from "./pages/EosHealth";
import EosPeopleAnalyzer from "./pages/EosPeopleAnalyzer";
import EosGWCTrends from "./pages/EosGWCTrends";
import ResetPassword from "./pages/ResetPassword";
import Audits from "./pages/Audits";
import AuditWorkspace from "./pages/AuditWorkspace";
import AuditFindings from "./pages/AuditFindings";
import AuditActions from "./pages/AuditActions";
import AuditReport from "./pages/AuditReport";
import AuditTemplateBuilder from "./pages/AuditTemplateBuilder";
import TasksManagementWrapper from "./pages/TasksManagementWrapper";
import RtoTipsWrapper from "./pages/RtoTipsWrapper";
import ResourceHubDashboard from "./pages/ResourceHubDashboard";
import ResourceCategoryPage from "./pages/ResourceCategoryPage";
import ResourceRecentlyAdded from "./pages/ResourceRecentlyAdded";
import ResourceMostUsed from "./pages/ResourceMostUsed";
import ResourceFavourites from "./pages/ResourceFavourites";
import ResourceUpdatesLog from "./pages/ResourceUpdatesLog";
import MembershipDashboardWrapper from "./pages/MembershipDashboardWrapper";
import ClientDetailWrapper from "./pages/ClientDetailWrapper";
import AdminTgaIntegrationWrapper from "./pages/AdminTgaIntegrationWrapper";
import AdminUserAudit from "./pages/AdminUserAudit";
import TeamUsers from "./pages/TeamUsers";
import TenantUsers from "./pages/TenantUsers";
import ClientPackageDetailWrapper from "./pages/ClientPackageDetailWrapper";
import AdminManageStagesWrapper from "./pages/AdminManageStagesWrapper";
import AdminStageDetailWrapper from "./pages/AdminStageDetailWrapper";
import StageBuilder from "./pages/StageBuilder";
import AdminStageAnalytics from "./pages/AdminStageAnalytics";
import AdminOperations from "./pages/AdminOperations";
import AdminCompliancePacks from "./pages/AdminCompliancePacks";
import AdminReviews from "./pages/AdminReviews";
import MyWork from "./pages/MyWork";
import CalendarTimeCapture from "./pages/CalendarTimeCapture";
import OutlookCallback from "./pages/OutlookCallback";
import TimeInbox from "./pages/TimeInbox";
import ProcessesWrapper from "./pages/ProcessesWrapper";
import ProcessDetail from "./pages/ProcessDetail";
import ProcessForm from "./pages/ProcessForm";
import RoleReference from "./pages/RoleReference";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ViewModeProvider>
          <FacilitatorModeProvider>
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
                  <TenantDetailWrapper />
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
              path="/tenant/:tenantId/document/:documentId" 
              element={
                <ProtectedRoute>
                  <TenantDocumentDetailWrapper />
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
                  <TenantDetailWrapper />
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
            {/* Client Detail (new client-first view) */}
            <Route path="/clients/:tenantId" element={<ProtectedRoute><ClientDetailWrapper /></ProtectedRoute>} />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </FacilitatorModeProvider>
          </ViewModeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
