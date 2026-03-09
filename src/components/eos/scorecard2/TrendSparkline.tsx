import { cn } from '@/lib/utils';
import type { MetricStatus } from '@/types/scorecard';

interface TrendSparklineProps {
  /** Statuses in chronological order (oldest → newest), max 13 */
  statuses: (MetricStatus | null)[];
  compact?: boolean;
}

const DOT: Record<MetricStatus, string> = {
  green: 'bg-green-500',
  red: 'bg-destructive',
  amber: 'bg-amber-500',
  no_data: 'bg-muted-foreground/20',
};

export function TrendSparkline({ statuses, compact = false }: TrendSparklineProps) {
  const dots = statuses.slice(-13);

  return (
    <div className={cn('flex items-center gap-0.5', compact ? 'gap-[2px]' : 'gap-1')}>
      {dots.map((s, i) => (
        <span
          key={i}
          title={s || 'No data'}
          className={cn(
            'rounded-sm flex-shrink-0',
            compact ? 'h-3 w-1.5' : 'h-4 w-2',
            s ? DOT[s] : DOT.no_data,
          )}
        />
      ))}
      {dots.length === 0 && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}
