import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Clock } from 'lucide-react';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import type { ClientAudit } from '@/types/clientAudits';
import type { AuditFinding, AuditAction } from '@/types/auditWorkspace';

interface ReportTabProps {
  audit: ClientAudit;
  findings: AuditFinding[];
  actions: AuditAction[];
}

export function ReportTab({ audit, findings, actions }: ReportTabProps) {
  const findingsByPriority = {
    critical: findings.filter(f => f.priority === 'critical').length,
    high: findings.filter(f => f.priority === 'high').length,
    medium: findings.filter(f => f.priority === 'medium').length,
    low: findings.filter(f => f.priority === 'low').length,
  };
  const openActions = actions.filter(a => a.status !== 'complete' && a.status !== 'cancelled').length;

  return (
    <div className="space-y-6">
      {/* Report Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {audit.report_generated_at ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <FileText className="h-4 w-4" />
                Last generated: {new Date(audit.report_generated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <Button size="sm" variant="outline">
                <Download className="h-3 w-3 mr-1" /> Download PDF
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> No report generated yet
            </div>
          )}
          <Button disabled>
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
          <p className="text-xs text-muted-foreground">
            Report generation coming soon. The edge function for generating PDF reports will be built in a follow-up.
          </p>
        </CardContent>
      </Card>

      {/* Report Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Client</p>
              <p className="font-medium">{audit.snapshot_rto_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">RTO Number</p>
              <p>{audit.snapshot_rto_number || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conducted</p>
              <p>{audit.conducted_at ? new Date(audit.conducted_at).toLocaleDateString('en-AU') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Rating</p>
              {audit.risk_rating ? <AuditRiskBadge risk={audit.risk_rating} /> : <p>—</p>}
            </div>
          </div>

          {audit.score_pct !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="text-2xl font-bold">{audit.score_pct}%</p>
            </div>
          )}

          {audit.executive_summary && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Executive Summary</p>
              <p className="text-sm whitespace-pre-wrap">{audit.executive_summary}</p>
            </div>
          )}

          {audit.overall_finding && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Overall Finding</p>
              <p className="text-sm whitespace-pre-wrap">{audit.overall_finding}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-2">Findings by Priority</p>
            <div className="flex gap-3 text-sm">
              <span className="text-red-600">Critical: {findingsByPriority.critical}</span>
              <span className="text-orange-600">High: {findingsByPriority.high}</span>
              <span className="text-amber-600">Medium: {findingsByPriority.medium}</span>
              <span className="text-green-600">Low: {findingsByPriority.low}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Open Actions</p>
            <p className={`text-sm font-medium ${openActions > 0 ? 'text-orange-600' : ''}`}>{openActions}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
