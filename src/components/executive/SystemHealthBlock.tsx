/**
 * SystemHealthBlock – Unicorn 2.0
 *
 * Compact data quality indicator with predictive confidence.
 */

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Database } from 'lucide-react';
import type { ExecutiveHealthRow, DeltaConfidence } from '@/hooks/useExecutiveHealth';

interface SystemHealthBlockProps {
  data: ExecutiveHealthRow[];
}

export function SystemHealthBlock({ data }: SystemHealthBlockProps) {
  if (data.length === 0) return null;

  const withSnapshot = data.filter(r => r.compliance_calculated_at != null).length;
  const snapshotPct = Math.round((withSnapshot / data.length) * 100);

  // Compliance confidence
  const compConfCounts: Record<DeltaConfidence, number> = { high: 0, medium: 0, low: 0, none: 0 };
  data.forEach(r => {
    compConfCounts[r.compliance_spark_confidence] = (compConfCounts[r.compliance_spark_confidence] ?? 0) + 1;
  });

  // Predictive confidence
  const predConfCounts: Record<DeltaConfidence, number> = { high: 0, medium: 0, low: 0, none: 0 };
  data.forEach(r => {
    predConfCounts[r.predictive_spark_confidence] = (predConfCounts[r.predictive_spark_confidence] ?? 0) + 1;
  });

  const gapCount = data.filter(r => r.compliance_spark_confidence === 'none' || r.compliance_spark_confidence === 'low').length;
  const calcFailures = data.filter(r => r.compliance_calculated_at == null && r.days_stale === 0).length;

  const overallHealth = snapshotPct >= 90 && gapCount === 0 ? 'healthy' : snapshotPct >= 70 ? 'partial' : 'degraded';

  const healthColors = {
    healthy: 'text-[hsl(275,55%,41%)]',
    partial: 'text-[hsl(48,96%,52%)]',
    degraded: 'text-[hsl(333,86%,51%)]',
  };

  const healthLabels = {
    healthy: 'Healthy',
    partial: 'Partial',
    degraded: 'Degraded',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">System Health</span>
          <span className={cn('text-xs font-semibold ml-auto', healthColors[overallHealth])}>
            {healthLabels[overallHealth]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fresh snapshots</span>
            <span className="font-semibold text-foreground tabular-nums">{snapshotPct}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Compliance density</span>
            <span className="font-semibold text-foreground tabular-nums">{compConfCounts.high} high</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Predictive density</span>
            <span className="font-semibold text-foreground tabular-nums">{predConfCounts.high} high</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data gaps</span>
            <span className={cn('font-semibold tabular-nums', gapCount > 0 ? 'text-[hsl(333,86%,51%)]' : 'text-foreground')}>{gapCount}</span>
          </div>
          {calcFailures > 0 && (
            <div className="col-span-2 flex justify-between">
              <span className="text-muted-foreground">Calc failures</span>
              <span className="font-semibold text-[hsl(333,86%,51%)] tabular-nums">{calcFailures}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
