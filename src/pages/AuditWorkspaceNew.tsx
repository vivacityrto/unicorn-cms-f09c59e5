import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, LayoutDashboard, CalendarClock, ClipboardList, FileText, AlertTriangle, CheckSquare, FileBarChart, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAudit } from '@/hooks/useClientAudits';
import { useAuditSections, useAuditResponses, useAuditFindings, useAuditActions, useAuditStatusTransition, useInternalUsers } from '@/hooks/useAuditWorkspace';
import { useAuditAppointments } from '@/hooks/useAuditSchedule';
import { AuditSidebar } from '@/components/audit/workspace/AuditSidebar';
import { OverviewTab } from '@/components/audit/workspace/OverviewTab';
import { ScheduleTab } from '@/components/audit/workspace/ScheduleTab';
import { AuditFormTab } from '@/components/audit/workspace/AuditFormTab';
import { DocumentsTab } from '@/components/audit/workspace/DocumentsTab';
import { FindingsTab } from '@/components/audit/workspace/FindingsTab';
import { ActionsTab } from '@/components/audit/workspace/ActionsTab';
import { ReportTab } from '@/components/audit/workspace/ReportTab';
import { AuditSummaryPills } from '@/components/audit/workspace/AuditSummaryPills';
import { UnsavedAuditWorkProvider, useUnsavedAuditWork } from '@/components/audit/workspace/UnsavedAuditWorkContext';
import { Loader2, Check, MoreVertical, Trash2 } from 'lucide-react';
import type { AuditStatus } from '@/types/clientAudits';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteAuditDialog, canDeleteAudit } from '@/components/audit/DeleteAuditDialog';

function SaveIndicator() {
  const { status } = useUnsavedAuditWork();
  if (status === 'idle') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium ml-2">
      {status === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-green-600">All changes saved</span>
        </>
      )}
    </span>
  );
}

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
  const [purchaserName, setPurchaserName] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const tid = audit?.subject_tenant_id;
    if (!tid) return;
    (supabase as any)
      .from('tenants')
      .select('name')
      .eq('id', tid)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.name) setPurchaserName(data.name);
      });
  }, [audit?.subject_tenant_id]);

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
    <UnsavedAuditWorkProvider>
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
              onNavigateToSchedule={() => setActiveTab('schedule')}
              leadAuditorName={leadAuditor ? `${leadAuditor.first_name} ${leadAuditor.last_name}` : null}
              leadAuditorAvatar={leadAuditor?.avatar_url}
              activeTab={activeTab}
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
              <SaveIndicator />
              {canDeleteAudit(audit) && (
                <div className="ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Audit actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete audit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            <DeleteAuditDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              audit={{
                id: audit.id,
                title: audit.title,
                audit_type: audit.audit_type,
                status: audit.status,
                client_name: purchaserName,
                created_at: audit.created_at,
              }}
              onDeleted={() => navigate('/audits')}
            />

            {/* Purchaser / Target RTO line for Due Diligence audits */}
            {(audit.audit_type === 'due_diligence' || audit.audit_type === 'due_diligence_combined') && (
              <div className="px-4 py-2 border-b bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span>
                  <span className="text-muted-foreground">Purchaser: </span>
                  <span className="font-medium">{purchaserName || '—'}</span>
                </span>
                <span className="text-muted-foreground">→</span>
                <span>
                  <span className="text-muted-foreground">Target RTO: </span>
                  {audit.snapshot_rto_name ? (
                    <span className="font-medium">
                      {audit.snapshot_rto_name}
                      {audit.snapshot_rto_number ? ` (${audit.snapshot_rto_number})` : ''}
                    </span>
                  ) : (
                    <span className="italic text-muted-foreground">not set — edit snapshot details on the Overview tab to add</span>
                  )}
                </span>
              </div>
            )}

            {/* Two-pill summary strip: Completion + Risk Rating */}
            <AuditSummaryPills
              audit={audit}
              sections={sections || []}
              responses={responses || []}
            />

          {/* Tabs */}
          <div className="p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {/* max-w-full + overflow-x-auto: with 7 tabs this list is 809px wide
                  and was silently clipped by an ancestor's overflow-x-hidden on
                  narrow viewports (375px) - Documents/Findings/Actions/Report
                  (4 of 7 tabs) were entirely off-screen with no way to reach
                  them. Scrolling the list itself keeps every tab reachable. */}
              <TabsList className="mb-4 max-w-full overflow-x-auto">
                <TabsTrigger value="overview" className="gap-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5" /> Overview
                </TabsTrigger>
                <TabsTrigger value="schedule" className="gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Schedule
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
              <TabsContent value="schedule">
                <ScheduleTab audit={audit} />
              </TabsContent>
              <TabsContent value="form">
                <AuditFormTab audit={audit} selectedSectionId={sections?.[selectedSection]?.id} />
              </TabsContent>
              <TabsContent value="documents">
                <DocumentsTab auditId={audit.id} tenantId={audit.subject_tenant_id} />
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
    </UnsavedAuditWorkProvider>
  );
}
