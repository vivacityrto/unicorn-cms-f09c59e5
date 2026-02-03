import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AlertTriangle, ExternalLink, Briefcase, ChevronRight } from 'lucide-react';
import type { LeadershipRockStatus, LeadershipSeat } from '@/hooks/useLeadershipDashboard';

interface LeadershipRocksTableProps {
  rockStatus: LeadershipRockStatus;
  onSeatClick?: (seatId: string) => void;
}

const statusStyles: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  'On_Track': { label: 'On Track', variant: 'default' },
  'At_Risk': { label: 'At Risk', variant: 'secondary' },
  'Off_Track': { label: 'Off Track', variant: 'destructive' },
  'Complete': { label: 'Complete', variant: 'outline' },
  'Not_Started': { label: 'Not Started', variant: 'outline' },
};

export function LeadershipRocksTable({ rockStatus, onSeatClick }: LeadershipRocksTableProps) {
  if (rockStatus.rocks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quarterly Rocks by Seat</CardTitle>
          <CardDescription>Rock ownership grouped by Accountability Chart seat</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No Rocks set for this quarter
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Quarterly Rocks by Seat</CardTitle>
          <CardDescription>
            {rockStatus.totalRocks} Rocks · {rockStatus.seatsWithMultipleOffTrack > 0 && (
              <span className="text-destructive font-medium">
                {rockStatus.seatsWithMultipleOffTrack} seat{rockStatus.seatsWithMultipleOffTrack > 1 ? 's' : ''} with multiple Off Track
              </span>
            )}
            {rockStatus.seatsWithMultipleOffTrack === 0 && (
              <span>{rockStatus.onTrack} On Track · {rockStatus.offTrack + rockStatus.atRisk} Need Attention</span>
            )}
          </CardDescription>
        </div>
        <Link 
          to="/eos/rocks"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {/* Seat-grouped view */}
        <div className="space-y-3">
          {rockStatus.rocksBySeat.map((seatGroup) => {
            const hasProblems = seatGroup.offTrack > 0 || seatGroup.atRisk > 0;
            const multipleOffTrack = seatGroup.offTrack >= 2;
            
            return (
              <div
                key={seatGroup.seatId}
                className={cn(
                  'p-3 rounded-lg border transition-colors',
                  multipleOffTrack && 'border-destructive/50 bg-destructive/5',
                  hasProblems && !multipleOffTrack && 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
                )}
              >
                {/* Seat Header */}
                <button
                  onClick={() => onSeatClick?.(seatGroup.seatId)}
                  className="w-full flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{seatGroup.seatName}</span>
                    <span className="text-sm text-muted-foreground">
                      ({seatGroup.ownerName})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      {seatGroup.onTrack > 0 && (
                        <Badge variant="default" className="text-xs">
                          {seatGroup.onTrack} On Track
                        </Badge>
                      )}
                      {seatGroup.atRisk > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {seatGroup.atRisk} At Risk
                        </Badge>
                      )}
                      {seatGroup.offTrack > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {seatGroup.offTrack} Off Track
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </button>

                {/* Show individual rocks if there are problems */}
                {hasProblems && (
                  <div className="mt-3 space-y-1.5 pl-6">
                    {rockStatus.rocks
                      .filter(r => r.seatId === seatGroup.seatId && (r.status === 'Off_Track' || r.status === 'At_Risk'))
                      .map(rock => {
                        const style = statusStyles[rock.status] || { label: rock.status, variant: 'outline' as const };
                        return (
                          <Link
                            key={rock.id}
                            to={`/eos/rocks?rock=${rock.id}`}
                            className="flex items-center justify-between p-2 rounded-lg bg-background/80 hover:bg-background transition-colors text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{rock.title}</span>
                              {rock.linkedRisksCount > 0 && (
                                <span className="flex items-center gap-1 text-xs text-amber-600 shrink-0">
                                  <AlertTriangle className="h-3 w-3" />
                                  {rock.linkedRisksCount}
                                </span>
                              )}
                            </div>
                            <Badge variant={style.variant} className="ml-2 shrink-0 text-xs">
                              {style.label}
                            </Badge>
                          </Link>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned rocks warning */}
          {rockStatus.rocks.filter(r => !r.seatId).length > 0 && (
            <div className="p-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {rockStatus.rocks.filter(r => !r.seatId).length} Rock{rockStatus.rocks.filter(r => !r.seatId).length !== 1 ? 's' : ''} without seat assignment
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
