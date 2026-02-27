/**
 * CompletionSummaryModal – Unicorn 2.0
 *
 * Shown after completion cascade or manually.
 * Displays completion date, phase/doc/risk summary, and CTAs.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ComplianceScoreRing } from '@/components/compliance/ComplianceScoreRing';
import { CheckCircle2, FileText, ShieldCheck, Download } from 'lucide-react';
import { format } from 'date-fns';
import { useComplianceScore } from '@/hooks/useComplianceScore';

interface CompletionSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  packageInstanceId: number;
  completedAt?: string;
  /** Hide internal diagnostics in client portal */
  isClientView?: boolean;
}

export function CompletionSummaryModal({
  open,
  onOpenChange,
  tenantId,
  packageInstanceId,
  completedAt,
  isClientView = false,
}: CompletionSummaryModalProps) {
  const { score } = useComplianceScore(tenantId, packageInstanceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Completion Achieved
          </DialogTitle>
          <DialogDescription>
            {completedAt
              ? `Completed on ${format(new Date(completedAt), 'dd MMM yyyy')}`
              : 'Package completion confirmed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Score ring */}
          <div className="flex justify-center">
            <ComplianceScoreRing score={score?.overall_score ?? 100} size="lg" />
          </div>

          <Separator />

          {/* Summary metrics */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryItem
              icon={CheckCircle2}
              label="Stage Completion"
              value={`${score?.phase_completion ?? 100}%`}
            />
            <SummaryItem
              icon={FileText}
              label="Documentation"
              value={`${score?.documentation_coverage ?? 100}%`}
            />
            {!isClientView && (
              <>
                <SummaryItem
                  icon={ShieldCheck}
                  label="Risk Health"
                  value={`${score?.risk_health ?? 100}%`}
                />
                <SummaryItem
                  icon={ShieldCheck}
                  label="Consult Health"
                  value={`${score?.consult_health ?? 100}%`}
                />
              </>
            )}
          </div>

          {/* Caps (internal only) */}
          {!isClientView && score?.caps_applied && score.caps_applied.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Score Caps Applied</p>
              <div className="flex flex-wrap gap-1">
                {score.caps_applied.map((cap, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {cap.type}: max {cap.cap}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* CTAs */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button className="gap-1">
              <Download className="h-3.5 w-3.5" />
              View Audit Summary
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
