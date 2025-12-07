import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuditDetails } from '@/hooks/useAudits';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus } from 'lucide-react';
import { FindingCard } from '@/components/audit/FindingCard';

export default function AuditFindings() {
  const { id } = useParams<{ id: string }>();
  const auditId = id ? parseInt(id) : undefined;
  const { auditReport, isLoading } = useAuditDetails(auditId);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading findings...</p>
        </div>
      </DashboardLayout>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/audits/${auditId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Audit
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Audit Findings</h1>
              <p className="text-sm text-muted-foreground">
                {auditReport?.audit.audit_title}
              </p>
            </div>
          </div>
          <Link to={`/audits/${auditId}/actions`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Actions
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {auditReport?.risk_summary.high_count || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Medium Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {auditReport?.risk_summary.medium_count || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Low Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-muted-foreground">
                {auditReport?.risk_summary.low_count || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {auditReport?.findings && auditReport.findings.length > 0 ? (
            auditReport.findings.map((finding: any) => (
              <FindingCard
                key={finding.finding_id}
                finding={finding}
                auditId={auditId!}
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  No findings generated yet. Complete the audit questions and generate findings.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
