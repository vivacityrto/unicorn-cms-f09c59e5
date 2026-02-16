/**
 * PortfolioHealthWidget – Unicorn 2.0 Phase 9
 *
 * Executive dashboard widget: Portfolio Health Overview.
 * Shows healthy/at-risk/critical stage distribution and trends.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  monitoring: 'bg-yellow-500',
  at_risk: 'bg-orange-500',
  critical: 'bg-red-500',
};

export function PortfolioHealthWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['portfolio-health-overview'],
    queryFn: async () => {
      // Get latest snapshot per stage_instance_id across all tenants
      const { data: snapshots, error } = await supabase
        .from('stage_health_snapshots' as any)
        .select('id, stage_instance_id, health_status, snapshot_date, tasks_overdue_count, days_since_last_activity')
        .order('snapshot_date', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Deduplicate: latest per stage
      const seen = new Set<number>();
      const latest: any[] = [];
      for (const row of ((snapshots as any[]) || [])) {
        if (!seen.has(row.stage_instance_id)) {
          seen.add(row.stage_instance_id);
          latest.push(row);
        }
      }

      const counts = { healthy: 0, monitoring: 0, at_risk: 0, critical: 0 };
      let totalOverdue = 0;

      for (const s of latest) {
        const status = s.health_status as keyof typeof counts;
        if (status in counts) counts[status]++;
        totalOverdue += s.tasks_overdue_count || 0;
      }

      const total = latest.length || 1;

      // Find most common trigger
      const overdueTriggers = latest.filter((s: any) => s.tasks_overdue_count > 5).length;
      const inactivityTriggers = latest.filter((s: any) => s.days_since_last_activity > 14).length;
      const commonTrigger = overdueTriggers >= inactivityTriggers ? 'Overdue tasks' : 'Inactivity';

      return {
        total: latest.length,
        counts,
        healthyPct: Math.round((counts.healthy / total) * 100),
        atRiskPct: Math.round((counts.at_risk / total) * 100),
        commonTrigger,
      };
    },
    staleTime: 120_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Portfolio Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.total === 0 ? (
          <p className="text-xs text-muted-foreground">No health data available.</p>
        ) : (
          <div className="space-y-3">
            {/* Status distribution bar */}
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {(['healthy', 'monitoring', 'at_risk', 'critical'] as const).map((s) => {
                const pct = (data.counts[s] / data.total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={s}
                    className={`${STATUS_COLORS[s]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${s.replace('_', ' ')}: ${data.counts[s]}`}
                  />
                );
              })}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Healthy</p>
                <p className="font-bold text-green-600">{data.healthyPct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">At Risk</p>
                <p className="font-bold text-orange-600">{data.atRiskPct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Critical</p>
                <p className="font-bold text-destructive">{data.counts.critical}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Top Trigger</p>
                <p className="font-medium truncate">{data.commonTrigger}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
