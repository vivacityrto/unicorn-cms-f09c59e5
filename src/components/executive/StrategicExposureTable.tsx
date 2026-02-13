/**
 * StrategicExposureTable – Unicorn 2.0
 *
 * Simplified, scannable exposure view. Top 15 max.
 * Renamed from Priority Queue.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DeltaChip } from './DeltaChip';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface StrategicExposureTableProps {
  data: ExecutiveHealthRow[];
  onRowClick: (row: ExecutiveHealthRow) => void;
  weeklyMode: boolean;
}

const bandOrder: Record<string, number> = { immediate_attention: 0, at_risk: 1, watch: 2, stable: 3 };

const bandVariant: Record<string, string> = {
  stable: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
  watch: 'bg-brand-aqua-100 text-brand-aqua-700 dark:bg-brand-aqua-900 dark:text-brand-aqua-200',
  at_risk: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
  immediate_attention: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
};

function TrendIcon({ value }: { value: number }) {
  if (value > 0) return <ArrowUp className="w-3 h-3 text-[hsl(275,55%,41%)]" />;
  if (value < 0) return <ArrowDown className="w-3 h-3 text-[hsl(333,86%,51%)]" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

export function StrategicExposureTable({ data, onRowClick, weeklyMode }: StrategicExposureTableProps) {
  const sorted = useMemo(() => {
    const filtered = weeklyMode
      ? data.filter(r => r.risk_band !== 'stable' || r.delta_overall_score_7d !== 0 || r.delta_operational_risk_7d !== 0)
      : data;

    return [...filtered].sort((a, b) => {
      const bandDiff = (bandOrder[a.risk_band] ?? 3) - (bandOrder[b.risk_band] ?? 3);
      if (bandDiff !== 0) return bandDiff;
      // Worsening first
      if (a.risk_band_change_7d === 'changed' && b.risk_band_change_7d !== 'changed') return -1;
      if (b.risk_band_change_7d === 'changed' && a.risk_band_change_7d !== 'changed') return 1;
      // Higher predictive increase
      if (b.delta_operational_risk_7d !== a.delta_operational_risk_7d) return b.delta_operational_risk_7d - a.delta_operational_risk_7d;
      // Then stalled
      return b.days_stale - a.days_stale;
    }).slice(0, 15);
  }, [data, weeklyMode]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Strategic Exposure</CardTitle>
        <p className="text-xs text-muted-foreground">
          {weeklyMode ? 'Showing movement only' : `Top ${sorted.length} by exposure`}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Client</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Band</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">7d Trend</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Actions</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Critical</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Stale</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr
                  key={`${row.tenant_id}-${row.package_instance_id}`}
                  className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => onRowClick(row)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground truncate max-w-[200px]">{row.client_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{row.package_name}</p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge className={cn('text-xs capitalize', bandVariant[row.risk_band] || bandVariant.stable)}>
                      {row.risk_band.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <TrendIcon value={row.delta_overall_score_7d} />
                      <DeltaChip value={row.delta_overall_score_7d} type="compliance" />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">{row.total_actions_remaining}</td>
                  <td className="px-3 py-3 text-center">
                    {row.has_active_critical && (
                      <span className="inline-block w-2 h-2 rounded-full bg-[hsl(333,86%,51%)]" title="Has critical risk" />
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-muted-foreground tabular-nums">
                    {row.days_stale > 14 ? `${row.days_stale}d` : '–'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {weeklyMode ? 'No significant movement this week.' : 'No active packages match filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
