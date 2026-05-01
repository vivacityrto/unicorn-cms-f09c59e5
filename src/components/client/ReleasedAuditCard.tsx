import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { AUDIT_TYPE_LABELS } from '@/types/clientAudits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReleasedAuditRow } from '@/hooks/useReleasedAudits';

function formatAuDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  audit: ReleasedAuditRow;
}

export function ReleasedAuditCard({ audit }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!audit.report_pdf_path) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('audit-reports')
        .createSignedUrl(audit.report_pdf_path, 600);
      if (error || !data?.signedUrl) throw error ?? new Error('No signed URL');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (err) {
      console.error('[ReleasedAuditCard] signed URL error', err);
      toast.error("Couldn't open the PDF. Try again in a moment.");
    } finally {
      setDownloading(false);
    }
  };

  const typeLabel = AUDIT_TYPE_LABELS[audit.audit_type] ?? audit.audit_type;
  const hasScore = audit.score_pct != null;
  const hasFraction = audit.score_total != null && audit.score_max != null;
  const acknowledged = !!audit.report_acknowledged_at;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-secondary">{typeLabel}</h3>
            <AuditRiskBadge risk={audit.risk_rating} />
          </div>
          <div className="text-sm text-muted-foreground">
            Released {formatAuDate(audit.report_released_at)}
          </div>
        </div>

        {/* RTO sub-line */}
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {audit.snapshot_rto_name ?? '—'}
          </span>
          {audit.snapshot_rto_number && (
            <span> · RTO {audit.snapshot_rto_number}</span>
          )}
          {audit.snapshot_cricos_code && (
            <span> · CRICOS {audit.snapshot_cricos_code}</span>
          )}
        </div>

        {/* Score */}
        {hasScore && (
          <div className="text-sm">
            <span className="font-semibold">{audit.score_pct}%</span>
            {hasFraction && (
              <span className="text-muted-foreground">
                {' '}
                ({audit.score_total}/{audit.score_max})
              </span>
            )}
          </div>
        )}

        {/* Release notes */}
        {audit.report_release_notes && (
          <p className="italic text-sm text-muted-foreground line-clamp-3">
            {audit.report_release_notes}
          </p>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {acknowledged ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 border border-green-300 px-2.5 py-0.5 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acknowledged {formatAuDate(audit.report_acknowledged_at)}
            </span>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" size="sm" disabled>
                      Acknowledge
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Coming soon — acknowledge flow ships in Phase 3.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {audit.report_pdf_path ? (
            <Button onClick={handleDownload} disabled={downloading} size="sm">
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button size="sm" disabled>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>PDF not generated yet.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
