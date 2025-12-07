import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuditDetails, useAudits } from '@/hooks/useAudits';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuditSectionNav } from '@/components/audit/AuditSectionNav';
import { AuditQuestionCard } from '@/components/audit/AuditQuestionCard';

export default function AuditWorkspace() {
  const { id } = useParams<{ id: string }>();
  const auditId = id ? parseInt(id) : undefined;
  const { auditReport, isLoading } = useAuditDetails(auditId);
  const { addResponse, updateAuditStatus, generateFindings } = useAudits();
  const [selectedSection, setSelectedSection] = useState<number>(0);

  const currentSection = auditReport?.sections?.[selectedSection];

  const handleStartAudit = async () => {
    if (!auditId) return;
    await updateAuditStatus.mutateAsync({ auditId, status: 'in_progress' });
  };

  const handleCompleteAudit = async () => {
    if (!auditId) return;
    await generateFindings.mutateAsync(auditId);
    await updateAuditStatus.mutateAsync({ auditId, status: 'complete' });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading audit...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!auditReport) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Audit not found</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/audits">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{auditReport.audit.audit_title}</h1>
              <p className="text-sm text-muted-foreground">
                Audit ID: {auditReport.audit.audit_id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={auditReport.audit.status === 'complete' ? 'default' : 'secondary'}>
              {auditReport.audit.status.replace('_', ' ')}
            </Badge>
            {auditReport.audit.status === 'draft' && (
              <Button onClick={handleStartAudit}>Start Audit</Button>
            )}
            {auditReport.audit.status === 'in_progress' && (
              <>
                <Link to={`/audits/${auditId}/findings`}>
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    View Findings
                  </Button>
                </Link>
                <Button onClick={handleCompleteAudit}>Complete Audit</Button>
              </>
            )}
            {auditReport.audit.status === 'complete' && (
              <Link to={`/audits/${auditId}/report`}>
                <Button>
                  <FileText className="h-4 w-4 mr-2" />
                  View Report
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <AuditSectionNav
              sections={auditReport.sections || []}
              selectedSection={selectedSection}
              onSelectSection={setSelectedSection}
            />
          </div>

          <div className="col-span-9">
            {currentSection && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{currentSection.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Standard Code: {currentSection.standard_code}
                    </p>
                  </CardHeader>
                </Card>

                {currentSection.questions?.map((question: any) => (
                  <AuditQuestionCard
                    key={question.question_id}
                    question={question}
                    onSaveResponse={addResponse.mutateAsync}
                  />
                ))}

                {(!currentSection.questions || currentSection.questions.length === 0) && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <p className="text-muted-foreground">
                        No questions available for this section
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
