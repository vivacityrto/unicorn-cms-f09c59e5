/**
 * StageHealthPanel – Unicorn 2.0 Phase 9
 *
 * Displays health badge, metrics summary, and trend indicator
 * for a specific stage instance.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Activity, AlertTriangle, CheckCircle2, Clock, FileWarning, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageHealthPanelProps {
  stageInstanceId: number;
  tenantId: number;
}

const STATUS_CONFIG = {
  healthy: { label: 'Healthy', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
  monitoring: { label: 'Monitoring', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  at_risk: { label: 'At Risk', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-200', icon: FileWarning },
} as const;

export function StageHealthPanel({ stageInstanceId, tenantId }: StageHealthPanelProps) {
  // Fetch latest snapshot
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['stage-health-snapshot', stageInstanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_health_snapshots' as any)
        .select('*')
        .eq('stage_instance_id', stageInstanceId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!stageInstanceId,
    staleTime: 60_000,
  });

  // Fetch 7-day-prior snapshot for trend
  const { data: priorSnapshot } = useQuery({
    queryKey: ['stage-health-snapshot-prior', stageInstanceId],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('stage_health_snapshots' as any)
        .select('*')
        .eq('stage_instance_id', stageInstanceId)
        .lte('snapshot_date', dateStr)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!stageInstanceId,
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
            <Activity className="h-4 w-4" />
            Stage Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No health data available yet. Health snapshots are generated nightly.</p>
        </CardContent>
      </Card>
    );
  }

  const status = (snapshot.health_status as keyof typeof STATUS_CONFIG) || 'healthy';
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  // Trend calculation
  let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';
  if (priorSnapshot) {
    const statusOrder = { healthy: 0, monitoring: 1, at_risk: 2, critical: 3 };
    const current = statusOrder[status] ?? 0;
    const prior = statusOrder[(priorSnapshot.health_status as keyof typeof statusOrder)] ?? 0;
    if (current < prior) trend = 'improving';
    else if (current > prior) trend = 'deteriorating';
  }

  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'deteriorating' ? TrendingDown : Minus;
  const trendColor = trend === 'improving' ? 'text-green-600' : trend === 'deteriorating' ? 'text-red-600' : 'text-muted-foreground';
  const trendLabel = trend === 'improving' ? 'Improving' : trend === 'deteriorating' ? 'Deteriorating' : 'Stable';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Stage Health
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-xs', config.color)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
            <span className={cn('flex items-center gap-1 text-xs', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {trendLabel}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div>
          <Progress value={snapshot.progress_percentage} label="Task Progress" showValue />
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricItem label="Open Tasks" value={snapshot.tasks_open_count} />
          <MetricItem label="Overdue Tasks" value={snapshot.tasks_overdue_count} warn={snapshot.tasks_overdue_count > 0} />
          <MetricItem label="High Risks" value={snapshot.high_risk_count} warn={snapshot.high_risk_count > 0} />
          <MetricItem label="Evidence Gaps" value={snapshot.evidence_gap_mandatory_count} warn={snapshot.evidence_gap_mandatory_count > 0} />
          <MetricItem label="Days Inactive" value={snapshot.days_since_last_activity} warn={snapshot.days_since_last_activity > 14} />
          <MetricItem label="Hours Logged" value={Number(snapshot.consult_hours_logged).toFixed(1)} />
        </div>

        <p className="text-[10px] text-muted-foreground">
          Snapshot: {snapshot.snapshot_date} • Health is assessed nightly and does not determine compliance.
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
