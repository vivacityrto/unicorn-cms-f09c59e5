import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Lightbulb, ExternalLink, Flame, Briefcase, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { LeadershipRiskRadar as RiskRadarType } from '@/hooks/useLeadershipDashboard';

interface LeadershipRiskRadarProps {
  riskRadar: RiskRadarType;
  onSeatClick?: (seatId: string) => void;
}

const impactStyles: Record<string, string> = {
  'Critical': 'bg-destructive text-destructive-foreground',
  'High': 'bg-orange-500 text-white',
  'Medium': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Low': 'bg-muted text-muted-foreground',
};

export function LeadershipRiskRadar({ riskRadar, onSeatClick }: LeadershipRiskRadarProps) {
  const hasRisks = riskRadar.topRisks.length > 0;
  const hasOpportunities = riskRadar.topOpportunities.length > 0;
  const hasSeatData = riskRadar.risksBySeat.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Risks & Opportunities by Seat</CardTitle>
          <CardDescription>
            {riskRadar.seatsWithCriticalRisks > 0 && (
              <span className="text-destructive font-medium">
                {riskRadar.seatsWithCriticalRisks} seat{riskRadar.seatsWithCriticalRisks > 1 ? 's' : ''} with critical risks &gt;30 days
              </span>
            )}
            {riskRadar.seatsWithCriticalRisks === 0 && 'Items grouped by Accountability Chart ownership'}
          </CardDescription>
        </div>
        <Link 
          to="/eos/risks-opportunities"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {/* Seat-grouped summary */}
        {hasSeatData && (
          <div className="mb-6 space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Seats with Open Items</h4>
            {riskRadar.risksBySeat.slice(0, 4).map((seatGroup) => {
              const hasEscalations = seatGroup.escalatedCount > 0;
              const hasCritical = seatGroup.criticalCount > 0;
              
              return (
                <button
                  key={seatGroup.seatId}
                  onClick={() => onSeatClick?.(seatGroup.seatId)}
                  className={cn(
                    'w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors hover:bg-muted/50',
                    (hasEscalations || hasCritical) && 'border-destructive/30 bg-destructive/5'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{seatGroup.seatName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {seatGroup.openCount} open
                    </span>
                    {seatGroup.escalatedCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {seatGroup.escalatedCount} escalated
                      </Badge>
                    )}
                    {seatGroup.criticalCount > 0 && !seatGroup.escalatedCount && (
                      <Badge variant="secondary" className="text-xs">
                        {seatGroup.criticalCount} critical
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Risks Column */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h4 className="font-medium">Top Risks</h4>
              {riskRadar.escalatedCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {riskRadar.escalatedCount} Escalated
                </Badge>
              )}
            </div>
            {hasRisks ? (
              <div className="space-y-2">
                {riskRadar.topRisks.map((risk) => (
                  <Link
                    key={risk.id}
                    to={`/eos/risks-opportunities?item=${risk.id}`}
                    className={cn(
                      'block p-3 rounded-lg border transition-colors hover:bg-muted/50',
                      risk.isEscalated && 'border-destructive/50 bg-destructive/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {risk.isEscalated && (
                            <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />
                          )}
                          <span className="font-medium text-sm truncate">{risk.title}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {risk.seatName ? (
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              {risk.seatName} · {risk.ownerName}
                            </span>
                          ) : (
                            <span className="text-amber-600">No seat assigned · {risk.ownerName}</span>
                          )}
                        </div>
                        {risk.ageInDays > 30 && (
                          <div className="text-xs text-amber-600 mt-1">
                            Open for {risk.ageInDays} days
                          </div>
                        )}
                      </div>
                      <Badge className={cn('text-xs shrink-0', impactStyles[risk.impact])}>
                        {risk.impact}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No open risks
              </div>
            )}
          </div>

          {/* Opportunities Column */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <h4 className="font-medium">Top Opportunities</h4>
            </div>
            {hasOpportunities ? (
              <div className="space-y-2">
                {riskRadar.topOpportunities.map((opp) => (
                  <Link
                    key={opp.id}
                    to={`/eos/risks-opportunities?item=${opp.id}`}
                    className="block p-3 rounded-lg border transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm truncate block">{opp.title}</span>
                        <div className="text-xs text-muted-foreground mt-1">
                          {opp.seatName ? (
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              {opp.seatName} · {opp.ownerName}
                            </span>
                          ) : (
                            <span className="text-amber-600">No seat assigned · {opp.ownerName}</span>
                          )}
                        </div>
                      </div>
                      <Badge className={cn('text-xs shrink-0', impactStyles[opp.impact])}>
                        {opp.impact}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No open opportunities
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
