import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp, DollarSign, ExternalLink } from 'lucide-react';
import { useTimeTracking, formatDuration } from '@/hooks/useTimeTracking';
import { useState } from 'react';
import { TimeLogDrawer } from './TimeLogDrawer';
import { Skeleton } from '@/components/ui/skeleton';

interface ClientTimeSummaryCardProps {
  clientId: number;
}

export function ClientTimeSummaryCard({ clientId }: ClientTimeSummaryCardProps) {
  const { summary, loading } = useTimeTracking(clientId);
  const [logOpen, setLogOpen] = useState(false);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalBillable = summary.billableMinutes;
  const totalNonBillable = summary.nonBillableMinutes;
  const billablePercent = totalBillable + totalNonBillable > 0
    ? Math.round((totalBillable / (totalBillable + totalNonBillable)) * 100)
    : 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Time Summary
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLogOpen(true)}>
              View all
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {/* This Week */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">This Week</p>
              <p className="text-2xl font-bold">{formatDuration(summary.thisWeek)}</p>
            </div>

            {/* This Month */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold">{formatDuration(summary.thisMonth)}</p>
            </div>

            {/* Last 90 Days */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last 90 Days</p>
              <p className="text-2xl font-bold">{formatDuration(summary.last90Days)}</p>
            </div>
          </div>

          {/* Billable breakdown */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span>Billable</span>
                <Badge variant="secondary" className="text-xs">
                  {billablePercent}%
                </Badge>
              </div>
              <span className="font-medium">{formatDuration(totalBillable)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Non-billable</span>
              </div>
              <span className="text-muted-foreground">{formatDuration(totalNonBillable)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <TimeLogDrawer
        open={logOpen}
        onOpenChange={setLogOpen}
        clientId={clientId}
      />
    </>
  );
}
