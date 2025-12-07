import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
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
import AdminManagePackagesWrapper from "./pages/AdminManagePackagesWrapper";
import ManageEmailsWrapper from "./pages/ManageEmailsWrapper";
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
import ResetPassword from "./pages/ResetPassword";
import Audits from "./pages/Audits";
import AuditWorkspace from "./pages/AuditWorkspace";
import AuditFindings from "./pages/AuditFindings";
import AuditActions from "./pages/AuditActions";
import AuditReport from "./pages/AuditReport";
import AuditTemplateBuilder from "./pages/AuditTemplateBuilder";
import TasksManagementWrapper from "./pages/TasksManagementWrapper";
import RtoTipsWrapper from "./pages/RtoTipsWrapper";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invitation" element={<AcceptInvitationWrapper />} />
            <Route path="/dashboard" element={<Navigate to="/manage-packages" replace />} />
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
              path="/calendar" 
              element={
                <ProtectedRoute>
                  <CalendarWrapper />
                </ProtectedRoute>
              } 
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
                <ProtectedRoute>
                  <AdminManagePackagesWrapper />
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
              path="/admin/manage-emails"
              element={
                <ProtectedRoute>
                  <ManageEmailsWrapper />
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
              path="/eos/rocks" 
              element={
                <ProtectedRoute>
                  <EosRocks />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/eos/issues" 
              element={
                <ProtectedRoute>
                  <EosIssues />
                </ProtectedRoute>
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
