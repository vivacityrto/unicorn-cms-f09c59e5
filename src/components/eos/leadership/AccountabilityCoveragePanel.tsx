import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Users, 
  UserCheck, 
  UserX, 
  AlertTriangle, 
  ListChecks,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { LeadershipSeat, LeadershipAccountabilityGap } from '@/hooks/useLeadershipDashboard';

interface AccountabilityCoveragePanelProps {
  seats: LeadershipSeat[];
  gaps: LeadershipAccountabilityGap[];
  onSeatClick?: (seatId: string) => void;
}

interface CoverageTile {
  label: string;
  value: number;
  icon: React.ElementType;
  variant: 'default' | 'success' | 'warning' | 'danger';
  filter?: string;
}

export function AccountabilityCoveragePanel({ seats, gaps, onSeatClick }: AccountabilityCoveragePanelProps) {
  const totalSeats = seats.length;
  const coveredSeats = seats.filter(s => s.ownerUserId).length;
  const uncoveredSeats = seats.filter(s => !s.ownerUserId).length;
  const overloadedOwners = new Set(
    gaps.filter(g => g.type === 'overloaded_owner').map(g => g.ownerName)
  ).size;
  
  // Seats with missing accountabilities (< 3 or > 7 roles - would need role count data)
  // For now, flag seats with no rocks as potentially under-utilized
  const seatsWithIssues = seats.filter(s => s.rocksCount === 0 && s.ownerUserId).length;

  const tiles: CoverageTile[] = [
    { 
      label: 'Total Seats', 
      value: totalSeats, 
      icon: Users, 
      variant: 'default' 
    },
    { 
      label: 'Covered', 
      value: coveredSeats, 
      icon: UserCheck, 
      variant: 'success' 
    },
    { 
      label: 'Uncovered', 
      value: uncoveredSeats, 
      icon: UserX, 
      variant: uncoveredSeats > 0 ? 'danger' : 'success',
      filter: 'uncovered'
    },
    { 
      label: 'Overloaded Owners', 
      value: overloadedOwners, 
      icon: AlertTriangle, 
      variant: overloadedOwners > 0 ? 'warning' : 'success',
      filter: 'overloaded'
    },
    { 
      label: 'Under-Utilized', 
      value: seatsWithIssues, 
      icon: ListChecks, 
      variant: seatsWithIssues > 0 ? 'warning' : 'success',
      filter: 'underutilized'
    },
  ];

  const variantStyles = {
    default: 'bg-muted text-foreground',
    success: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
    danger: 'bg-destructive/10 text-destructive',
  };

  // Group seats by function (using function_id would require additional data)
  // For now, show all seats in a single table
  const sortedSeats = [...seats].sort((a, b) => {
    // Uncovered first, then by issues
    if (!a.ownerUserId && b.ownerUserId) return -1;
    if (a.ownerUserId && !b.ownerUserId) return 1;
    if (a.isOverloaded && !b.isOverloaded) return -1;
    if (!a.isOverloaded && b.isOverloaded) return 1;
    return a.seatName.localeCompare(b.seatName);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Accountability Coverage</CardTitle>
          <CardDescription>Seat ownership and capacity overview</CardDescription>
        </div>
        <Link 
          to="/eos/accountability"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View Chart
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Coverage Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              to={`/eos/accountability${tile.filter ? `?filter=${tile.filter}` : ''}`}
              className={cn(
                'p-4 rounded-lg border transition-colors hover:shadow-sm',
                variantStyles[tile.variant]
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <tile.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{tile.label}</span>
              </div>
              <div className="text-2xl font-bold">{tile.value}</div>
            </Link>
          ))}
        </div>

        {/* Seats Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seat</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-center">Rocks</TableHead>
                <TableHead className="text-center">Risks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSeats.slice(0, 10).map((seat) => {
                const hasIssues = !seat.ownerUserId || seat.isOverloaded || seat.hasGwcIssues;
                return (
                  <TableRow 
                    key={seat.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      hasIssues && 'bg-destructive/5'
                    )}
                    onClick={() => onSeatClick?.(seat.id)}
                  >
                    <TableCell className="font-medium">{seat.seatName}</TableCell>
                    <TableCell>
                      {seat.ownerUserId ? (
                        seat.ownerName
                      ) : (
                        <span className="text-destructive">Vacant</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span>{seat.rocksCount}</span>
                        {seat.offTrackRocks > 0 && (
                          <Badge variant="destructive" className="text-xs px-1">
                            {seat.offTrackRocks} off
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span>{seat.openRisksCount}</span>
                        {seat.escalatedRisksCount > 0 && (
                          <Badge variant="destructive" className="text-xs px-1">
                            {seat.escalatedRisksCount} esc
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!seat.ownerUserId && (
                          <Badge variant="destructive" className="text-xs">Uncovered</Badge>
                        )}
                        {seat.isOverloaded && (
                          <Badge variant="secondary" className="text-xs">Overloaded</Badge>
                        )}
                        {seat.hasGwcIssues && (
                          <Badge variant="outline" className="text-xs text-amber-600">GWC</Badge>
                        )}
                        {seat.ownerUserId && !seat.isOverloaded && !seat.hasGwcIssues && (
                          <Badge variant="outline" className="text-xs text-emerald-600">OK</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {seats.length > 10 && (
            <div className="p-2 text-center border-t">
              <Link to="/eos/accountability" className="text-sm text-primary hover:underline">
                View all {seats.length} seats →
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
