import { format, startOfWeek } from 'date-fns';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import { TrendSparkline } from './TrendSparkline';
import { calculateStatus } from '@/types/scorecard';
import type { ScorecardMetric, MetricStatus } from '@/types/scorecard';
import { useTenantUsers } from '@/hooks/useTenantUsers';

interface NeedsAttentionProps {
  metrics: ScorecardMetric[];
  onViewHistory: (m: ScorecardMetric) => void;
}

export function NeedsAttention({ metrics, onViewHistory }: NeedsAttentionProps) {
  const { getUserName } = useTenantUsers();
  const red = metrics.filter((m) => m.latestStatus === 'red');

  if (red.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-destructive/5 border-b border-destructive/20">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="font-semibold text-sm text-destructive">Needs Attention</span>
        <Badge className="bg-destructive text-destructive-foreground text-xs">{red.length}</Badge>
      </div>

      <div className="divide-y divide-border/50">
        {red.map((m) => {
          const latestValue = m.latestEntry
            ? (m.latestEntry.actual_value ?? m.latestEntry.value)
            : null;

          const trendStatuses: (MetricStatus | null)[] = (m.recentEntries || [])
            .slice()
            .reverse()
            .map((e) => {
              const val = e.actual_value ?? e.value;
              if (val == null) return null;
              return calculateStatus(val as number, m.target_value, m.direction);
            });

          const ownerName = m.owner_id ? getUserName(m.owner_id) : null;

          return (
            <button
              key={m.id}
              onClick={() => onViewHistory(m)}
              className="w-full grid grid-cols-[minmax(160px,2fr)_90px_80px_80px_80px_100px_120px] gap-2 items-center px-4 py-3 hover:bg-destructive/5 transition-colors text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                  <span className="font-medium text-sm truncate">{m.name}</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground truncate">{ownerName || '—'}</span>
              <Badge variant="outline" className="text-xs px-1.5 py-0.5 truncate">{m.category}</Badge>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {m.target_value} {m.unit}
              </span>
              <span className="text-sm font-semibold whitespace-nowrap">
                {latestValue != null ? `${latestValue} ${m.unit}` : '—'}
              </span>
              <StatusBadge status="red" size="sm" />
              <TrendSparkline statuses={trendStatuses} compact />
            </button>
          );
        })}
      </div>
    </div>
  );
}
