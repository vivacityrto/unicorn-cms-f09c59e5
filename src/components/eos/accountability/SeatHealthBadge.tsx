import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Gauge, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatHealthScore, HealthBand, ContributingFactor } from '@/types/seatHealth';
import { HEALTH_BAND_CONFIG, CAPACITY_STATUS_LABELS } from '@/types/seatHealth';

interface SeatHealthBadgeProps {
  health?: SeatHealthScore;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}

export function SeatHealthBadge({ health, size = 'sm', showTooltip = true }: SeatHealthBadgeProps) {
  if (!health) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] px-1.5 gap-0.5 text-muted-foreground">
              <Gauge className="h-2.5 w-2.5" />
              --
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Capacity not calculated yet</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const config = HEALTH_BAND_CONFIG[health.health_band];
  const statusLabel = CAPACITY_STATUS_LABELS[health.health_band];
  const Icon = health.health_band === 'healthy' 
    ? CheckCircle2 
    : health.health_band === 'at_risk' 
    ? AlertTriangle 
    : AlertCircle;

  const badge = (
    <Badge 
      variant="outline"
      className={cn(
        'gap-0.5 border',
        config.bgColor,
        config.color,
        config.borderColor,
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'
      )}
    >
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {config.label}
    </Badge>
  );

  if (!showTooltip || health.contributing_factors.length === 0) {
    return badge;
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {badge}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="top">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{statusLabel}</span>
            <span className="text-xs text-muted-foreground">
              Score: {health.total_score}/100
            </span>
          </div>
          
          {/* Score interpretation */}
          <p className="text-xs text-muted-foreground">
            {health.health_band === 'healthy' && 'This seat has sustainable capacity to meet its accountabilities.'}
            {health.health_band === 'at_risk' && 'This seat may be approaching capacity limits. Monitor closely.'}
            {health.health_band === 'overloaded' && 'This seat is overloaded. Consider reducing scope or adding support.'}
          </p>
          
          <div className="text-xs text-muted-foreground">
            Contributing factors:
          </div>
          
          <ul className="space-y-1.5">
            {health.contributing_factors.map((factor, i) => (
              <ContributingFactorItem key={i} factor={factor} />
            ))}
          </ul>
          
          {/* Suggested action */}
          {health.health_band !== 'healthy' && (
            <p className="text-xs font-medium text-muted-foreground border-t pt-2">
              Suggested: Review in next Quarterly Conversation
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function ContributingFactorItem({ factor }: { factor: ContributingFactor }) {
  const severityColors = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-500',
  };

  return (
    <li className="flex items-start gap-2">
      <span 
        className={cn(
          'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
          severityColors[factor.severity]
        )} 
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{factor.label}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {factor.description}
        </p>
      </div>
    </li>
  );
}
