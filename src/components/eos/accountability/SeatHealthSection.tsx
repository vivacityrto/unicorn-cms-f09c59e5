import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  Target,
  CheckSquare,
  AlertCircle,
  Calendar,
  Users,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatHealthScore, ContributingFactor } from '@/types/seatHealth';
import { HEALTH_BAND_CONFIG, SCORE_WEIGHTS } from '@/types/seatHealth';
import { SeatHealthBadge } from './SeatHealthBadge';

interface SeatHealthSectionProps {
  health?: SeatHealthScore;
  onNavigate?: (type: 'rocks' | 'todos' | 'issues' | 'meetings') => void;
}

export function SeatHealthSection({ health, onNavigate }: SeatHealthSectionProps) {
  if (!health) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Seat Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Health score has not been calculated yet. Scores are calculated nightly.
          </p>
        </CardContent>
      </Card>
    );
  }

  const config = HEALTH_BAND_CONFIG[health.health_band];

  const scoreBreakdown = [
    { 
      label: 'Rocks', 
      score: health.rocks_score, 
      weight: SCORE_WEIGHTS.rocks * 100,
      icon: Target,
      type: 'rocks' as const,
    },
    { 
      label: 'To-Dos', 
      score: health.todos_score, 
      weight: SCORE_WEIGHTS.todos * 100,
      icon: CheckSquare,
      type: 'todos' as const,
    },
    { 
      label: 'IDS', 
      score: health.ids_score, 
      weight: SCORE_WEIGHTS.ids * 100,
      icon: AlertCircle,
      type: 'issues' as const,
    },
    { 
      label: 'Cadence', 
      score: health.cadence_score, 
      weight: SCORE_WEIGHTS.cadence * 100,
      icon: Calendar,
      type: 'meetings' as const,
    },
    { 
      label: 'GWC', 
      score: health.gwc_score, 
      weight: SCORE_WEIGHTS.gwc * 100,
      icon: Users,
      type: null,
    },
  ];

  const getScoreColor = (score: number) => {
    if (score <= 30) return 'text-emerald-600';
    if (score <= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number) => {
    if (score <= 30) return 'bg-emerald-500';
    if (score <= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Seat Health
          </CardTitle>
          <SeatHealthBadge health={health} size="md" showTooltip={false} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className={cn(
          'p-3 rounded-lg border',
          config.bgColor,
          config.borderColor
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className={cn('text-sm font-medium', config.color)}>
              Overall Health Score
            </span>
            <span className={cn('text-lg font-bold', config.color)}>
              {health.total_score}/100
            </span>
          </div>
          <Progress 
            value={health.total_score} 
            className="h-2"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Lower is better. Scores above 70 indicate overload.
          </p>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Score Breakdown
          </h4>
          {scoreBreakdown.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs">{item.label}</span>
                  <span className={cn('text-xs font-medium', getScoreColor(item.score))}>
                    {item.score}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn('h-full rounded-full', getProgressColor(item.score))}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {item.weight}%
              </span>
              {item.type && onNavigate && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5 shrink-0"
                  onClick={() => onNavigate(item.type!)}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Contributing Factors */}
        {health.contributing_factors.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Key Drivers
              </h4>
              {health.contributing_factors.map((factor, i) => (
                <FactorCard key={i} factor={factor} onNavigate={onNavigate} />
              ))}
            </div>
          </>
        )}

        {/* Last Calculated */}
        <p className="text-[10px] text-muted-foreground text-right">
          Last calculated: {new Date(health.calculated_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

function FactorCard({ 
  factor, 
  onNavigate 
}: { 
  factor: ContributingFactor;
  onNavigate?: (type: 'rocks' | 'todos' | 'issues' | 'meetings') => void;
}) {
  const severityConfig = {
    high: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-900', text: 'text-red-700 dark:text-red-300' },
    medium: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900', text: 'text-amber-700 dark:text-amber-300' },
    low: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  };

  const config = severityConfig[factor.severity];
  
  const navigationType = factor.type === 'rocks' ? 'rocks' 
    : factor.type === 'todos' ? 'todos'
    : factor.type === 'ids' ? 'issues'
    : factor.type === 'cadence' ? 'meetings'
    : null;

  return (
    <div className={cn(
      'flex items-center gap-2 p-2 rounded-lg border',
      config.bg,
      config.border
    )}>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium', config.text)}>{factor.label}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {factor.description}
        </p>
      </div>
      {navigationType && onNavigate && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 gap-1 shrink-0"
          onClick={() => onNavigate(navigationType)}
        >
          View
          <ArrowRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
