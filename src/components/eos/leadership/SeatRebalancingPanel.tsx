import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Scale, 
  UserPlus, 
  ArrowRight,
  Briefcase,
  AlertTriangle,
  Lightbulb,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { LeadershipSeat } from '@/hooks/useLeadershipDashboard';

export interface RebalancingRecommendation {
  type: 'uncovered_seat' | 'overloaded_owner';
  seatId: string;
  seatName: string;
  reason: string;
  candidates?: {
    userId: string;
    userName: string;
    currentSeatCount: number;
    rationale: string;
  }[];
  seatsToReassign?: {
    seatId: string;
    seatName: string;
    activityScore: number; // Lower = less activity, better to reassign
    rationale: string;
  }[];
}

interface SeatRebalancingPanelProps {
  recommendations: RebalancingRecommendation[];
  seats: LeadershipSeat[];
}

export function SeatRebalancingPanel({ recommendations, seats }: SeatRebalancingPanelProps) {
  if (recommendations.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Scale className="h-5 w-5" />
            Seat Rebalancing
          </CardTitle>
          <CardDescription>Suggestions for optimizing accountability distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="text-emerald-600 font-medium">✓ Seats are balanced</div>
            <p className="text-xs text-muted-foreground mt-1">
              No rebalancing recommendations at this time
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Seat Rebalancing
          </CardTitle>
          <CardDescription>
            {recommendations.length} suggestion{recommendations.length !== 1 ? 's' : ''} for optimizing accountability
          </CardDescription>
        </div>
        <Badge variant="outline" className="text-xs">
          Suggestions Only
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendations.map((rec, index) => (
          <div 
            key={`${rec.seatId}-${index}`}
            className={cn(
              'p-4 rounded-lg border',
              rec.type === 'uncovered_seat' 
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
                : 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20'
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                {rec.type === 'uncovered_seat' ? (
                  <UserPlus className="h-4 w-4 text-amber-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                )}
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    {rec.seatName}
                  </div>
                  <div className="text-sm text-muted-foreground">{rec.reason}</div>
                </div>
              </div>
              <Link to={`/eos/accountability?seat=${rec.seatId}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Open Seat
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>

            {/* Candidates for uncovered seats */}
            {rec.type === 'uncovered_seat' && rec.candidates && rec.candidates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lightbulb className="h-3 w-3" />
                  Suggested candidates:
                </div>
                <div className="grid gap-2">
                  {rec.candidates.slice(0, 3).map((candidate, candIndex) => (
                    <div 
                      key={candidate.userId}
                      className="flex items-center justify-between p-2 rounded bg-background/80 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{candIndex + 1}
                        </Badge>
                        <span className="font-medium">{candidate.userName}</span>
                        <span className="text-xs text-muted-foreground">
                          ({candidate.currentSeatCount} seat{candidate.currentSeatCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{candidate.rationale}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seats to reassign for overloaded owners */}
            {rec.type === 'overloaded_owner' && rec.seatsToReassign && rec.seatsToReassign.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lightbulb className="h-3 w-3" />
                  Consider reassigning:
                </div>
                <div className="grid gap-2">
                  {rec.seatsToReassign.slice(0, 3).map((seat, seatIndex) => (
                    <Link
                      key={seat.seatId}
                      to={`/eos/accountability?seat=${seat.seatId}`}
                      className="flex items-center justify-between p-2 rounded bg-background/80 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{seatIndex + 1}
                        </Badge>
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{seat.seatName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{seat.rationale}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <p className="text-xs text-muted-foreground text-center italic">
          These are suggestions only. No changes will be made automatically.
        </p>
      </CardContent>
    </Card>
  );
}
