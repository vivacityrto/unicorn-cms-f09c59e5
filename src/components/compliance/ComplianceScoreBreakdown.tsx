/**
 * ComplianceScoreBreakdown – Unicorn 2.0
 *
 * Displays four sub-scores with tooltips, staleness chip,
 * and human-readable caps list.
 */

import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Clock, FileWarning, ShieldAlert, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceScore } from '@/hooks/useComplianceScore';

interface ComplianceScoreBreakdownProps {
  score: ComplianceScore;
  className?: string;
}

function barColor(value: number): string {
  if (value >= 85) return 'bg-primary';
  if (value >= 70) return 'bg-brand-aqua';
  if (value >= 50) return 'bg-brand-macaron';
  return 'bg-brand-fucia';
}

const CAP_ICONS: Record<string, typeof AlertTriangle> = {
  critical_risk: ShieldAlert,
  missing_docs: FileWarning,
  phase_lock: AlertTriangle,
  staleness: Clock,
};

const CAP_LABELS: Record<string, (cap: any) => string> = {
  critical_risk: (c) => `${c.count} active critical risk${c.count > 1 ? 's' : ''} — capped at ${c.cap}`,
  missing_docs: (c) => `${c.missing_pct}% required docs missing — capped at ${c.cap}`,
  phase_lock: (c) => `Phase completion at ${c.pct}% — capped at ${c.cap}`,
  staleness: (c) => `No activity for ${c.days} days — capped at ${c.cap}`,
  consult_not_tracked: () => 'Consult hours not tracked for this package',
  phase_not_configured: () => 'Phase checklist not configured',
};

export function ComplianceScoreBreakdown({ score, className }: ComplianceScoreBreakdownProps) {
  const subScores = [
    {
      label: 'Phase Completion',
      value: score.phase_completion,
      detail: `${score.inputs.completed_stages}/${score.inputs.total_stages} stages complete`,
    },
    {
      label: 'Documentation Coverage',
      value: score.documentation_coverage,
      detail: `${score.inputs.present_docs}/${score.inputs.total_required_docs} required documents present`,
    },
    {
      label: 'Risk Health',
      value: score.risk_health,
      detail: `${score.inputs.risk_points} risk points${score.inputs.critical_risk_count > 0 ? ` (${score.inputs.critical_risk_count} critical)` : ''}`,
    },
    {
      label: 'Consult Health',
      value: score.consult_health,
      detail: `${score.inputs.hours_used}/${Number(score.inputs.hours_included) + Number(score.inputs.hours_added)} hours used`,
    },
  ];

  return (
    <div className={cn('space-y-5', className)}>
      {/* Sub-score bars */}
      <div className="space-y-3">
        {subScores.map((sub) => (
          <div key={sub.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-foreground">{sub.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                    {sub.value}%
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  {sub.detail}
                </TooltipContent>
              </Tooltip>
            </div>
            <Progress
              value={sub.value}
              className="h-1.5"
              indicatorClassName={barColor(sub.value)}
            />
          </div>
        ))}
      </div>

      {/* Staleness chip */}
      {score.days_stale > 14 && (
        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          Data last updated {score.days_stale} day{score.days_stale !== 1 ? 's' : ''} ago
        </Badge>
      )}

      {/* Caps applied */}
      {score.caps_applied.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Score caps applied</span>
          <div className="flex flex-wrap gap-1.5">
            {score.caps_applied.map((cap, idx) => {
              const Icon = CAP_ICONS[cap.type] || AlertTriangle;
              const labelFn = CAP_LABELS[cap.type];
              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <Badge variant="warning" className="gap-1 cursor-help text-xs">
                      <Icon className="h-3 w-3" />
                      Capped at {cap.cap}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {labelFn ? labelFn(cap) : `${cap.type} — capped at ${cap.cap}`}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <p className="text-xs text-muted-foreground pt-2 border-t">
        Calculated {new Date(score.calculated_at).toLocaleString()}
      </p>
    </div>
  );
}
