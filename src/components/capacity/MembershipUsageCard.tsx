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
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Membership Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="text-xs">No included hours</Badge>
        </CardContent>
      </Card>
    );
  }

  const hoursUsed = usage.hours_used_ytd ?? 0;
  const hoursRemaining = usage.hours_remaining ?? 0;
  const percentUtilised = usage.percent_utilised ?? 0;

  const isOverage = percentUtilised > 100;
  const isAt90 = percentUtilised >= 90 && !isOverage;
  const isAt75 = percentUtilised >= 75 && !isAt90 && !isOverage;
  const progressPct = Math.min(percentUtilised, 100);

  const progressClass = isOverage
    ? 'bg-red-500'
    : isAt90
      ? 'bg-red-400'
      : isAt75
        ? 'bg-amber-500'
        : 'bg-green-500';

  const yearStart = usage.membership_year_start
    ? new Date(usage.membership_year_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const yearEnd = usage.membership_year_end
    ? new Date(usage.membership_year_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <Card className={isOverage ? 'border-red-300 dark:border-red-700' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Membership Usage
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {usage.tier_name && (
              <Badge variant="secondary" className="text-xs">{usage.tier_name}</Badge>
            )}
            {isOverage && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                Overage
              </Badge>
            )}
            {isAt90 && (
              <Badge className="text-xs bg-red-500/15 text-red-700 dark:text-red-400 border-red-300" variant="outline">
                90% used
              </Badge>
            )}
            {isAt75 && (
              <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300" variant="outline">
                75% used
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
              {hoursUsed.toFixed(1)}h used
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
              {hoursUsed.toFixed(1)}h
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-sm font-medium ${hoursRemaining <= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {hoursRemaining.toFixed(1)}h
            </p>
          </div>
        </div>

        {yearStart && yearEnd && (
          <p className="text-xs text-muted-foreground text-center">
            Membership year: {yearStart} — {yearEnd}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
