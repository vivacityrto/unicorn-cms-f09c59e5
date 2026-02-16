/**
 * ConsultantWorkloadPanel – Unicorn 2.0 Phase 10
 *
 * Individual consultant workload forecast panel.
 * Shows capacity %, forecast hours, risk indicators, and trend.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConsultantWorkloadPanelProps {
  userId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  stable: { label: 'Stable', color: 'bg-green-100 text-green-800' },
  elevated: { label: 'Elevated', color: 'bg-yellow-100 text-yellow-800' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800' },
};

export function ConsultantWorkloadPanel({ userId }: ConsultantWorkloadPanelProps) {
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['workload-snapshot', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workload_snapshots' as any)
        .select('*')
        .eq('user_id', userId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: priorSnapshot } = useQuery({
    queryKey: ['workload-snapshot-prior', userId],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('workload_snapshots' as any)
        .select('*')
        .eq('user_id', userId)
        .lte('snapshot_date', dateStr)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Workload Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No workload data available yet. Forecasts are generated nightly.</p>
        </CardContent>
      </Card>
    );
  }

  const status = snapshot.overload_risk_status || 'stable';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.stable;

  // Trend
  let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';
  if (priorSnapshot) {
    const diff = snapshot.capacity_utilisation_percentage - priorSnapshot.capacity_utilisation_percentage;
    if (diff > 5) trend = 'deteriorating';
    else if (diff < -5) trend = 'improving';
  }
  const TrendIcon = trend === 'improving' ? TrendingDown : trend === 'deteriorating' ? TrendingUp : Minus;
  const trendColor = trend === 'improving' ? 'text-green-600' : trend === 'deteriorating' ? 'text-destructive' : 'text-muted-foreground';

  const capPct = Math.min(snapshot.capacity_utilisation_percentage, 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Workload Forecast
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-xs', config.color)}>
              {config.label}
            </Badge>
            <span className={cn('flex items-center gap-1 text-xs', trendColor)}>
              <TrendIcon className="h-3 w-3" />
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Progress
            value={capPct}
            label="Capacity Utilisation"
            showValue
            indicatorClassName={
              snapshot.capacity_utilisation_percentage >= 100
                ? 'bg-destructive'
                : snapshot.capacity_utilisation_percentage >= 90
                  ? 'bg-orange-500'
                  : undefined
            }
          />
          {snapshot.capacity_utilisation_percentage > 100 && (
            <p className="text-[10px] text-destructive mt-1">
              {snapshot.capacity_utilisation_percentage}% – over capacity
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricItem label="Forecast Hours" value={Number(snapshot.forecast_hours_next_30_days).toFixed(1)} />
          <MetricItem label="Open Tasks" value={snapshot.open_tasks_count} />
          <MetricItem label="Overdue Tasks" value={snapshot.overdue_tasks_count} warn={snapshot.overdue_tasks_count > 0} />
          <MetricItem label="Active Stages" value={snapshot.active_stages_count} />
          <MetricItem label="High Risk Stages" value={snapshot.high_risk_stages_count} warn={snapshot.high_risk_stages_count > 0} />
          <MetricItem label="Hours (30d)" value={Number(snapshot.consult_hours_last_30_days).toFixed(1)} />
        </div>

        <p className="text-[10px] text-muted-foreground">
          Snapshot: {snapshot.snapshot_date} • Forecasts are advisory and do not auto-reassign work.
        </p>
      </CardContent>
    </Card>
  );
}

function MetricItem({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="text-center p-2 rounded-md bg-muted/30">
      <p className={cn('text-lg font-bold', warn ? 'text-destructive' : 'text-foreground')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
