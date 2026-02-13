import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GWCStatus, TrendDirection } from '@/types/gwcTrends';

const STATUS_CONFIG: Record<GWCStatus, { label: string; variant: 'default' | 'warning' | 'destructive' }> = {
  strong: {
    label: 'Strong',
    variant: 'default',
  },
  watch: {
    label: 'Watch',
    variant: 'warning',
  },
  risk: {
    label: 'Risk',
    variant: 'destructive',
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
      variant={config.variant}
      className={cn(
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
    ? 'text-primary' 
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
