/**
 * ComplianceScoreCard – Unicorn 2.0
 *
 * Wraps ComplianceScoreRing + ComplianceScoreBreakdown + CTA.
 * Uses brand tokens only. No hardcoded colours.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceScore } from '@/hooks/useComplianceScore';
import { ComplianceScoreRing } from './ComplianceScoreRing';
import { ComplianceScoreBreakdown } from './ComplianceScoreBreakdown';

interface ComplianceScoreCardProps {
  score: ComplianceScore | null;
  isLoading: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
  showRecalculate?: boolean;
  className?: string;
}

function scoreLabel(value: number): string {
  if (value >= 90) return 'Excellent';
  if (value >= 80) return 'Good';
  if (value >= 60) return 'Needs Attention';
  if (value >= 40) return 'At Risk';
  return 'Critical';
}

function scoreColor(value: number): string {
  if (value >= 85) return 'text-primary';
  if (value >= 70) return 'text-brand-aqua-700';
  if (value >= 50) return 'text-brand-macaron-700';
  return 'text-brand-fucia';
}

export function ComplianceScoreCard({
  score,
  isLoading,
  isRecalculating,
  onRecalculate,
  showRecalculate = true,
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
          {showRecalculate && (
            <Button size="sm" onClick={onRecalculate} isLoading={isRecalculating}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Calculate Now
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Compliance Score</CardTitle>
          {showRecalculate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRecalculate}
              isLoading={isRecalculating}
              className="h-8"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall score ring + label */}
        <div className="flex items-center gap-6">
          <ComplianceScoreRing score={score.overall_score} size="lg" />
          <div>
            <p className={cn('text-lg font-semibold', scoreColor(score.overall_score))}>
              {scoreLabel(score.overall_score)}
            </p>
          </div>
        </div>

        {/* Sub-scores, caps, staleness */}
        <ComplianceScoreBreakdown score={score} />
      </CardContent>
    </Card>
  );
}
