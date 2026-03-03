/**
 * ClientProgressSummary – Unicorn 2.0
 *
 * Top-level progress region for client portal home.
 * Shows phase progress, risk indicator, next best action.
 */

import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ComplianceScoreRing } from '@/components/compliance/ComplianceScoreRing';
import { useClientProgress, type ClientProgress } from '@/hooks/useClientProgress';

interface ClientProgressSummaryProps {
  tenantId: number | null;
  className?: string;
}

function riskBadge(state: string) {
  switch (state) {
    case 'action_required':
      return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />Action Required</Badge>;
    case 'needs_attention':
      return <Badge className="bg-brand-macaron text-brand-acai gap-1"><AlertTriangle className="h-3 w-3" />Needs Attention</Badge>;
    default:
      return <Badge variant="outline" className="text-primary gap-1"><CheckCircle2 className="h-3 w-3" />On Track</Badge>;
  }
}

function ProgressCard({ progress }: { progress: ClientProgress }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        {/* Header row */}
        <div className="flex items-center gap-4">
          <ComplianceScoreRing score={progress.overall_score} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{progress.package_name}</h3>
            {progress.current_phase_name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Current: {progress.current_phase_name}
              </p>
            )}
          </div>
          {riskBadge(progress.risk_state)}
        </div>

        {/* Phase progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-foreground">Stage Progress</span>
            <span className="text-xs text-muted-foreground">
              {progress.phase_completion}% • {progress.steps_remaining} step{progress.steps_remaining !== 1 ? 's' : ''} remaining
            </span>
          </div>
          <Progress value={progress.phase_completion} className="h-2" indicatorClassName="bg-primary" />
        </div>

        {/* Next Best Action */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-xs text-muted-foreground">Recommended next step</p>
            <p className="text-sm font-medium text-foreground">{progress.next_best_action_label}</p>
          </div>
          <Button size="sm" asChild>
            <Link to={progress.next_best_action_href}>
              Go <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClientProgressSummary({ tenantId, className }: ClientProgressSummaryProps) {
  const { data: progressList, isLoading } = useClientProgress(tenantId);

  if (isLoading) {
    return (
      <div className={className}>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!progressList || progressList.length === 0) return null;

  // Check for action_required risk
  const hasActionRequired = progressList.some((p) => p.risk_state === "action_required");

  return (
    <div className={className}>
      {hasActionRequired && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 mb-3">
          <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Submission Blocked</p>
            <p className="text-xs text-destructive/80">
              One or more packages require action before submission is possible.
            </p>
          </div>
        </div>
      )}
      <h2 className="text-lg font-semibold text-foreground mb-3">Your Progress</h2>
      <div className="grid grid-cols-1 gap-4">
        {progressList.map((p) => (
          <ProgressCard key={p.package_instance_id} progress={p} />
        ))}
      </div>
    </div>
  );
}
