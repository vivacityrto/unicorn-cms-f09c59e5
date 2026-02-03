import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Brain, Heart, Battery, TrendingUp, TrendingDown, Minus, User } from 'lucide-react';
import { useSeatGWCTrends } from '@/hooks/useGWCTrends';
import { GWCSparkline } from './GWCSparkline';
import { GWCStatusBadge, GWCTrendIndicator } from './GWCStatusBadge';
import { cn } from '@/lib/utils';
import type { GWCDimension } from '@/types/gwcTrends';

const DIMENSION_ICONS: Record<GWCDimension, typeof Brain> = {
  gets_it: Brain,
  wants_it: Heart,
  capacity: Battery,
};

interface SeatGWCDashboardProps {
  seatId: string;
  compact?: boolean;
}

export function SeatGWCDashboard({ seatId, compact = false }: SeatGWCDashboardProps) {
  const { data: trends, isLoading, error } = useSeatGWCTrends(seatId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className={compact ? 'pb-2' : undefined}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !trends) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No GWC trend data available for this seat.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              GWC Trends
              <GWCStatusBadge status={trends.overallStatus} />
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">{trends.functionName}</Badge>
              {trends.ownerName && (
                <span className="flex items-center gap-1 text-xs">
                  <User className="h-3 w-3" />
                  {trends.ownerName}
                </span>
              )}
            </CardDescription>
          </div>
          <GWCTrendIndicator trend={trends.overallTrend} />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Dimension Panels */}
        <div className={cn(
          'grid gap-4',
          compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'
        )}>
          {trends.dimensions.map((dim) => {
            const Icon = DIMENSION_ICONS[dim.dimension];
            const ratePercent = Math.round(dim.currentYesRate * 100);
            
            return (
              <div 
                key={dim.dimension}
                className={cn(
                  'p-4 rounded-lg border',
                  dim.status === 'strong' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20',
                  dim.status === 'watch' && 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20',
                  dim.status === 'risk' && 'border-destructive/30 bg-destructive/5',
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn(
                      'h-5 w-5',
                      dim.status === 'strong' && 'text-emerald-600',
                      dim.status === 'watch' && 'text-amber-600',
                      dim.status === 'risk' && 'text-destructive',
                    )} />
                    <div>
                      <h4 className="font-medium text-sm">{dim.label}</h4>
                      <p className="text-xs text-muted-foreground">{dim.description}</p>
                    </div>
                  </div>
                  <GWCStatusBadge status={dim.status} size="sm" showLabel={false} />
                </div>
                
                {/* Sparkline */}
                <div className="mb-2">
                  <GWCSparkline 
                    data={dim.quarterlyData} 
                    height={36}
                    width={compact ? 180 : 160}
                    showLabels={!compact}
                  />
                </div>
                
                {/* Stats */}
                <div className="flex items-center justify-between text-sm">
                  <span className={cn(
                    'font-semibold',
                    dim.status === 'strong' && 'text-emerald-700 dark:text-emerald-300',
                    dim.status === 'watch' && 'text-amber-700 dark:text-amber-300',
                    dim.status === 'risk' && 'text-destructive',
                  )}>
                    {ratePercent}%
                  </span>
                  <GWCTrendIndicator trend={dim.trend} showLabel={false} />
                </div>
                
                {/* Consecutive No warning */}
                {dim.consecutiveNo >= 2 && (
                  <p className="text-xs text-destructive mt-2">
                    "No" for {dim.consecutiveNo} consecutive quarters
                  </p>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Alerts */}
        {trends.alerts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Alerts</h4>
            {trends.alerts.slice(0, 3).map((alert) => (
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
                  {alert.message}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}
        
        {/* Context */}
        {trends.lastAssessed && (
          <p className="text-xs text-muted-foreground">
            Last assessed: {trends.lastAssessed} · {trends.totalQuarters} quarter{trends.totalQuarters !== 1 ? 's' : ''} of data
          </p>
        )}
        
        {trends.totalQuarters === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No completed Quarterly Conversations found for this seat.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
