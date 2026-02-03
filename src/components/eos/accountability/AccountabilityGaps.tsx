import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  UserX, 
  Target, 
  Calendar, 
  Users, 
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccountabilityGap, SeatWithDetails, UserBasic } from '@/types/accountabilityChart';
import { useMemo } from 'react';

interface AccountabilityGapsProps {
  seats: SeatWithDetails[];
  onSeatClick?: (seat: SeatWithDetails) => void;
}

const GAP_ICONS: Record<AccountabilityGap['type'], React.ReactNode> = {
  vacant_seat: <UserX className="h-4 w-4" />,
  no_rocks: <Target className="h-4 w-4" />,
  overloaded_owner: <Users className="h-4 w-4" />,
  missing_meetings: <Calendar className="h-4 w-4" />,
  gwc_issues: <AlertCircle className="h-4 w-4" />,
};

const SEVERITY_COLORS: Record<AccountabilityGap['severity'], string> = {
  high: 'text-destructive border-destructive/30 bg-destructive/10',
  medium: 'text-warning border-warning/30 bg-warning/10',
  low: 'text-muted-foreground border-muted bg-muted/50',
};

export function AccountabilityGaps({ seats, onSeatClick }: AccountabilityGapsProps) {
  const gaps = useMemo(() => {
    const result: AccountabilityGap[] = [];
    
    // Track owner seat counts for overload detection
    const ownerSeatCount = new Map<string, { user: UserBasic; count: number; seats: SeatWithDetails[] }>();

    seats.forEach(seat => {
      // Check for vacant seats
      if (!seat.primaryOwner) {
        result.push({
          type: 'vacant_seat',
          severity: 'high',
          seat,
          message: `${seat.seat_name} has no primary owner`,
          details: 'Assign a primary owner to this seat',
        });
      } else {
        // Track owner for overload check
        const existing = ownerSeatCount.get(seat.primaryOwner.user_uuid);
        if (existing) {
          existing.count++;
          existing.seats.push(seat);
        } else {
          ownerSeatCount.set(seat.primaryOwner.user_uuid, {
            user: seat.primaryOwner,
            count: 1,
            seats: [seat],
          });
        }
      }

      // Check for seats without rocks (if linked data available)
      if (seat.linkedData && seat.linkedData.active_rocks_count === 0 && seat.primaryOwner) {
        result.push({
          type: 'no_rocks',
          severity: 'medium',
          seat,
          owner: seat.primaryOwner,
          message: `${seat.seat_name} has no active Rocks`,
          details: 'Consider assigning quarterly Rocks to this seat',
        });
      }

      // Check for missed meetings
      if (seat.linkedData && seat.linkedData.meetings_missed_count > 2) {
        result.push({
          type: 'missing_meetings',
          severity: 'medium',
          seat,
          owner: seat.primaryOwner,
          message: `${seat.seat_name} has ${seat.linkedData.meetings_missed_count} missed meetings`,
          details: 'Review attendance patterns for this seat',
        });
      }

      // Check for incomplete GWC criteria
      if (seat.primaryOwner && (!seat.gwc_get_it || !seat.gwc_want_it || !seat.gwc_capacity)) {
        result.push({
          type: 'gwc_issues',
          severity: 'low',
          seat,
          message: `${seat.seat_name} has incomplete GWC criteria`,
          details: 'Define Get It, Want It, and Capacity for this seat',
        });
      }
    });

    // Check for overloaded owners (more than 3 seats)
    ownerSeatCount.forEach((data) => {
      if (data.count > 3) {
        result.push({
          type: 'overloaded_owner',
          severity: 'medium',
          owner: data.user,
          seat: data.seats[0], // Use first seat for navigation
          message: `${data.user.first_name || data.user.email} owns ${data.count} seats`,
          details: `Seats: ${data.seats.map(s => s.seat_name).join(', ')}`,
        });
      }
    });

    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return result.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [seats]);

  if (gaps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold mb-1">No Accountability Gaps</h3>
          <p className="text-sm text-muted-foreground">
            All seats are properly assigned and configured
          </p>
        </CardContent>
      </Card>
    );
  }

  const highCount = gaps.filter(g => g.severity === 'high').length;
  const mediumCount = gaps.filter(g => g.severity === 'medium').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Accountability Gaps
          </CardTitle>
          <div className="flex gap-2">
            {highCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {highCount} Critical
              </Badge>
            )}
            {mediumCount > 0 && (
              <Badge variant="outline" className="text-xs text-warning border-warning/50">
                {mediumCount} Warning
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Uncovered seats banner */}
        {highCount > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Uncovered seats block execution</p>
              <p className="text-xs opacity-80">
                Assign owners to all seats before activating the chart or running meetings.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {gaps.map((gap, i) => (
            <div
              key={`${gap.type}-${gap.seat?.id || gap.owner?.user_uuid}-${i}`}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow',
                SEVERITY_COLORS[gap.severity]
              )}
              onClick={() => gap.seat && onSeatClick?.(gap.seat)}
            >
              <div className="shrink-0">
                {GAP_ICONS[gap.type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{gap.message}</p>
                {gap.details && (
                  <p className="text-xs opacity-75 truncate">{gap.details}</p>
                )}
              </div>
              {gap.seat && (
                <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
