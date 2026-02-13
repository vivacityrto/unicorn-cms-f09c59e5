/**
 * EosDisciplinePanel – CEO Dashboard Panel B
 * Weekly To-Do completion rate with 4-week rolling average
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { TodoStats } from '@/hooks/useCeoDashboard';

interface Props {
  stats: TodoStats | undefined;
  isLoading: boolean;
}

function getRateColor(rate: number) {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 80) return 'text-[hsl(var(--brand-macaron))]';
  return 'text-[hsl(var(--brand-fuchsia))]';
}

function getRateBg(rate: number) {
  if (rate >= 90) return 'bg-green-500';
  if (rate >= 80) return 'bg-[hsl(var(--brand-macaron))]';
  return 'bg-[hsl(var(--brand-fuchsia))]';
}

export function EosDisciplinePanel({ stats, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading || !stats) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">EOS Discipline</CardTitle></CardHeader>
        <CardContent className="h-24" />
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">EOS Discipline</CardTitle>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">This Week</p>
                <p className={cn('text-2xl font-bold tabular-nums', getRateColor(stats.completionRate))}>
                  {stats.completionRate}%
                </p>
                <p className="text-xs text-muted-foreground">{stats.completedThisWeek}/{stats.totalThisWeek} done</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">4-Week Rolling</p>
                <p className={cn('text-2xl font-bold tabular-nums', getRateColor(stats.rollingAvg4w))}>
                  {stats.rollingAvg4w}%
                </p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getRateBg(stats.completionRate))}
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
