import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScorecardEntryGrid } from '@/components/eos/ScorecardEntryGrid';
import { useScorecardMetrics } from '@/hooks/useScorecardMetrics';
import type { EosScorecardMetric } from '@/types/eos';
import { BUCKET_LABEL, classifyForReview, sortForReview, type ReviewBucket } from './scorecardReview';

interface Props {
  metrics: EosScorecardMetric[];
  /** Configuration scorecard_metric_cap: how many to-discuss metrics start expanded. The rest stay one tap away. */
  cap: number;
}

const PILL: Record<ReviewBucket, string> = {
  off_track: 'bg-destructive/10 text-destructive border-destructive/30',
  at_risk: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  stale: 'bg-muted text-muted-foreground border-border',
  no_data: 'bg-muted text-muted-foreground border-border',
  on_track: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30',
};

function formatLatest(value: number | undefined, unit: string | undefined): string {
  if (value === undefined || value === null) return 'no entry';
  return `${value}${unit && unit !== 'Count' ? ` ${unit}` : ''}`;
}

/**
 * L10 Scorecard segment body: every active metric, exceptions first.
 * Replaces "the first N metrics by display order" (which hid anything after
 * position N, including the CST metrics) with the metrics that actually
 * need the room's attention. On-track metrics stay closed.
 */
export function MeetingScorecardReview({ metrics, cap }: Props) {
  const { metrics: statusMetrics } = useScorecardMetrics();

  const rows = useMemo(() => {
    const byId = new Map(statusMetrics.map((m) => [m.id, m]));
    const now = new Date();
    return sortForReview(
      metrics.map((metric) => {
        const live = byId.get(metric.id);
        return {
          metric,
          bucket: classifyForReview(live?.latestStatus, live?.latestEntry?.week_ending, now),
          latest: live?.latestEntry ? (live.latestEntry.actual_value ?? live.latestEntry.value) : undefined,
        };
      }),
    );
  }, [metrics, statusMetrics]);

  const attention = rows.filter((r) => r.bucket !== 'on_track');
  const onTrack = rows.filter((r) => r.bucket === 'on_track');

  const [open, setOpen] = useState<Set<string> | null>(null);
  const expanded = open ?? new Set(attention.slice(0, Math.max(cap, 0)).map((r) => r.metric.id));
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{attention.length}</span> to discuss
        </span>
        <span className="text-muted-foreground">
          <span className="tabular-nums">{onTrack.length}</span> on track
        </span>
        <span className="text-muted-foreground text-xs">
          Read the number, do not discuss it. Anything off track goes to IDS or becomes a To-Do.
        </span>
      </div>

      {attention.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">Every metric is on track. Nothing to carry forward.</Card>
      )}

      {attention.map(({ metric, bucket, latest }) => {
        const isOpen = expanded.has(metric.id);
        return (
          <div key={metric.id} className="space-y-2">
            <button
              type="button"
              onClick={() => toggle(metric.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted/40"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="font-semibold min-w-0 flex-1 truncate">{metric.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                {formatLatest(latest, metric.unit)}
                {metric.target_value !== undefined && metric.target_value !== null && (
                  <> of {metric.target_value}{metric.unit && metric.unit !== 'Count' ? ` ${metric.unit}` : ''}</>
                )}
              </span>
              <Badge variant="outline" className={cn('text-xs whitespace-nowrap', PILL[bucket])}>
                {BUCKET_LABEL[bucket]}
              </Badge>
            </button>
            {isOpen && <ScorecardEntryGrid metric={metric} />}
          </div>
        );
      })}

      {onTrack.length > 0 && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold flex items-center gap-2">
            {onTrack.length} on track
            <Badge variant="outline" className={cn('text-xs', PILL.on_track)}>Closed by default</Badge>
          </summary>
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {onTrack.map(({ metric, latest }) => (
              <Badge key={metric.id} variant="outline" className={cn('text-xs', PILL.on_track)}>
                {metric.name} {formatLatest(latest, metric.unit)}
              </Badge>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
