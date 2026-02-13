/**
 * ComplianceScoreCard – Unicorn 2.0
 *
 * Displays overall compliance score with sub-score breakdown.
 * Uses brand tokens only. No hardcoded colours.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, AlertTriangle, Clock, FileWarning, ShieldAlert, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceScore } from '@/hooks/useComplianceScore';

interface ComplianceScoreCardProps {
  score: ComplianceScore | null;
  isLoading: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
  className?: string;
}

function scoreColor(value: number): string {
  if (value >= 80) return 'text-primary';
  if (value >= 60) return 'text-brand-macaron-700';
  return 'text-destructive';
}

function scoreBg(value: number): string {
  if (value >= 80) return 'bg-primary';
  if (value >= 60) return 'bg-brand-macaron';
  return 'bg-destructive';
}

function scoreLabel(value: number): string {
  if (value >= 90) return 'Excellent';
  if (value >= 80) return 'Good';
  if (value >= 60) return 'Needs Attention';
  if (value >= 40) return 'At Risk';
  return 'Critical';
}

const CAP_ICONS: Record<string, typeof AlertTriangle> = {
  critical_risk: ShieldAlert,
  missing_docs: FileWarning,
  phase_lock: AlertTriangle,
  staleness: Clock,
};

export function ComplianceScoreCard({
  score,
  isLoading,
  isRecalculating,
  onRecalculate,
  className,
}: ComplianceScoreCardProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground text-sm">Loading score…</div>
        </CardContent>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Compliance Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">No score calculated yet.</p>
          <Button size="sm" onClick={onRecalculate} isLoading={isRecalculating}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Calculate Now
          </Button>
        </CardContent>
      </Card>
    );
  }

  const subScores = [
    { label: 'Phase Completion', value: score.phase_completion, detail: `${score.inputs.completed_stages}/${score.inputs.total_stages} stages` },
    { label: 'Documentation', value: score.documentation_coverage, detail: `${score.inputs.present_docs}/${score.inputs.total_required_docs} required docs` },
    { label: 'Risk Health', value: score.risk_health, detail: `${score.inputs.risk_points} risk points${score.inputs.critical_risk_count > 0 ? ` (${score.inputs.critical_risk_count} critical)` : ''}` },
    { label: 'Consult Usage', value: score.consult_health, detail: `${score.inputs.hours_used}/${Number(score.inputs.hours_included) + Number(score.inputs.hours_added)} hours` },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Compliance Score</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRecalculate}
            isLoading={isRecalculating}
            className="h-8"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall score ring */}
        <div className="flex items-center gap-6">
          <div className="relative flex items-center justify-center">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className="stroke-muted"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className={scoreBg(score.overall_score).replace('bg-', 'stroke-')}
                strokeWidth="3"
                strokeDasharray={`${score.overall_score}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className={cn('absolute text-xl font-bold', scoreColor(score.overall_score))}>
              {score.overall_score}
            </span>
          </div>
          <div>
            <p className={cn('text-lg font-semibold', scoreColor(score.overall_score))}>
              {scoreLabel(score.overall_score)}
            </p>
            {score.days_stale > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Data last updated {score.days_stale} day{score.days_stale !== 1 ? 's' : ''} ago
              </p>
            )}
          </div>
        </div>

        {/* Caps applied */}
        {score.caps_applied.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {score.caps_applied.map((cap, idx) => {
              const Icon = CAP_ICONS[cap.type] || AlertTriangle;
              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <Badge variant="warning" className="gap-1 cursor-help">
                      <Icon className="h-3 w-3" />
                      Capped at {cap.cap}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {cap.type === 'critical_risk' && `${cap.count} active critical risk(s)`}
                    {cap.type === 'missing_docs' && `${cap.missing_pct}% required docs missing`}
                    {cap.type === 'phase_lock' && `Phase completion at ${cap.pct}%`}
                    {cap.type === 'staleness' && `No activity for ${cap.days} days`}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Sub-scores */}
        <div className="space-y-4">
          {subScores.map((sub) => (
            <div key={sub.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{sub.label}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                      {sub.value}%
                      <Info className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{sub.detail}</TooltipContent>
                </Tooltip>
              </div>
              <Progress
                value={sub.value}
                className="h-1.5"
                indicatorClassName={cn(
                  sub.value >= 80 && 'bg-primary',
                  sub.value >= 60 && sub.value < 80 && 'bg-brand-macaron',
                  sub.value < 60 && 'bg-destructive',
                )}
              />
            </div>
          ))}
        </div>

        {/* Calculated timestamp */}
        <p className="text-xs text-muted-foreground pt-2 border-t">
          Calculated {new Date(score.calculated_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
