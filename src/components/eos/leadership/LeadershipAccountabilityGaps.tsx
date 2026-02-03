import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Users, Briefcase, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { LeadershipAccountabilityGap } from '@/hooks/useLeadershipDashboard';

interface LeadershipAccountabilityGapsProps {
  gaps: LeadershipAccountabilityGap[];
}

const typeConfig = {
  unowned_seat: { 
    icon: Briefcase, 
    label: 'Vacant Seat', 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  overloaded_owner: { 
    icon: Users, 
    label: 'Overloaded', 
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
  },
  gwc_issue: { 
    icon: AlertCircle, 
    label: 'GWC Issue', 
    color: 'text-destructive',
    bgColor: 'bg-destructive/5',
    borderColor: 'border-destructive/30',
  },
};

export function LeadershipAccountabilityGaps({ gaps }: LeadershipAccountabilityGapsProps) {
  if (gaps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Accountability Gaps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="text-emerald-600 font-medium">✓ No gaps detected</div>
            <p className="text-xs text-muted-foreground mt-1">
              All seats are properly assigned and healthy
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group gaps by type
  const groupedGaps = gaps.reduce((acc, gap) => {
    if (!acc[gap.type]) acc[gap.type] = [];
    acc[gap.type].push(gap);
    return acc;
  }, {} as Record<string, LeadershipAccountabilityGap[]>);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-sm">Accountability Gaps</CardTitle>
          <CardDescription>
            {gaps.length} issue{gaps.length !== 1 ? 's' : ''} requiring leadership action
          </CardDescription>
        </div>
        <Link 
          to="/eos/accountability"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View Chart
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedGaps).map(([type, typeGaps]) => {
          const config = typeConfig[type as keyof typeof typeConfig];
          const Icon = config.icon;
          
          return (
            <div key={type} className={cn('p-3 rounded-lg border', config.bgColor, config.borderColor)}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', config.color)} />
                <span className={cn('text-sm font-medium', config.color)}>
                  {config.label} ({typeGaps.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {typeGaps.slice(0, 3).map((gap, index) => (
                  <Link
                    key={`${gap.seatId}-${index}`}
                    to={gap.link}
                    className="flex items-center justify-between p-2 rounded bg-background/80 hover:bg-background transition-colors text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{gap.seatName}</div>
                      <div className="text-xs text-muted-foreground">{gap.detail}</div>
                    </div>
                    {gap.ownerName && gap.type !== 'unowned_seat' && (
                      <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                        {gap.ownerName}
                      </Badge>
                    )}
                  </Link>
                ))}
                {typeGaps.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{typeGaps.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
