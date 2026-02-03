import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { AlertTriangle, Target, Users } from 'lucide-react';
import type { SeatWithDetails, FunctionWithSeats } from '@/types/accountabilityChart';
import { EOS_SEAT_ROLE_LABELS, EOS_ROLE_COLORS, type EosSeatRoleType } from '@/types/accountabilityChart';

interface OrgChartViewProps {
  functions: FunctionWithSeats[];
  onSeatClick?: (seat: SeatWithDetails) => void;
}

export function OrgChartView({ functions, onSeatClick }: OrgChartViewProps) {
  // Organize seats by EOS role type for visual hierarchy
  const { visionary, integrator, leadershipTeam, functionalLeads, otherSeats } = useMemo(() => {
    const allSeats = functions.flatMap(f => f.seats);
    return {
      visionary: allSeats.filter(s => s.eos_role_type === 'visionary'),
      integrator: allSeats.filter(s => s.eos_role_type === 'integrator'),
      leadershipTeam: allSeats.filter(s => s.eos_role_type === 'leadership_team'),
      functionalLeads: allSeats.filter(s => s.eos_role_type === 'functional_lead'),
      otherSeats: allSeats.filter(s => !s.eos_role_type),
    };
  }, [functions]);

  return (
    <div className="space-y-8">
      {/* Top Level: Visionary & Integrator */}
      <div className="flex justify-center gap-6">
        {visionary.map(seat => (
          <SeatNode key={seat.id} seat={seat} onClick={() => onSeatClick?.(seat)} size="large" />
        ))}
        {integrator.map(seat => (
          <SeatNode key={seat.id} seat={seat} onClick={() => onSeatClick?.(seat)} size="large" />
        ))}
      </div>

      {/* Connector Line */}
      {(visionary.length > 0 || integrator.length > 0) && leadershipTeam.length > 0 && (
        <div className="flex justify-center">
          <div className="w-px h-8 bg-border" />
        </div>
      )}

      {/* Leadership Team */}
      {leadershipTeam.length > 0 && (
        <div>
          <p className="text-center text-xs font-medium text-muted-foreground mb-3">Leadership Team</p>
          <div className="flex flex-wrap justify-center gap-4">
            {leadershipTeam.map(seat => (
              <SeatNode key={seat.id} seat={seat} onClick={() => onSeatClick?.(seat)} size="medium" />
            ))}
          </div>
        </div>
      )}

      {/* Connector Line */}
      {leadershipTeam.length > 0 && functionalLeads.length > 0 && (
        <div className="flex justify-center">
          <div className="w-px h-8 bg-border" />
        </div>
      )}

      {/* Functional Leads */}
      {functionalLeads.length > 0 && (
        <div>
          <p className="text-center text-xs font-medium text-muted-foreground mb-3">Functional Leads</p>
          <div className="flex flex-wrap justify-center gap-4">
            {functionalLeads.map(seat => (
              <SeatNode key={seat.id} seat={seat} onClick={() => onSeatClick?.(seat)} size="medium" />
            ))}
          </div>
        </div>
      )}

      {/* Other Seats (not categorized) */}
      {otherSeats.length > 0 && (
        <div className="mt-8">
          <p className="text-center text-xs font-medium text-muted-foreground mb-3">Other Seats</p>
          <div className="flex flex-wrap justify-center gap-3">
            {otherSeats.map(seat => (
              <SeatNode key={seat.id} seat={seat} onClick={() => onSeatClick?.(seat)} size="small" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state if no seats at all */}
      {functions.flatMap(f => f.seats).length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold mb-1">No Seats Defined</h3>
          <p className="text-sm text-muted-foreground">
            Switch to Builder View to add Functions and Seats
          </p>
        </div>
      )}
    </div>
  );
}

interface SeatNodeProps {
  seat: SeatWithDetails;
  onClick?: () => void;
  size: 'small' | 'medium' | 'large';
}

function SeatNode({ seat, onClick, size }: SeatNodeProps) {
  const isVacant = !seat.primaryOwner;
  const roleType = seat.eos_role_type;

  const sizeClasses = {
    small: 'w-40 p-3',
    medium: 'w-48 p-4',
    large: 'w-56 p-5',
  };

  const avatarSizes = {
    small: 'h-8 w-8',
    medium: 'h-10 w-10',
    large: 'h-12 w-12',
  };

  const getInitials = () => {
    if (!seat.primaryOwner) return '?';
    return `${seat.primaryOwner.first_name?.[0] || ''}${seat.primaryOwner.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  return (
    <Card 
      className={cn(
        'cursor-pointer hover:shadow-md transition-all hover:scale-105',
        sizeClasses[size],
        isVacant && 'border-warning/50 bg-warning/5'
      )}
      onClick={onClick}
    >
      <div className="text-center space-y-2">
        {/* Avatar */}
        <div className="flex justify-center">
          <Avatar className={cn(avatarSizes[size], isVacant && 'opacity-50')}>
            <AvatarImage src={seat.primaryOwner?.avatar_url || undefined} />
            <AvatarFallback className={cn(
              isVacant && 'bg-warning/20 text-warning'
            )}>
              {isVacant ? <AlertTriangle className="h-4 w-4" /> : getInitials()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Seat Name */}
        <p className={cn(
          'font-semibold line-clamp-2',
          size === 'small' && 'text-sm',
          size === 'medium' && 'text-sm',
          size === 'large' && 'text-base'
        )}>
          {seat.seat_name}
        </p>

        {/* Owner Name */}
        <p className="text-xs text-muted-foreground truncate">
          {isVacant ? (
            <span className="text-warning">Vacant</span>
          ) : (
            `${seat.primaryOwner?.first_name || ''} ${seat.primaryOwner?.last_name || ''}`.trim() || seat.primaryOwner?.email
          )}
        </p>

        {/* Role Type Badge */}
        {roleType && (
          <Badge 
            className={cn(
              'text-[10px] px-1.5 py-0',
              EOS_ROLE_COLORS[roleType].bg,
              EOS_ROLE_COLORS[roleType].text
            )}
          >
            {EOS_SEAT_ROLE_LABELS[roleType]}
          </Badge>
        )}

        {/* Stats */}
        <div className="flex justify-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Target className="h-3 w-3" />
            {seat.linkedData?.active_rocks_count || 0}
          </span>
          <span>{seat.roles.length} acc.</span>
        </div>
      </div>
    </Card>
  );
}
