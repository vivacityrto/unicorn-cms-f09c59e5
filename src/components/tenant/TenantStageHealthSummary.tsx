/**
 * TenantStageHealthSummary – Unicorn 2.0 Phase 9
 *
 * Tenant overview panel showing all stage health statuses,
 * sorted by severity (critical → at_risk → monitoring → healthy).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TenantStageHealthSummaryProps {
  tenantId: number;
}

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-100 text-green-800',
  monitoring: 'bg-yellow-100 text-yellow-800',
  at_risk: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_ORDER: Record<string, number> = {
  critical: 0,
  at_risk: 1,
  monitoring: 2,
  healthy: 3,
};

export function TenantStageHealthSummary({ tenantId }: TenantStageHealthSummaryProps) {
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['tenant-stage-health', tenantId],
    queryFn: async () => {
      // Get latest snapshot per stage_instance
      const { data, error } = await supabase
        .from('stage_health_snapshots' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('snapshot_date', { ascending: false });
      if (error) throw error;

      // Deduplicate: keep latest per stage_instance_id
      const seen = new Set<number>();
      const latest: any[] = [];
      for (const row of ((data as any[]) || [])) {
        if (!seen.has(row.stage_instance_id)) {
          seen.add(row.stage_instance_id);
          latest.push(row);
        }
      }

      // Sort by severity
      latest.sort((a, b) => (STATUS_ORDER[a.health_status] ?? 3) - (STATUS_ORDER[b.health_status] ?? 3));
      return latest;
    },
    enabled: !!tenantId,
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

  if (!snapshots || snapshots.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Stage Health Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No health snapshots available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = snapshots.filter((s: any) => s.health_status === 'critical').length;
  const atRiskCount = snapshots.filter((s: any) => s.health_status === 'at_risk').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Stage Health Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">{criticalCount} Critical</Badge>
            )}
            {atRiskCount > 0 && (
              <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800">{atRiskCount} At Risk</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Stage</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Overdue</TableHead>
              <TableHead className="text-xs text-right">Risks</TableHead>
              <TableHead className="text-xs text-right">Inactive</TableHead>
              <TableHead className="text-xs text-right">Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs font-medium">Stage #{s.stage_instance_id}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px]', STATUS_BADGE[s.health_status])}>
                    {s.health_status?.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className={cn('text-xs text-right', s.tasks_overdue_count > 0 && 'text-destructive font-medium')}>
                  {s.tasks_overdue_count}
                </TableCell>
                <TableCell className={cn('text-xs text-right', s.high_risk_count > 0 && 'text-destructive font-medium')}>
                  {s.high_risk_count}
                </TableCell>
                <TableCell className={cn('text-xs text-right', s.days_since_last_activity > 14 && 'text-destructive font-medium')}>
                  {s.days_since_last_activity}d
                </TableCell>
                <TableCell className="text-xs text-right">{s.progress_percentage}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
