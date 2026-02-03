import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatRockSummary } from '@/types/rockAnalysis';

interface SeatAnalysisTableProps {
  seats: SeatRockSummary[];
  onSeatClick?: (seatId: string) => void;
}

export function SeatAnalysisTable({ seats, onSeatClick }: SeatAnalysisTableProps) {
  if (seats.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No seat data available for this quarter
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Seat</TableHead>
            <TableHead className="text-center">Rocks</TableHead>
            <TableHead className="text-center">Completion</TableHead>
            <TableHead className="text-center">On Time</TableHead>
            <TableHead className="text-center">Rolled</TableHead>
            <TableHead className="text-center">Dropped</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {seats.map((seat) => (
            <TableRow 
              key={seat.seat_id}
              className={cn(
                onSeatClick && "cursor-pointer hover:bg-muted/50"
              )}
              onClick={() => onSeatClick?.(seat.seat_id)}
            >
              <TableCell>
                <div>
                  <div className="font-medium">{seat.seat_name}</div>
                  {seat.owner_name && (
                    <div className="text-sm text-muted-foreground">{seat.owner_name}</div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">{seat.total_rocks}</TableCell>
              <TableCell className="text-center">
                <div className="flex items-center gap-2">
                  <Progress 
                    value={seat.completion_rate} 
                    className="w-16 h-2"
                  />
                  <span className="text-sm">{seat.completion_rate}%</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30">
                  {seat.completed_on_time}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30">
                  {seat.rolled_forward}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-destructive bg-destructive/10">
                  {seat.dropped}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {seat.flags.map((flag, i) => (
                    <Badge 
                      key={i} 
                      variant="outline"
                      className={cn(
                        "text-xs gap-1",
                        flag.severity === 'critical' 
                          ? "text-destructive border-destructive/50" 
                          : "text-amber-700 dark:text-amber-300 border-amber-500/50"
                      )}
                    >
                      {flag.severity === 'critical' 
                        ? <AlertCircle className="h-3 w-3" />
                        : <AlertTriangle className="h-3 w-3" />
                      }
                      {flag.type === 'high_roll_rate' && 'High Roll'}
                      {flag.type === 'repeated_drops' && 'Repeat Drops'}
                      {flag.type === 'chronic_late' && 'Late Pattern'}
                    </Badge>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
