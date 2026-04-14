import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, LayoutDashboard, ClipboardList, FileText, AlertTriangle, CheckSquare, FileBarChart } from 'lucide-react';
import { useAudit } from '@/hooks/useClientAudits';
import { useAuditSections, useAuditResponses, useAuditFindings, useAuditActions, useAuditStatusTransition, useInternalUsers } from '@/hooks/useAuditWorkspace';
import { AuditSidebar } from '@/components/audit/workspace/AuditSidebar';
import { OverviewTab } from '@/components/audit/workspace/OverviewTab';
import { AuditFormTab } from '@/components/audit/workspace/AuditFormTab';
import { DocumentsTab } from '@/components/audit/workspace/DocumentsTab';
import { FindingsTab } from '@/components/audit/workspace/FindingsTab';
import { ActionsTab } from '@/components/audit/workspace/ActionsTab';
import { ReportTab } from '@/components/audit/workspace/ReportTab';
import type { AuditStatus } from '@/types/clientAudits';

export default function AuditWorkspaceNew() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: audit, isLoading } = useAudit(id);
  const { data: sections } = useAuditSections(id);
  const { data: responses } = useAuditResponses(id);
  const { data: findings } = useAuditFindings(id);
  const { data: actions } = useAuditActions(id);
  const { data: users } = useInternalUsers();
  const statusTransition = useAuditStatusTransition(id);
  const [selectedSection, setSelectedSection] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!audit) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-muted-foreground">Audit not found</p>
          <Button variant="ghost" onClick={() => navigate('/audits')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Audits
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const leadAuditor = users?.find(u => u.user_uuid === audit.lead_auditor_id);
  const totalQuestions = responses?.length || 0;

  const handleStatusChange = (status: AuditStatus) => {
    statusTransition.mutate({ status, audit });
  };

  const findingCount = findings?.length || 0;
  const actionCount = actions?.length || 0;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar - hidden on small screens */}
        <div className="hidden lg:block">
          <AuditSidebar
            audit={audit}
            sections={sections || []}
            responses={responses || []}
            totalQuestions={totalQuestions}
            selectedSectionIndex={selectedSection}
            onSelectSection={(idx) => {
              setSelectedSection(idx);
              setActiveTab('form');
            }}
            onStatusChange={handleStatusChange}
            leadAuditorName={leadAuditor ? `${leadAuditor.first_name} ${leadAuditor.last_name}` : null}
            leadAuditorAvatar={leadAuditor?.avatar_url}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Breadcrumb */}
          <div className="p-4 border-b flex items-center gap-2 text-sm">
            <Link to="/audits" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Audits
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium truncate">{audit.title || 'Untitled'}</span>
          </div>

          {/* Tabs */}
          <div className="p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="overview" className="gap-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5" /> Overview
                </TabsTrigger>
                <TabsTrigger value="form" className="gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" /> Audit Form
                </TabsTrigger>
                <TabsTrigger value="documents" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Documents
                </TabsTrigger>
                <TabsTrigger value="findings" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Findings
                  {findingCount > 0 && (
                    <span className="ml-1 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
                      {findingCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="actions" className="gap-1.5">
                  <CheckSquare className="h-3.5 w-3.5" /> Actions
                  {actionCount > 0 && (
                    <span className="ml-1 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
                      {actionCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="report" className="gap-1.5">
                  <FileBarChart className="h-3.5 w-3.5" /> Report
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab audit={audit} />
              </TabsContent>
              <TabsContent value="form">
                <AuditFormTab audit={audit} selectedSectionId={sections?.[selectedSection]?.id} />
              </TabsContent>
              <TabsContent value="documents">
                <DocumentsTab auditId={audit.id} />
              </TabsContent>
              <TabsContent value="findings">
                <FindingsTab auditId={audit.id} />
              </TabsContent>
              <TabsContent value="actions">
                <ActionsTab auditId={audit.id} auditStatus={audit.status} subjectTenantId={audit.subject_tenant_id} />
              </TabsContent>
              <TabsContent value="report">
                <ReportTab audit={audit} findings={findings || []} actions={actions || []} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
