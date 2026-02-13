/**
 * ExecutionMomentumPanel – Unicorn 2.0
 *
 * 7-day delivery metrics with prior-week comparison.
 * Shows neutral "Delivery slowing" note when 3+ metrics are down.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Activity, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { MomentumData } from '@/hooks/useExecutiveData';

interface ExecutionMomentumPanelProps {
  data: MomentumData | undefined;
  isLoading: boolean;
  weeklyMode: boolean;
}

interface MetricRow {
  label: string;
  current: number;
  previous: number;
  unit?: string;
}

function TrendIcon({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUp className="w-3.5 h-3.5 text-[hsl(275,55%,41%)]" />;
  if (delta < 0) return <ArrowDown className="w-3.5 h-3.5 text-[hsl(333,86%,51%)]" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function ExecutionMomentumPanel({ data, isLoading, weeklyMode }: ExecutionMomentumPanelProps) {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Execution Momentum (7d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading delivery data…</p>
        </CardContent>
      </Card>
    );
  }

  const metrics: MetricRow[] = [
    { label: 'Phases Completed', current: data.phases_completed_7d, previous: data.phases_completed_prev_7d },
    { label: 'Documents Generated', current: data.documents_generated_7d, previous: data.documents_generated_prev_7d },
    { label: 'Clients Moved Forward', current: data.clients_moved_forward_7d, previous: data.clients_moved_forward_prev_7d },
    { label: 'Rocks Closed', current: data.rocks_closed_7d, previous: data.rocks_closed_prev_7d },
    { label: 'Hours Logged', current: Number(data.hours_logged_7d), previous: Number(data.hours_logged_prev_7d), unit: 'h' },
  ];

  const decliningCount = metrics.filter(m => m.current < m.previous).length;
  const isSlowing = decliningCount >= 3;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Execution Momentum (7d)
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Current vs previous 7 days</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {metrics.map(m => {
            const delta = m.current - m.previous;
            return (
              <div key={m.label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-foreground">{m.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {m.current}{m.unit ?? ''}
                  </span>
                  <div className="flex items-center gap-1 min-w-[70px] justify-end">
                    <TrendIcon delta={delta} />
                    <span className={cn(
                      'text-xs tabular-nums',
                      delta > 0 ? 'text-[hsl(275,55%,41%)]' : delta < 0 ? 'text-[hsl(333,86%,51%)]' : 'text-muted-foreground'
                    )}>
                      {weeklyMode
                        ? `${delta > 0 ? '+' : ''}${delta}${m.unit ?? ''}`
                        : `${m.previous}${m.unit ?? ''} prev`
                      }
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {isSlowing && (
          <div className="px-4 py-2 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">Delivery slowing week-on-week.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
