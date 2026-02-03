import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Mountain, 
  AlertTriangle, 
  Calendar,
  TrendingUp,
  Users,
  AlertCircle,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { LeadershipSeat, LeadershipRockStatus, LeadershipRiskRadar, LeadershipMeetingDiscipline } from '@/hooks/useLeadershipDashboard';

interface SeatDrillDownPanelProps {
  seat: LeadershipSeat | null;
  isOpen: boolean;
  onClose: () => void;
  rockStatus: LeadershipRockStatus;
  riskRadar: LeadershipRiskRadar;
  meetingDiscipline: LeadershipMeetingDiscipline;
}

export function SeatDrillDownPanel({ 
  seat, 
  isOpen, 
  onClose,
  rockStatus,
  riskRadar,
  meetingDiscipline,
}: SeatDrillDownPanelProps) {
  if (!seat) return null;

  // Filter data for this seat
  const seatRocks = rockStatus.rocks.filter(r => r.seatId === seat.id);
  const seatRisks = riskRadar.topRisks.filter(r => r.seatId === seat.id);
  const seatOpportunities = riskRadar.topOpportunities.filter(o => o.seatId === seat.id);

  const statusHealthy = seat.offTrackRocks === 0 && seat.escalatedRisksCount === 0 && !seat.hasGwcIssues;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2.5 rounded-lg',
              statusHealthy ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
            )}>
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-xl">{seat.seatName}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <User className="h-3.5 w-3.5" />
                {seat.ownerName}
              </SheetDescription>
            </div>
          </div>
          
          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            {seat.isOverloaded && (
              <Badge variant="secondary" className="text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300">
                Overloaded Owner
              </Badge>
            )}
            {seat.hasGwcIssues && (
              <Badge variant="destructive">GWC Concern</Badge>
            )}
            {seat.criticalRisksAge30Days > 0 && (
              <Badge variant="destructive">
                {seat.criticalRisksAge30Days} Critical Risk{seat.criticalRisksAge30Days > 1 ? 's' : ''} &gt;30d
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Separator className="my-6" />

        {/* Capacity Indicators */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{seat.rocksCount}</div>
            <div className="text-xs text-muted-foreground">Rocks</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{seat.openRisksCount}</div>
            <div className="text-xs text-muted-foreground">Open Risks</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className={cn(
              'text-2xl font-bold',
              seat.escalatedRisksCount > 0 && 'text-destructive'
            )}>
              {seat.escalatedRisksCount}
            </div>
            <div className="text-xs text-muted-foreground">Escalated</div>
          </div>
        </div>

        {/* Rocks Section */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mountain className="h-4 w-4" />
              Linked Rocks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {seatRocks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                No rocks assigned to this seat
              </p>
            ) : (
              seatRocks.map(rock => {
                const isProblematic = rock.status === 'Off_Track' || rock.status === 'At_Risk';
                return (
                  <Link
                    key={rock.id}
                    to={`/eos/rocks?rock=${rock.id}`}
                    className={cn(
                      'block p-2.5 rounded-lg border text-sm transition-colors hover:bg-muted/50',
                      isProblematic && 'border-destructive/30 bg-destructive/5'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate flex-1">{rock.title}</span>
                      <Badge 
                        variant={rock.status === 'Off_Track' ? 'destructive' : rock.status === 'At_Risk' ? 'secondary' : 'default'}
                        className="ml-2 text-xs"
                      >
                        {rock.status?.replace('_', ' ')}
                      </Badge>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Risks & Opportunities Section */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Risks & Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {seatRisks.length === 0 && seatOpportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                No risks or opportunities linked
              </p>
            ) : (
              <>
                {seatRisks.map(risk => (
                  <Link
                    key={risk.id}
                    to={`/eos/risks-opportunities?item=${risk.id}`}
                    className={cn(
                      'block p-2.5 rounded-lg border text-sm transition-colors hover:bg-muted/50',
                      risk.isEscalated && 'border-destructive/50 bg-destructive/5'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="font-medium truncate flex-1">{risk.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {risk.impact}
                      </Badge>
                    </div>
                    {risk.ageInDays > 30 && (
                      <div className="text-xs text-amber-600 mt-1">
                        Open for {risk.ageInDays} days
                      </div>
                    )}
                  </Link>
                ))}
                {seatOpportunities.map(opp => (
                  <Link
                    key={opp.id}
                    to={`/eos/risks-opportunities?item=${opp.id}`}
                    className="block p-2.5 rounded-lg border text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="font-medium truncate flex-1">{opp.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {opp.impact}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Meeting Attendance */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Meeting Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {meetingDiscipline.seatsRepeatedlyAbsent.includes(seat.seatName) ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  Seat owner missed last L10
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3">
                No attendance issues
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quarterly Conversations Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Quarterly Conversation Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {seat.hasGwcIssues ? (
              <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">GWC issues flagged</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Review quarterly conversation for details
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3">
                No GWC concerns
              </p>
            )}
          </CardContent>
        </Card>

        {/* Link to Accountability Chart */}
        <div className="mt-6">
          <Link 
            to="/eos/accountability"
            className="block text-center text-sm text-primary hover:underline"
          >
            View in Accountability Chart →
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
