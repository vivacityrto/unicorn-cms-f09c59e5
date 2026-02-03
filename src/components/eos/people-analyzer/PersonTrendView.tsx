import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PersonTrendSummary, CoreValueTrendSummary, PARating, PATrend } from '@/types/peopleAnalyzer';
import { RATING_CONFIG, TREND_CONFIG } from '@/types/peopleAnalyzer';

interface PersonTrendViewProps {
  summary: PersonTrendSummary;
  showSeat?: boolean;
}

export function PersonTrendView({ summary, showSeat = true }: PersonTrendViewProps) {
  const healthColors = {
    Healthy: 'text-emerald-700 dark:text-emerald-300',
    AtRisk: 'text-amber-700 dark:text-amber-300',
    Declining: 'text-red-700 dark:text-red-300',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          {summary.userName}
          {showSeat && summary.seatName && (
            <Badge variant="outline" className="text-[10px] ml-2">
              {summary.seatName}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className={cn('text-xs', healthColors[summary.overallHealth])}>
              {summary.overallHealth === 'AtRisk' ? 'At Risk' : summary.overallHealth}
            </span>
            {summary.atRiskCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {summary.atRiskCount} at risk
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.coreValues.map((cv) => (
          <CoreValueRow key={cv.core_value_id} value={cv} />
        ))}
        
        {summary.coreValues.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No Core Values data available yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CoreValueRow({ value }: { value: CoreValueTrendSummary }) {
  const TrendIcon = value.trend === 'Improving' ? TrendingUp 
    : value.trend === 'Declining' ? TrendingDown 
    : Minus;

  return (
    <div className={cn(
      'p-3 rounded-lg border',
      value.isAtRisk 
        ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' 
        : 'border-muted bg-muted/30'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{value.core_value_text}</span>
          {value.isAtRisk && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {value.consecutiveMinusCount >= 2 
                      ? `Rated Minus for ${value.consecutiveMinusCount} consecutive quarters`
                      : 'Values alignment concern'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {value.hasDivergence && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[9px] px-1">
                    Divergence
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Manager and Team Member ratings differ</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn('text-[10px]', TREND_CONFIG[value.trend].bgColor, TREND_CONFIG[value.trend].color)}>
            <TrendIcon className="h-3 w-3 mr-1" />
            {value.trend}
          </Badge>
          {value.currentRating && (
            <RatingBadge rating={value.currentRating} />
          )}
        </div>
      </div>

      {/* Sparkline of quarters */}
      <div className="flex items-center gap-1 mt-2">
        <span className="text-[10px] text-muted-foreground mr-2">Trend:</span>
        {value.quarters.slice().reverse().map((q, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger>
                <div className={cn(
                  'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold',
                  q.rating ? RATING_CONFIG[q.rating].bgColor : 'bg-muted',
                  q.rating ? RATING_CONFIG[q.rating].color : 'text-muted-foreground'
                )}>
                  {q.rating ? RATING_CONFIG[q.rating].symbol : '—'}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Q{q.quarter} {q.year}
                  {q.managerRating && ` • Manager: ${q.managerRating}`}
                  {q.teamMemberRating && ` • Team: ${q.teamMemberRating}`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
}

function RatingBadge({ rating }: { rating: PARating }) {
  const config = RATING_CONFIG[rating];
  return (
    <Badge className={cn('text-[10px]', config.bgColor, config.color, config.borderColor)}>
      {config.symbol}
    </Badge>
  );
}
