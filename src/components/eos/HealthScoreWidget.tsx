import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Activity, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { useEosHealth } from '@/hooks/useEosHealth';
import { HEALTH_BAND_COLORS, HEALTH_BAND_LABELS, type TrendDirection } from '@/types/eosHealth';
import { cn } from '@/lib/utils';

const TREND_ICONS: Record<TrendDirection, typeof TrendingUp> = {
  improving: TrendingUp,
  stable: Minus,
  declining: TrendingDown,
};

const TREND_COLORS: Record<TrendDirection, string> = {
  improving: 'text-emerald-600 dark:text-emerald-400',
  stable: 'text-muted-foreground',
  declining: 'text-destructive',
};

/**
 * Compact Health Score widget for EOS Overview and Facilitator sidebar.
 */
export function HealthScoreWidget() {
  const { health, isLoading } = useEosHealth();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return null;
  }

  const colors = HEALTH_BAND_COLORS[health.overallBand];
  const TrendIcon = TREND_ICONS[health.trend];

  // Find lowest scoring dimension
  const lowestDimension = [...health.dimensions].sort((a, b) => a.score - b.score)[0];

  return (
    <Card className={cn('border-2', colors.border)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className={cn('h-4 w-4', colors.text)} />
          EOS Health Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score and Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className={cn('text-4xl font-bold', colors.text)}>
              {health.overallScore}
            </span>
            <span className="text-muted-foreground text-sm">/100</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge 
              variant="outline" 
              className={cn('text-xs', colors.bg, colors.text, colors.border)}
            >
              {HEALTH_BAND_LABELS[health.overallBand]}
            </Badge>
            <div className={cn('flex items-center gap-1 text-xs', TREND_COLORS[health.trend])}>
              <TrendIcon className="h-3 w-3" />
              <span className="capitalize">{health.trend}</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <Progress value={health.overallScore} className="h-2" />

        {/* Dimension Summary */}
        <div className="grid grid-cols-5 gap-1">
          {health.dimensions.map((dim) => {
            const dimColors = HEALTH_BAND_COLORS[dim.band];
            return (
              <div 
                key={dim.dimension}
                className={cn(
                  'p-1.5 rounded text-center',
                  dimColors.bg
                )}
              >
                <div className={cn('text-xs font-semibold', dimColors.text)}>
                  {dim.score}
                </div>
                <div className="text-[9px] text-muted-foreground truncate">
                  {dim.dimension === 'cadence' && 'Cadence'}
                  {dim.dimension === 'rocks' && 'Rocks'}
                  {dim.dimension === 'ids' && 'IDS'}
                  {dim.dimension === 'people' && 'People'}
                  {dim.dimension === 'quarterly' && 'Quarterly'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lowest Dimension Alert */}
        {lowestDimension.score < 70 && lowestDimension.issues.length > 0 && (
          <div className="p-2 rounded-md bg-muted/50 text-xs">
            <p className="font-medium text-muted-foreground">
              Needs attention: {lowestDimension.label}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {lowestDimension.issues[0]?.message}
            </p>
          </div>
        )}

        {/* Link to Full Dashboard */}
        <Link to="/eos/health">
          <Button variant="outline" size="sm" className="w-full group">
            View Health Dashboard
            <ArrowRight className="ml-2 h-3 w-3 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
