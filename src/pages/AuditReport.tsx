import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuditDetails } from '@/hooks/useAudits';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AuditReport() {
  const { id } = useParams<{ id: string }>();
  const auditId = id ? parseInt(id) : undefined;
  const { auditReport, isLoading } = useAuditDetails(auditId);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </DashboardLayout>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-4">
            <Link to={`/audits/${auditId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Audit
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Audit Report</h1>
            </div>
          </div>
          <Button onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>

        <div className="bg-card rounded-lg p-8 print:p-0 space-y-6">
          <div className="text-center space-y-2 pb-6 border-b print:border-black">
            <h1 className="text-3xl font-bold">{auditReport?.audit.audit_title}</h1>
            <p className="text-muted-foreground">
              Audit ID: {auditReport?.audit.audit_id}
            </p>
            <p className="text-sm text-muted-foreground">
              Status: {auditReport?.audit.status.replace('_', ' ')}
            </p>
            {auditReport?.audit.completed_at && (
              <p className="text-sm text-muted-foreground">
                Completed: {new Date(auditReport.audit.completed_at).toLocaleDateString()}
              </p>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Executive Summary</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-destructive">
                    {auditReport?.risk_summary.high_count || 0}
                  </div>
                  <p className="text-sm text-muted-foreground">High Priority</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold">
                    {auditReport?.risk_summary.medium_count || 0}
                  </div>
                  <p className="text-sm text-muted-foreground">Medium Priority</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {auditReport?.risk_summary.low_count || 0}
                  </div>
                  <p className="text-sm text-muted-foreground">Low Priority</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-4 page-break-before">
            <h2 className="text-2xl font-bold">Findings</h2>
            {auditReport?.findings && auditReport.findings.length > 0 ? (
              auditReport.findings.map((finding: any, idx: number) => (
                <Card key={finding.finding_id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <AlertCircle className={`h-5 w-5 mt-0.5 ${
                          finding.priority === 'high' ? 'text-destructive' : 
                          finding.priority === 'medium' ? 'text-primary' : 
                          'text-muted-foreground'
                        }`} />
                        <div>
                          <CardTitle className="text-base">Finding {idx + 1}</CardTitle>
                          <Badge variant={
                            finding.priority === 'high' ? 'destructive' :
                            finding.priority === 'medium' ? 'default' : 'secondary'
                          } className="mt-2">
                            {finding.priority} priority
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">Summary</p>
                        <p className="text-sm text-muted-foreground">{finding.summary}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Impact</p>
                        <p className="text-sm text-muted-foreground">{finding.impact}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-8">No findings recorded</p>
            )}
          </div>

          <div className="space-y-4 page-break-before">
            <h2 className="text-2xl font-bold">Actions</h2>
            {auditReport?.actions && auditReport.actions.length > 0 ? (
              <div className="space-y-3">
                {auditReport.actions.map((action: any, idx: number) => (
                  <Card key={action.action_id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">Action {idx + 1}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {action.description}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Due: {new Date(action.due_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={action.status === 'done' ? 'default' : 'secondary'}>
                          {action.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No actions created</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
