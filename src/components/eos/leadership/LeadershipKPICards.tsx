import { Card, CardContent } from '@/components/ui/card';
import { 
  Target, 
  Mountain, 
  AlertTriangle, 
  CheckSquare,
  TrendingUp,
  TrendingDown,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { 
  LeadershipScorecardHealth, 
  LeadershipRockStatus, 
  LeadershipRiskRadar,
  LeadershipTodosDiscipline 
} from '@/hooks/useLeadershipDashboard';

interface LeadershipKPICardsProps {
  scorecardHealth: LeadershipScorecardHealth;
  rockStatus: LeadershipRockStatus;
  riskRadar: LeadershipRiskRadar;
  todosDiscipline: LeadershipTodosDiscipline;
}

export function LeadershipKPICards({
  scorecardHealth,
  rockStatus,
  riskRadar,
  todosDiscipline,
}: LeadershipKPICardsProps) {
  const cards = [
    {
      title: 'Scorecard Health',
      value: `${scorecardHealth.healthPercentage}%`,
      subtitle: `${scorecardHealth.onTrackCount} of ${scorecardHealth.totalMetrics} on track`,
      seatInfo: scorecardHealth.seatsAtRisk > 0 
        ? `${scorecardHealth.seatsAtRisk} seats at risk`
        : undefined,
      icon: Target,
      trend: scorecardHealth.trendVsLastWeek,
      isHealthy: scorecardHealth.healthPercentage >= 80,
      link: '/eos/scorecard',
    },
    {
      title: 'Rocks Status',
      value: rockStatus.totalRocks.toString(),
      subtitle: `${rockStatus.onTrack} On Track · ${rockStatus.atRisk + rockStatus.offTrack} At Risk`,
      seatInfo: rockStatus.seatsWithMultipleOffTrack > 0
        ? `${rockStatus.seatsWithMultipleOffTrack} seat${rockStatus.seatsWithMultipleOffTrack > 1 ? 's' : ''} overloaded`
        : undefined,
      icon: Mountain,
      isHealthy: rockStatus.offTrack === 0,
      link: '/eos/rocks',
    },
    {
      title: 'Open Risks',
      value: riskRadar.openRisks.toString(),
      subtitle: riskRadar.escalatedCount > 0 
        ? `${riskRadar.escalatedCount} escalated`
        : 'No escalations',
      seatInfo: riskRadar.seatsWithCriticalRisks > 0
        ? `${riskRadar.seatsWithCriticalRisks} seat${riskRadar.seatsWithCriticalRisks > 1 ? 's' : ''} with critical >30d`
        : undefined,
      icon: AlertTriangle,
      isHealthy: riskRadar.escalatedCount === 0 && riskRadar.seatsWithCriticalRisks === 0,
      link: '/eos/risks-opportunities',
    },
    {
      title: 'To-Dos Discipline',
      value: `${todosDiscipline.completionPercentage}%`,
      subtitle: todosDiscipline.overdueCount > 0
        ? `${todosDiscipline.overdueCount} overdue`
        : 'All current',
      icon: CheckSquare,
      isHealthy: todosDiscipline.completionPercentage >= 90 && todosDiscipline.overdueCount === 0,
      link: '/eos/todos',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Link key={card.title} to={card.link}>
          <Card 
            className={cn(
              'transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer h-full',
              !card.isHealthy && 'border-destructive/50'
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className={cn(
                    'text-2xl font-bold',
                    !card.isHealthy && 'text-destructive'
                  )}>
                    {card.value}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {card.subtitle}
                  </p>
                  {card.seatInfo && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                      <Briefcase className="h-3 w-3" />
                      {card.seatInfo}
                    </div>
                  )}
                  {card.trend !== undefined && card.trend !== 0 && (
                    <div className={cn(
                      'flex items-center gap-1 text-xs font-medium',
                      card.trend > 0 ? 'text-emerald-600' : 'text-destructive'
                    )}>
                      {card.trend > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(card.trend)}% vs last week
                    </div>
                  )}
                </div>
                <div className={cn(
                  'p-2.5 rounded-lg',
                  card.isHealthy 
                    ? 'bg-primary/10 text-primary' 
                    : 'bg-destructive/10 text-destructive'
                )}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
