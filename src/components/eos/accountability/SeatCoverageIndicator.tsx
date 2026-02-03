import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { Shield, ShieldAlert, ShieldOff, UserCheck, CalendarOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatSuccessionStatus } from '@/hooks/useSeatSuccession';

interface SeatCoverageIndicatorProps {
  succession: SeatSuccessionStatus | null;
  compact?: boolean;
}

export function SeatCoverageIndicator({ succession, compact = false }: SeatCoverageIndicatorProps) {
  if (!succession) return null;

  const getStatusConfig = () => {
    if (succession.coverActive) {
      return {
        icon: UserCheck,
        label: 'Cover Active',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-950/50',
        description: `${succession.backupOwnerName} is covering while ${succession.primaryOwnerName} is on leave`,
      };
    }

    if (succession.coverageStatus === 'uncovered') {
      return {
        icon: ShieldOff,
        label: 'Uncovered',
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        description: 'No primary owner assigned',
      };
    }

    if (succession.coverageStatus === 'fully_covered') {
      if (succession.isAtRisk) {
        return {
          icon: ShieldAlert,
          label: 'At Risk',
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-100 dark:bg-amber-950/50',
          description: succession.primaryOnLeave && succession.backupOnLeave 
            ? 'Both primary and backup are unavailable'
            : 'Coverage issue detected',
        };
      }
      return {
        icon: Shield,
        label: 'Fully Covered',
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-100 dark:bg-emerald-950/50',
        description: `Backup: ${succession.backupOwnerName}`,
      };
    }

    // primary_only
    if (succession.criticalSeat) {
      return {
        icon: ShieldAlert,
        label: 'Needs Backup',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-950/50',
        description: 'Critical seat without backup coverage',
      };
    }

    return {
      icon: Shield,
      label: 'Primary Only',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      description: 'No backup owner assigned',
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('p-1 rounded', config.bgColor)}>
              <Icon className={cn('h-3 w-3', config.color)} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="text-xs">
              <p className="font-medium">{config.label}</p>
              <p className="text-muted-foreground">{config.description}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn('gap-1 text-xs', config.bgColor, config.color, 'border-transparent')}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <div className="space-y-2">
            <p className="text-xs">{config.description}</p>
            {succession.backupOwnerName && !succession.coverActive && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Backup:</span>
                <span>{succession.backupOwnerName}</span>
                {succession.backupOnLeave && (
                  <Badge variant="outline" className="text-[10px] gap-0.5 py-0 px-1">
                    <CalendarOff className="h-2 w-2" />
                    On Leave
                  </Badge>
                )}
              </div>
            )}
            {succession.primaryOnLeave && (
              <div className="flex items-center gap-1.5 text-xs">
                <CalendarOff className="h-3 w-3 text-amber-500" />
                <span>Primary is on leave</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
