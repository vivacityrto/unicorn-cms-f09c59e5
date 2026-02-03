import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Brain, Heart, Battery, Users } from 'lucide-react';
import { useTenantGWCTrends } from '@/hooks/useGWCTrends';
import { GWCStatusBadge } from './GWCStatusBadge';
import { cn } from '@/lib/utils';
import type { GWCDimension } from '@/types/gwcTrends';

const DIMENSION_ICONS: Record<GWCDimension, typeof Brain> = {
  gets_it: Brain,
  wants_it: Heart,
  capacity: Battery,
};

const DIMENSION_LABELS: Record<GWCDimension, string> = {
  gets_it: 'Get It',
  wants_it: 'Want It',
  capacity: 'Capacity',
};

export function TenantGWCSummary() {
  const { data: summary, isLoading, error } = useTenantGWCTrends();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !summary) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load GWC summary data.
        </CardContent>
      </Card>
    );
  }

  const totalWithStatus = summary.strongCount + summary.watchCount + summary.riskCount;
  const strongPercent = totalWithStatus > 0 ? (summary.strongCount / totalWithStatus) * 100 : 0;
  const watchPercent = totalWithStatus > 0 ? (summary.watchCount / totalWithStatus) * 100 : 0;
  const riskPercent = totalWithStatus > 0 ? (summary.riskCount / totalWithStatus) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          Organization GWC Overview
        </CardTitle>
        <CardDescription>
          {summary.seatsWithData} of {summary.totalSeats} seats with GWC data
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Status Distribution */}
        <div>
          <h4 className="text-sm font-medium mb-3">Seat Status Distribution</h4>
          <div className="flex gap-2 mb-2">
            <div className="flex-1 h-3 rounded-full overflow-hidden bg-muted flex">
              <div 
                className="bg-emerald-500 transition-all" 
                style={{ width: `${strongPercent}%` }} 
              />
              <div 
                className="bg-amber-500 transition-all" 
                style={{ width: `${watchPercent}%` }} 
              />
              <div 
                className="bg-destructive transition-all" 
                style={{ width: `${riskPercent}%` }} 
              />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Strong</span>
              <Badge variant="outline" className="text-xs">{summary.strongCount}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Watch</span>
              <Badge variant="outline" className="text-xs">{summary.watchCount}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Risk</span>
              <Badge variant="outline" className="text-xs">{summary.riskCount}</Badge>
            </div>
          </div>
        </div>

        {/* Dimension Summary */}
        <div>
          <h4 className="text-sm font-medium mb-3">Dimension Health</h4>
          <div className="grid gap-3">
            {summary.dimensionSummary.map((dim) => {
              const Icon = DIMENSION_ICONS[dim.dimension];
              const avgPercent = Math.round(dim.avgYesRate * 100);
              const isHealthy = avgPercent >= 80;
              const isWatch = avgPercent >= 50 && avgPercent < 80;
              
              return (
                <div key={dim.dimension} className="flex items-center gap-3">
                  <Icon className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isHealthy && 'text-emerald-600',
                    isWatch && 'text-amber-600',
                    !isHealthy && !isWatch && 'text-destructive',
                  )} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{DIMENSION_LABELS[dim.dimension]}</span>
                      <span className={cn(
                        'text-sm font-medium',
                        isHealthy && 'text-emerald-600',
                        isWatch && 'text-amber-600',
                        !isHealthy && !isWatch && 'text-destructive',
                      )}>
                        {avgPercent}%
                      </span>
                    </div>
                    <Progress 
                      value={avgPercent} 
                      className={cn(
                        'h-1.5',
                        isHealthy && '[&>div]:bg-emerald-500',
                        isWatch && '[&>div]:bg-amber-500',
                        !isHealthy && !isWatch && '[&>div]:bg-destructive',
                      )}
                    />
                  </div>
                  {dim.riskCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {dim.riskCount} at risk
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Alerts */}
        {summary.topAlerts.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Priority Alerts</h4>
            <div className="space-y-2">
              {summary.topAlerts.slice(0, 3).map((alert) => (
                <Alert 
                  key={alert.id}
                  variant={alert.severity === 'high' ? 'destructive' : 'default'}
                  className={cn(
                    'py-2',
                    alert.severity === 'medium' && 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                  )}
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium">{alert.seatName}:</span> {alert.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {summary.seatsWithData === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Complete Quarterly Conversations with GWC assessments to see trend data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
