/**
 * ExecutionMomentumPanel – Unicorn 2.0
 *
 * 7-day delivery metrics with prior-week comparison.
 * Shows neutral "Delivery slowing" note when 3+ metrics are down.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Activity, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { MomentumData, SystemHealthData } from '@/hooks/useExecutiveData';
import { formatDistanceToNow } from 'date-fns';

interface ExecutionMomentumPanelProps {
  data: MomentumData[] | undefined;
  systemHealth: SystemHealthData[] | undefined;
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

export function ExecutionMomentumPanel({ data, systemHealth, isLoading, weeklyMode }: ExecutionMomentumPanelProps) {
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

  // Aggregate across all tenants
  const agg = data.reduce(
    (acc, r) => ({
      phases_completed_7d: acc.phases_completed_7d + Number(r.phases_completed_7d),
      phases_completed_prev_7d: acc.phases_completed_prev_7d + Number(r.phases_completed_prev_7d),
      documents_generated_7d: acc.documents_generated_7d + Number(r.documents_generated_7d),
      documents_generated_prev_7d: acc.documents_generated_prev_7d + Number(r.documents_generated_prev_7d),
      risks_resolved_7d: acc.risks_resolved_7d + Number(r.risks_resolved_7d),
      risks_resolved_prev_7d: acc.risks_resolved_prev_7d + Number(r.risks_resolved_prev_7d),
      document_events_7d: acc.document_events_7d + Number(r.document_events_7d),
      document_events_prev_7d: acc.document_events_prev_7d + Number(r.document_events_prev_7d),
      consult_hours_logged_7d: acc.consult_hours_logged_7d + Number(r.consult_hours_logged_7d),
      consult_hours_logged_prev_7d: acc.consult_hours_logged_prev_7d + Number(r.consult_hours_logged_prev_7d),
    }),
    {
      phases_completed_7d: 0, phases_completed_prev_7d: 0,
      documents_generated_7d: 0, documents_generated_prev_7d: 0,
      risks_resolved_7d: 0, risks_resolved_prev_7d: 0,
      document_events_7d: 0, document_events_prev_7d: 0,
      consult_hours_logged_7d: 0, consult_hours_logged_prev_7d: 0,
    }
  );

  const metrics: MetricRow[] = [
    { label: 'Phases Completed', current: agg.phases_completed_7d, previous: agg.phases_completed_prev_7d },
    { label: 'Documents Generated', current: agg.documents_generated_7d, previous: agg.documents_generated_prev_7d },
    { label: 'Document Events', current: agg.document_events_7d, previous: agg.document_events_prev_7d },
    { label: 'Risks Resolved', current: agg.risks_resolved_7d, previous: agg.risks_resolved_prev_7d },
    { label: 'Hours Logged', current: agg.consult_hours_logged_7d, previous: agg.consult_hours_logged_prev_7d, unit: 'h' },
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
        <p className="text-xs text-muted-foreground">
          {weeklyMode ? 'This week vs last week' : 'Current vs previous 7 days'}
        </p>
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
        {systemHealth && systemHealth.length > 0 && (() => {
          const totalCoverage = systemHealth.reduce((sum, s) => sum + Number(s.compliance_coverage_pct ?? 0), 0) / systemHealth.length;
          const latestAt = systemHealth
            .map(s => s.latest_compliance_snapshot_at)
            .filter(Boolean)
            .sort()
            .reverse()[0];
          const agoText = latestAt ? formatDistanceToNow(new Date(latestAt), { addSuffix: true }) : 'never';
          return (
            <div className="px-4 py-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Coverage {Math.round(totalCoverage)}%. Updated {agoText}.
              </p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
