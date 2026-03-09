import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, RefreshCw } from 'lucide-react';
import { format, startOfWeek, subWeeks, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { calculateStatus } from '@/types/scorecard';
import { DIRECTION_LABELS, DIRECTION_PREVIEW } from '@/types/scorecard';
import type { ScorecardMetric, MetricStatus } from '@/types/scorecard';
import { useTenantUsers } from '@/hooks/useTenantUsers';

interface MetricDetailDrawerProps {
  metric: ScorecardMetric | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (m: ScorecardMetric) => void;
}

const STATUS_CELL: Record<MetricStatus, string> = {
  green: 'bg-green-500/20 text-green-700 dark:text-green-400',
  red: 'bg-destructive/20 text-destructive',
  amber: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  no_data: 'bg-muted text-muted-foreground',
};

export function MetricDetailDrawer({ metric, open, onOpenChange, onEdit }: MetricDetailDrawerProps) {
  const { getUserName } = useTenantUsers();

  if (!metric) return null;

  // Generate last 13 weeks
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const d = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  const entryByWeek = new Map(
    (metric.recentEntries || []).map((e) => [e.week_ending, e]),
  );

  const ownerName = metric.owner_id ? getUserName(metric.owner_id) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold truncate">{metric.name}</SheetTitle>
              {metric.description && (
                <p className="text-sm text-muted-foreground mt-1">{metric.description}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => onEdit(metric)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-6 pt-4">
          {/* Definition */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metric Definition
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Category</span>
                <Badge variant="outline" className="mt-0.5">{metric.category}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Owner</span>
                <span className="font-medium">{ownerName || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Target</span>
                <span className="font-semibold">{metric.target_value} {metric.unit}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Frequency</span>
                <span className="capitalize">{metric.frequency}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground block text-xs">Success Condition</span>
                <span>{DIRECTION_LABELS[metric.direction]}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {DIRECTION_PREVIEW[metric.direction]}
                </span>
              </div>
              {metric.metric_key && (
                <div>
                  <span className="text-muted-foreground block text-xs">Metric Key</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{metric.metric_key}</code>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block text-xs">Source</span>
                <Badge
                  variant="secondary"
                  className={cn(metric.metric_source === 'automatic' && 'bg-primary/10 text-primary')}
                >
                  {metric.metric_source}
                  {metric.metric_source === 'automatic' && (
                    <RefreshCw className="h-3 w-3 ml-1 inline-block" />
                  )}
                </Badge>
              </div>
            </div>
          </section>

          {/* Current status */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Current Status
            </h3>
            <StatusBadge status={metric.latestStatus || 'no_data'} />
            {metric.latestEntry && (
              <p className="text-sm text-muted-foreground mt-1">
                Latest: <strong>{metric.latestEntry.actual_value ?? metric.latestEntry.value} {metric.unit}</strong>{' '}
                for week ending {format(parseISO(metric.latestEntry.week_ending), 'MMM d, yyyy')}
              </p>
            )}
          </section>

          {/* 13-Week History Table */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              13-Week History
            </h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Week Ending</th>
                    <th className="text-right px-3 py-2 font-medium">Value</th>
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {weeks.map((w) => {
                    const entry = entryByWeek.get(w);
                    const val = entry ? (entry.actual_value ?? entry.value) : null;
                    const st: MetricStatus = val != null
                      ? calculateStatus(val as number, metric.target_value, metric.direction)
                      : 'no_data';

                    return (
                      <tr key={w} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{format(parseISO(w), 'MMM d')}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {val != null ? `${val} ${metric.unit}` : <span className="text-muted-foreground italic">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {val != null ? (
                            <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_CELL[st])}>
                              {st === 'green' ? 'On Track' : st === 'red' ? 'Off Track' : st === 'amber' ? 'At Risk' : '—'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                          {entry?.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
