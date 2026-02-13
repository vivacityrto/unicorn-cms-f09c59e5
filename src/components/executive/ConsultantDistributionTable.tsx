/**
 * ConsultantDistributionTable – Unicorn 2.0
 *
 * Load and exposure view by consultant. Not ranking.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { ConsultantDistRow } from '@/hooks/useExecutiveData';

interface ConsultantDistributionTableProps {
  data: ConsultantDistRow[];
  isLoading: boolean;
}

function TrendChip({ value }: { value: number }) {
  if (value === 0) return <Minus className="w-3 h-3 text-muted-foreground" />;
  return value > 0
    ? <ArrowUp className="w-3 h-3 text-[hsl(275,55%,41%)]" />
    : <ArrowDown className="w-3 h-3 text-[hsl(333,86%,51%)]" />;
}

export function ConsultantDistributionTable({ data, isLoading }: ConsultantDistributionTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Consultant Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Consultant Distribution</CardTitle>
        <p className="text-xs text-muted-foreground">Load and exposure by consultant</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Consultant</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Clients</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Immediate</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">At Risk</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Stalled</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Avg Score</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Trend</th>
              </tr>
            </thead>
            <tbody>
              {data.map(c => {
                const exposureCount = c.immediate_count + c.at_risk_count;
                return (
                  <tr key={c.consultant_uuid} className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    exposureCount > 0 ? 'bg-brand-fuchsia-50/30 dark:bg-brand-fuchsia-950/10' : ''
                  )}>
                    <td className="px-4 py-3 font-medium text-foreground">{c.consultant_name}</td>
                    <td className="px-3 py-3 text-center tabular-nums">{c.client_count}</td>
                    <td className={cn('px-3 py-3 text-center tabular-nums font-semibold', c.immediate_count > 0 ? 'text-[hsl(333,86%,51%)]' : 'text-muted-foreground')}>
                      {c.immediate_count}
                    </td>
                    <td className={cn('px-3 py-3 text-center tabular-nums font-semibold', c.at_risk_count > 0 ? 'text-[hsl(48,96%,52%)]' : 'text-muted-foreground')}>
                      {c.at_risk_count}
                    </td>
                    <td className={cn('px-3 py-3 text-center tabular-nums', c.stalled_count > 0 ? 'text-[hsl(190,74%,50%)] font-semibold' : 'text-muted-foreground')}>
                      {c.stalled_count}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">{c.avg_score}%</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TrendChip value={c.avg_score_delta_7d} />
                        {c.avg_score_delta_7d !== 0 && (
                          <span className="text-xs tabular-nums text-muted-foreground">{c.avg_score_delta_7d > 0 ? '+' : ''}{c.avg_score_delta_7d}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No consultant data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
