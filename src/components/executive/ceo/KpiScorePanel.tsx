/**
 * KpiScorePanel – CEO Dashboard Panel I
 * Rolling 30-day KPI composite score
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, BarChart3, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { KpiScore } from '@/hooks/useCeoDashboard';

interface Props {
  score: KpiScore;
}

function ScoreBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color = value >= 85 ? 'bg-green-500' : value >= 70 ? 'bg-[hsl(var(--brand-macaron))]' : 'bg-[hsl(var(--brand-fuchsia))]';
  const textColor = value >= 85 ? 'text-green-600' : value >= 70 ? 'text-[hsl(var(--brand-macaron))]' : 'text-[hsl(var(--brand-fuchsia))]';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label} <span className="opacity-60">({weight})</span></span>
        <span className={cn('text-xs font-bold tabular-nums', textColor)}>{value}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function KpiScorePanel({ score }: Props) {
  const [open, setOpen] = useState(true);

  const overallColor = score.overall >= 85 ? 'text-green-600' : score.overall >= 70 ? 'text-[hsl(var(--brand-macaron))]' : 'text-[hsl(var(--brand-fuchsia))]';
  const needsIntervention = score.overall < 85;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn(needsIntervention && 'ring-1 ring-[hsl(var(--brand-fuchsia))]/20')}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">KPI Score</CardTitle>
              {needsIntervention && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--brand-fuchsia))]">
                  <AlertTriangle className="w-3 h-3" /> Intervention required
                </span>
              )}
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="text-center">
              <p className={cn('text-3xl font-bold tabular-nums', overallColor)}>{score.overall}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall Score</p>
            </div>
            <div className="space-y-2">
              <ScoreBar label="EOS Execution" value={score.eosExecution} weight="30%" />
              <ScoreBar label="Unicorn Integrity" value={score.unicornIntegrity} weight="25%" />
              <ScoreBar label="CEO Relief" value={score.ceoRelief} weight="25%" />
              <ScoreBar label="Financial Accuracy" value={score.financialAccuracy} weight="20%" />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
