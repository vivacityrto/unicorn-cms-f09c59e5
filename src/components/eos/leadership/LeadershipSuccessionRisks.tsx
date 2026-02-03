import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  ShieldAlert, 
  ShieldOff, 
  AlertTriangle,
  ExternalLink,
  UserX,
  Users
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { SuccessionRisk, SeatSuccessionStatus } from '@/hooks/useSeatSuccession';

interface LeadershipSuccessionRisksProps {
  risks: SuccessionRisk[];
  seatsWithActiveCover: SeatSuccessionStatus[];
  onSeatClick?: (seatId: string) => void;
}

const riskTypeConfig = {
  no_backup_critical: {
    icon: ShieldOff,
    label: 'No Backup',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
  },
  both_unavailable: {
    icon: UserX,
    label: 'Both Unavailable',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
  },
  overloaded_no_backup: {
    icon: ShieldAlert,
    label: 'Overloaded',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  same_backup_multiple: {
    icon: Users,
    label: 'Backup Overloaded',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
};

const severityColors = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-amber-500 text-white',
  low: 'bg-blue-500 text-white',
};

export function LeadershipSuccessionRisks({ 
  risks, 
  seatsWithActiveCover,
  onSeatClick 
}: LeadershipSuccessionRisksProps) {
  const highRisks = risks.filter(r => r.severity === 'high');
  const mediumRisks = risks.filter(r => r.severity === 'medium');

  if (risks.length === 0 && seatsWithActiveCover.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Shield className="h-5 w-5" />
            Succession Status
          </CardTitle>
          <CardDescription>Backup coverage and contingency health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="text-emerald-600 font-medium">✓ All seats have adequate coverage</div>
            <p className="text-xs text-muted-foreground mt-1">
              No succession risks detected
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Succession Risks
          </CardTitle>
          <CardDescription>
            {risks.length} risk{risks.length !== 1 ? 's' : ''} • {seatsWithActiveCover.length} seat{seatsWithActiveCover.length !== 1 ? 's' : ''} with active cover
          </CardDescription>
        </div>
        <Link to="/eos/accountability">
          <Button variant="outline" size="sm" className="h-7 text-xs">
            View Chart
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Cover Status */}
        {seatsWithActiveCover.length > 0 && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Active Cover ({seatsWithActiveCover.length})
              </span>
            </div>
            <div className="space-y-1">
              {seatsWithActiveCover.map(seat => (
                <button
                  key={seat.seatId}
                  onClick={() => onSeatClick?.(seat.seatId)}
                  className="flex items-center justify-between w-full p-2 rounded bg-background/80 hover:bg-background text-sm text-left transition-colors"
                >
                  <span className="font-medium">{seat.seatName}</span>
                  <span className="text-xs text-muted-foreground">
                    {seat.backupOwnerName} covering
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* High Priority Risks */}
        {highRisks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={severityColors.high}>High Priority</Badge>
              <span className="text-xs text-muted-foreground">
                Requires immediate attention
              </span>
            </div>
            <div className="space-y-2">
              {highRisks.map((risk, index) => {
                const config = riskTypeConfig[risk.type];
                const Icon = config.icon;
                
                return (
                  <button
                    key={`${risk.seatId}-${index}`}
                    onClick={() => onSeatClick?.(risk.seatId)}
                    className={cn(
                      'w-full p-3 rounded-lg border text-left transition-colors hover:bg-muted/50',
                      config.bgColor,
                      config.borderColor
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={cn('h-4 w-4 mt-0.5', config.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">
                            {risk.seatName}
                          </span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {risk.detail}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Owner: {risk.primaryOwnerName}
                          {risk.backupOwnerName && ` • Backup: ${risk.backupOwnerName}`}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Medium Priority Risks */}
        {mediumRisks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={severityColors.medium}>Medium Priority</Badge>
            </div>
            <div className="space-y-2">
              {mediumRisks.slice(0, 3).map((risk, index) => {
                const config = riskTypeConfig[risk.type];
                const Icon = config.icon;
                
                return (
                  <button
                    key={`${risk.seatId}-${index}`}
                    onClick={() => onSeatClick?.(risk.seatId)}
                    className={cn(
                      'w-full p-2 rounded-lg border text-left transition-colors hover:bg-muted/50',
                      config.bgColor,
                      config.borderColor
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                      <span className="text-sm font-medium truncate flex-1">
                        {risk.seatName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {risk.detail}
                      </span>
                    </div>
                  </button>
                );
              })}
              {mediumRisks.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{mediumRisks.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
