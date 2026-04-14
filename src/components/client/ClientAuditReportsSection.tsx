import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, CheckCircle2, ExternalLink } from 'lucide-react';
import { useClientAuditReports } from '@/hooks/useClientAuditPortal';
import { useAcknowledgeReport } from '@/hooks/useAuditReport';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { supabase } from '@/integrations/supabase/client';
import { AUDIT_TYPE_LABELS } from '@/types/clientAudits';

export function ClientAuditReportsSection() {
  const { activeTenantId } = useClientTenant();
  const { data: reports = [], isLoading } = useClientAuditReports(activeTenantId);

  if (isLoading || reports.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit Reports</h2>
      {reports.map(report => (
        <AuditReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function AuditReportCard({ report }: { report: ReturnType<typeof useClientAuditReports>['data'][number] }) {
  const acknowledge = useAcknowledgeReport(report.id);

  const handleDownloadPdf = async () => {
    if (!report.report_pdf_path) return;
    const { data } = await supabase.storage
      .from('audit-documents')
      .createSignedUrl(report.report_pdf_path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const typeLabel = AUDIT_TYPE_LABELS[report.audit_type as keyof typeof AUDIT_TYPE_LABELS] || report.audit_type;
  const isAcknowledged = !!report.report_acknowledged_at;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{typeLabel} — {report.snapshot_rto_name || 'Audit'}</h3>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              {report.report_released_at && (
                <span>Released: {new Date(report.report_released_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              )}
              {report.conducted_at && (
                <span>Conducted: {new Date(report.conducted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              )}
            </div>
          </div>
        </div>

        {report.report_release_notes && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Message from your consultant</p>
            <p className="text-sm">{report.report_release_notes}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm">
          {report.risk_rating && (
            <div>
              <span className="text-xs text-muted-foreground">Risk rating: </span>
              <AuditRiskBadge risk={report.risk_rating} />
            </div>
          )}
          {report.score_pct !== null && (
            <div>
              <span className="text-xs text-muted-foreground">Score: </span>
              <span className="font-semibold">{report.score_pct}%</span>
            </div>
          )}
        </div>

        {report.executive_summary && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Executive Summary</p>
            <p className="text-sm line-clamp-3">{report.executive_summary}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {report.report_pdf_path && (
            <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download Report PDF
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <a href="#action-plan">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Action Plan
            </a>
          </Button>
        </div>

        {/* Acknowledgement */}
        {!isAcknowledged ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 rounded" id={`ack-${report.id}`} />
              <span>I have read and understood this report</span>
            </label>
            <Button
              size="sm"
              onClick={() => acknowledge.mutate()}
              disabled={acknowledge.isPending}
            >
              Acknowledge Report
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Acknowledged on {new Date(report.report_acknowledged_at!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
