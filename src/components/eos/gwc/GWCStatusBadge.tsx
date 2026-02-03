import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GWCStatus, TrendDirection } from '@/types/gwcTrends';

const STATUS_CONFIG: Record<GWCStatus, { label: string; className: string }> = {
  strong: {
    label: 'Strong',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  },
  watch: {
    label: 'Watch',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  },
  risk: {
    label: 'Risk',
    className: 'bg-destructive/10 text-destructive border-destructive/30',
  },
};

const TREND_ICONS: Record<TrendDirection, typeof TrendingUp> = {
  improving: TrendingUp,
  stable: Minus,
  declining: TrendingDown,
};

interface GWCStatusBadgeProps {
  status: GWCStatus;
  showLabel?: boolean;
  size?: 'sm' | 'default';
  className?: string;
}

export function GWCStatusBadge({ 
  status, 
  showLabel = true, 
  size = 'default',
  className 
}: GWCStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        config.className,
        size === 'sm' && 'text-[10px] px-1.5 py-0',
        className
      )}
    >
      {showLabel && config.label}
    </Badge>
  );
}

interface GWCTrendIndicatorProps {
  trend: TrendDirection;
  showLabel?: boolean;
  className?: string;
}

export function GWCTrendIndicator({ 
  trend, 
  showLabel = true,
  className 
}: GWCTrendIndicatorProps) {
  const Icon = TREND_ICONS[trend];
  
  const colorClass = trend === 'improving' 
    ? 'text-emerald-600' 
    : trend === 'declining' 
      ? 'text-destructive' 
      : 'text-muted-foreground';
  
  return (
    <div className={cn('flex items-center gap-1', colorClass, className)}>
      <Icon className="h-3.5 w-3.5" />
      {showLabel && (
        <span className="text-xs capitalize">{trend}</span>
      )}
    </div>
  );
}
