import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSeatHealth } from '@/hooks/useSeatHealth';
import { useAccountabilityChart } from '@/hooks/useAccountabilityChart';
import { SeatHealthBadge } from '@/components/eos/accountability/SeatHealthBadge';
import { HEALTH_BAND_CONFIG } from '@/types/seatHealth';

interface SeatHealthWatchlistProps {
  limit?: number;
  showRefresh?: boolean;
}

export function SeatHealthWatchlist({ limit = 5, showRefresh = true }: SeatHealthWatchlistProps) {
  const navigate = useNavigate();
  const { getWorstSeats, calculateAllHealth, isLoading, recommendations } = useSeatHealth();
  const { chart } = useAccountabilityChart();
  
  const worstSeats = getWorstSeats(limit);
  
  // Get seat details from chart
  const getSeatDetails = (seatId: string) => {
    if (!chart) return null;
    for (const func of chart.functions) {
      const seat = func.seats.find(s => s.id === seatId);
      if (seat) {
        return { seat, functionName: func.name };
      }
    }
    return null;
  };

  const handleRecalculate = () => {
    if (!chart) return;
    const seatIds = chart.functions.flatMap(f => f.seats.map(s => s.id));
    calculateAllHealth.mutate(seatIds);
  };

  if (worstSeats.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Seat Health Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No health data available yet
            </p>
            {chart && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRecalculate}
                disabled={calculateAllHealth.isPending}
              >
                {calculateAllHealth.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Calculate Health Scores
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Only show seats that are at_risk or overloaded
  const concerningSeats = worstSeats.filter(s => s.health_band !== 'healthy');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Seat Health Watchlist
          </CardTitle>
          <div className="flex items-center gap-2">
            {concerningSeats.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {concerningSeats.filter(s => s.health_band === 'overloaded').length} critical
              </Badge>
            )}
            {showRefresh && (
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7"
                onClick={handleRecalculate}
                disabled={calculateAllHealth.isPending}
              >
                <RefreshCw className={cn(
                  "h-4 w-4",
                  calculateAllHealth.isPending && "animate-spin"
                )} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {concerningSeats.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-emerald-600 flex items-center justify-center gap-2">
              <TrendingUp className="h-4 w-4" />
              All seats are healthy!
            </p>
          </div>
        ) : (
          concerningSeats.map((health, index) => {
            const details = getSeatDetails(health.seat_id);
            const seatRecs = recommendations?.filter(r => 
              r.seat_id === health.seat_id && 
              (r.status === 'new' || r.status === 'acknowledged')
            ) || [];
            
            const config = HEALTH_BAND_CONFIG[health.health_band];
            const topFactor = health.contributing_factors[0];

            return (
              <div key={health.id}>
                {index > 0 && <Separator className="my-2" />}
                <div 
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate('/eos/accountability-chart')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {details?.seat.seat_name || 'Unknown Seat'}
                      </span>
                      <SeatHealthBadge health={health} size="sm" />
                    </div>
                    {details && (
                      <p className="text-xs text-muted-foreground truncate">
                        {details.functionName}
                      </p>
                    )}
                    {topFactor && (
                      <p className={cn('text-xs mt-1', config.color)}>
                        {topFactor.label}: {topFactor.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {seatRecs.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {seatRecs.length} suggestion{seatRecs.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            );
          })
        )}

        {concerningSeats.length > 0 && (
          <Button 
            variant="link" 
            className="w-full text-xs h-8 mt-2"
            onClick={() => navigate('/eos/accountability-chart')}
          >
            View Accountability Chart
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
