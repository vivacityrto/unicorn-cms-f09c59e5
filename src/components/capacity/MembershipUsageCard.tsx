import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useMembershipUsage } from '@/hooks/useCapacityEngine';
import { Clock, AlertTriangle } from 'lucide-react';

interface MembershipUsageCardProps {
  tenantId: number;
}

export function MembershipUsageCard({ tenantId }: MembershipUsageCardProps) {
  const { data: usage, isLoading } = useMembershipUsage(tenantId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!usage || usage.included_hours_annual === 0) {
    return null; // Don't show for tiers with no included hours (Amethyst)
  }

  const isOverage = usage.percent_utilised > 100;
  const isWarning = usage.percent_utilised >= 75;
  const progressPct = Math.min(usage.percent_utilised, 100);

  const progressClass = isOverage 
    ? 'bg-red-500' 
    : isWarning 
      ? 'bg-amber-500' 
      : 'bg-green-500';

  const yearStart = new Date(usage.membership_year_start).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  const yearEnd = new Date(usage.membership_year_end).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return (
    <Card className={isOverage ? 'border-red-300 dark:border-red-700' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Membership Usage
          </CardTitle>
          <div className="flex items-center gap-2">
            {isOverage && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                Over Limit
              </Badge>
            )}
            {!isOverage && isWarning && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                {usage.percent_utilised.toFixed(0)}% used
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {usage.hours_used_ytd.toFixed(1)}h used
            </span>
            <span className="font-medium">
              {usage.included_hours_annual}h included
            </span>
          </div>
          <Progress 
            value={progressPct} 
            className="h-3"
            indicatorClassName={progressClass}
          />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 text-center bg-muted/50 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Included</p>
            <p className="text-sm font-medium">{usage.included_hours_annual}h</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Used YTD</p>
            <p className={`text-sm font-medium ${isOverage ? 'text-red-600' : ''}`}>
              {usage.hours_used_ytd.toFixed(1)}h
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-sm font-medium ${usage.hours_remaining === 0 ? 'text-red-600' : 'text-green-600'}`}>
              {usage.hours_remaining.toFixed(1)}h
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Membership year: {yearStart} — {yearEnd}
        </p>
      </CardContent>
    </Card>
  );
}
