/**
 * SystemHealthBlock – Unicorn 2.0
 *
 * Compact data quality indicator. Prevents false confidence.
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

  // Aggregate confidence
  const confCounts: Record<DeltaConfidence, number> = { high: 0, medium: 0, low: 0, none: 0 };
  data.forEach(r => {
    confCounts[r.compliance_spark_confidence] = (confCounts[r.compliance_spark_confidence] ?? 0) + 1;
  });

  const gapCount = data.filter(r => r.compliance_spark_confidence === 'none' || r.compliance_spark_confidence === 'low').length;

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
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">System Health</span>
          <span className={cn('text-xs font-semibold ml-auto', healthColors[overallHealth])}>
            {healthLabels[overallHealth]}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-foreground tabular-nums">{snapshotPct}%</p>
            <p className="text-[10px] text-muted-foreground">Active snapshots</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground tabular-nums">{confCounts.high}</p>
            <p className="text-[10px] text-muted-foreground">High density</p>
          </div>
          <div>
            <p className={cn('text-lg font-bold tabular-nums', gapCount > 0 ? 'text-[hsl(333,86%,51%)]' : 'text-foreground')}>{gapCount}</p>
            <p className="text-[10px] text-muted-foreground">Data gaps</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
