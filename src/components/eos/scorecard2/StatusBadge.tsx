import { cn } from '@/lib/utils';
import type { MetricStatus } from '@/types/scorecard';

interface StatusBadgeProps {
  status: MetricStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<MetricStatus, { label: string; dot: string; badge: string }> = {
  green: {
    label: 'On Track',
    dot: 'bg-green-500',
    badge: 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20',
  },
  red: {
    label: 'Off Track',
    dot: 'bg-destructive',
    badge: 'bg-destructive/10 text-destructive border border-destructive/20',
  },
  amber: {
    label: 'At Risk',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
  },
  no_data: {
    label: 'No Data',
    dot: 'bg-muted-foreground/30',
    badge: 'bg-muted text-muted-foreground border border-border',
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = CONFIG[status] || CONFIG.no_data;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        cfg.badge,
      )}
    >
      <span className={cn('inline-block rounded-full flex-shrink-0', cfg.dot, size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      {cfg.label}
    </span>
  );
}
