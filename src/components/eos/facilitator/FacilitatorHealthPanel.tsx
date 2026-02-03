import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Activity, ArrowRight, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { useEosHealth } from '@/hooks/useEosHealth';
import { HEALTH_BAND_COLORS, HEALTH_BAND_LABELS, type TrendDirection } from '@/types/eosHealth';
import { cn } from '@/lib/utils';

const TREND_ICONS: Record<TrendDirection, typeof TrendingUp> = {
  improving: TrendingUp,
  stable: Minus,
  declining: TrendingDown,
};

/**
 * Facilitator Mode panel showing EOS Health highlights.
 * Only visible when Facilitator Mode is active.
 */
export function FacilitatorHealthPanel() {
  const { isFacilitatorMode } = useFacilitatorMode();
  const { health, isLoading } = useEosHealth();

  if (!isFacilitatorMode || isLoading || !health) {
    return null;
  }

  const colors = HEALTH_BAND_COLORS[health.overallBand];
  const TrendIcon = TREND_ICONS[health.trend];

  // Find lowest dimension
  const lowestDimension = [...health.dimensions].sort((a, b) => a.score - b.score)[0];

  // Get all critical/warning issues
  const urgentIssues = health.dimensions
    .flatMap(d => d.issues.filter(i => i.severity === 'critical' || i.severity === 'warning'))
    .slice(0, 3);

  return (
    <Card className={cn('border', colors.border)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className={cn('h-4 w-4', colors.text)} />
          EOS Health
          <Badge 
            variant="outline" 
            className={cn('ml-auto text-xs', colors.bg, colors.text)}
          >
            {health.overallScore}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress */}
        <div className="space-y-1">
          <Progress value={health.overallScore} className="h-1.5" />
          <div className="flex items-center justify-between text-xs">
            <span className={cn('font-medium', colors.text)}>
              {HEALTH_BAND_LABELS[health.overallBand]}
            </span>
            <div className={cn(
              'flex items-center gap-1',
              health.trend === 'improving' ? 'text-emerald-600' :
              health.trend === 'declining' ? 'text-destructive' : 'text-muted-foreground'
            )}>
              <TrendIcon className="h-3 w-3" />
              <span className="capitalize">{health.trend}</span>
            </div>
          </div>
        </div>

        {/* Lowest Dimension */}
        {lowestDimension.score < 70 && (
          <div className="p-2 rounded-md bg-muted/50 text-xs">
            <p className="font-medium text-muted-foreground mb-1">
              Focus Area: {lowestDimension.label}
            </p>
            <div className="flex items-center justify-between">
              <span className={cn('font-semibold', HEALTH_BAND_COLORS[lowestDimension.band].text)}>
                Score: {lowestDimension.score}
              </span>
              {lowestDimension.issues[0]?.link && (
                <Link to={lowestDimension.issues[0].link}>
                  <Button size="sm" variant="ghost" className="h-5 px-2 text-xs">
                    Fix <ArrowRight className="ml-1 h-2 w-2" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Urgent Issues */}
        {urgentIssues.length > 0 && (
          <div className="space-y-1">
            {urgentIssues.slice(0, 2).map((issue, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-xs">
                <AlertCircle className={cn(
                  'h-3 w-3 mt-0.5 flex-shrink-0',
                  issue.severity === 'critical' ? 'text-destructive' : 'text-amber-600'
                )} />
                <span className="text-muted-foreground line-clamp-1">
                  {issue.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Link */}
        <Link to="/eos/health">
          <Button variant="ghost" size="sm" className="w-full text-xs h-7">
            View Health Dashboard
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
