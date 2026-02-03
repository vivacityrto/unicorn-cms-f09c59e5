import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Armchair, 
  Search, 
  Filter,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useAllSeatGWCTrends } from '@/hooks/useGWCTrends';
import { GWCSparkline } from './GWCSparkline';
import { GWCStatusBadge, GWCTrendIndicator } from './GWCStatusBadge';
import { cn } from '@/lib/utils';
import type { GWCStatus, SeatGWCTrends } from '@/types/gwcTrends';

export function GWCTrendsTable() {
  const { data: seatTrends, isLoading } = useAllSeatGWCTrends();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GWCStatus | 'all'>('all');

  const filteredSeats = seatTrends?.filter(seat => {
    const matchesSearch = 
      seat.seatName.toLowerCase().includes(search.toLowerCase()) ||
      seat.functionName.toLowerCase().includes(search.toLowerCase()) ||
      seat.ownerName?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || seat.overallStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const riskCount = seatTrends?.filter(s => s.overallStatus === 'risk').length || 0;
  const watchCount = seatTrends?.filter(s => s.overallStatus === 'watch').length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Armchair className="h-5 w-5 text-muted-foreground" />
              GWC Trends by Seat
            </CardTitle>
            <CardDescription>
              {seatTrends?.length || 0} seats · Last 3-6 quarters of data
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {riskCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {riskCount} at risk
              </Badge>
            )}
            {watchCount > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300">
                {watchCount} to watch
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search seats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as GWCStatus | 'all')}>
            <SelectTrigger className="w-36">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="risk">Risk</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="strong">Strong</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seat</TableHead>
                <TableHead>Get It</TableHead>
                <TableHead>Want It</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSeats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {search || statusFilter !== 'all' 
                      ? 'No seats match your filters' 
                      : 'No GWC trend data available'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSeats.map((seat) => (
                  <TableRow key={seat.seatId} className="group hover:bg-muted/50">
                    <TableCell>
                      <div>
                        <div className="font-medium">{seat.seatName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] px-1">{seat.functionName}</Badge>
                          {seat.ownerName && <span>· {seat.ownerName}</span>}
                        </div>
                      </div>
                    </TableCell>
                    
                    {/* Dimension cells */}
                    {(['gets_it', 'wants_it', 'capacity'] as const).map(dim => {
                      const dimData = seat.dimensions.find(d => d.dimension === dim);
                      if (!dimData) {
                        return (
                          <TableCell key={dim}>
                            <span className="text-xs text-muted-foreground">No data</span>
                          </TableCell>
                        );
                      }
                      
                      return (
                        <TableCell key={dim}>
                          <div className="flex items-center gap-2">
                            <GWCSparkline 
                              data={dimData.quarterlyData} 
                              height={24} 
                              width={60}
                            />
                            <div className="text-right">
                              <div className={cn(
                                'text-sm font-medium',
                                dimData.status === 'strong' && 'text-emerald-600',
                                dimData.status === 'watch' && 'text-amber-600',
                                dimData.status === 'risk' && 'text-destructive',
                              )}>
                                {Math.round(dimData.currentYesRate * 100)}%
                              </div>
                              <GWCTrendIndicator trend={dimData.trend} showLabel={false} className="justify-end" />
                            </div>
                          </div>
                        </TableCell>
                      );
                    })}
                    
                    <TableCell>
                      <GWCStatusBadge status={seat.overallStatus} />
                    </TableCell>
                    
                    <TableCell>
                      <Link to={`/eos/accountability-chart?seat=${seat.seatId}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
