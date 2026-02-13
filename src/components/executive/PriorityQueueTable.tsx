/**
 * PriorityQueueTable – Unicorn 2.0
 *
 * Sorted table with 7-day delta chips and 30-day sparklines.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DeltaChip } from './DeltaChip';
import { SparklineMini } from './SparklineMini';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface PriorityQueueTableProps {
  data: ExecutiveHealthRow[];
  onRowClick: (row: ExecutiveHealthRow) => void;
}

const bandOrder: Record<string, number> = { immediate_attention: 0, at_risk: 1, watch: 2, stable: 3 };

const bandVariant: Record<string, string> = {
  stable: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
  watch: 'bg-brand-aqua-100 text-brand-aqua-700 dark:bg-brand-aqua-900 dark:text-brand-aqua-200',
  at_risk: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
  immediate_attention: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
};

export function PriorityQueueTable({ data, onRowClick }: PriorityQueueTableProps) {
  const sorted = useMemo(() =>
    [...data].sort((a, b) => {
      const bandDiff = (bandOrder[a.risk_band] ?? 3) - (bandOrder[b.risk_band] ?? 3);
      if (bandDiff !== 0) return bandDiff;
      if (b.operational_risk_score !== a.operational_risk_score) return b.operational_risk_score - a.operational_risk_score;
      if (a.overall_score !== b.overall_score) return a.overall_score - b.overall_score;
      return b.days_stale - a.days_stale;
    }), [data]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Priority Queue</CardTitle>
        <p className="text-xs text-muted-foreground">{sorted.length} active packages</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Package</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Score</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">30d</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Band</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Actions</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Docs</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Hours</th>
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
                  <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{row.client_name}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{row.package_name}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-semibold">{row.overall_score}%</span>
                    <DeltaChip value={row.delta_overall_score_7d} type="compliance" className="ml-1" />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <SparklineMini
                      values={row.compliance_spark_scores ?? []}
                      confidence={row.compliance_spark_confidence}
                      kind="compliance"
                      height={24}
                      width={72}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge className={cn('text-xs capitalize', bandVariant[row.risk_band] || bandVariant.stable)}>
                      {row.risk_band.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-center">{row.total_actions_remaining}</td>
                  <td className="px-3 py-3 text-center">{row.documents_pending_upload}</td>
                  <td className="px-3 py-3 text-center">{row.hours_remaining}h</td>
                  <td className="px-3 py-3 text-center">
                    {row.has_active_critical && (
                      <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--brand-fuchsia-600))]" title="Has critical risk" />
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-muted-foreground">
                    {row.days_stale}d
                    <DeltaChip value={row.delta_days_stale_7d} type="stale" className="ml-1" />
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No active packages match your filters.
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
