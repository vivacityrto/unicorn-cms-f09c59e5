/**
 * TenantBurnForecastPanel – Unicorn 2.0 Phase 10
 *
 * Tenant-level panel showing package hour burn forecast,
 * projected exhaustion date, and renewal task creation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Flame, Calendar, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface TenantBurnForecastPanelProps {
  tenantId: number;
}

const BURN_CONFIG: Record<string, { label: string; color: string }> = {
  on_track: { label: 'On Track', color: 'bg-green-100 text-green-800' },
  accelerated: { label: 'Accelerated', color: 'bg-yellow-100 text-yellow-800' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800' },
};

export function TenantBurnForecastPanel({ tenantId }: TenantBurnForecastPanelProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: forecasts, isLoading } = useQuery({
    queryKey: ['burn-forecast', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_package_burn_forecast' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('generated_at', { ascending: false });
      if (error) throw error;

      // Deduplicate by package_id (latest only)
      const seen = new Set<number>();
      const latest: any[] = [];
      for (const row of ((data as any[]) || [])) {
        if (!seen.has(row.package_id)) {
          seen.add(row.package_id);
          latest.push(row);
        }
      }
      return latest;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const createRenewalTask = useMutation({
    mutationFn: async (forecast: any) => {
      const { error } = await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'renewal_planning_task_created',
        entity_type: 'tenant_package_burn_forecast',
        entity_id: forecast.id,
        details: {
          package_id: forecast.package_id,
          projected_exhaustion: forecast.projected_exhaustion_date,
          burn_risk_status: forecast.burn_risk_status,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Task Created', description: 'Renewal planning task has been logged.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
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

  if (!forecasts || forecasts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4" />
            Package Burn Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No burn forecast data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Flame className="h-4 w-4" />
          Package Burn Forecast
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {forecasts.map((f: any) => {
          const config = BURN_CONFIG[f.burn_risk_status] || BURN_CONFIG.on_track;
          const usedPct = f.total_hours_allocated > 0
            ? Math.round((f.hours_used_to_date / f.total_hours_allocated) * 100)
            : 0;
          const remaining = Math.max(0, f.total_hours_allocated - f.hours_used_to_date);

          return (
            <div key={f.id} className="space-y-2 p-3 rounded-lg border bg-muted/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Package #{f.package_id}</span>
                <Badge variant="outline" className={cn('text-[10px]', config.color)}>
                  {config.label}
                </Badge>
              </div>

              <Progress value={usedPct} showValue />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Allocated</p>
                  <p className="font-medium">{Number(f.total_hours_allocated).toFixed(1)}h</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remaining</p>
                  <p className={cn('font-medium', remaining < 10 && 'text-destructive')}>{remaining.toFixed(1)}h</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg Monthly</p>
                  <p className="font-medium">{Number(f.average_monthly_usage).toFixed(1)}h</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Exhaustion</p>
                  <p className={cn('font-medium flex items-center gap-1', f.burn_risk_status === 'critical' && 'text-destructive')}>
                    <Calendar className="h-3 w-3" />
                    {f.projected_exhaustion_date || 'N/A'}
                  </p>
                </div>
              </div>

              {f.burn_risk_status !== 'on_track' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => createRenewalTask.mutate(f)}
                  disabled={createRenewalTask.isPending}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Renewal Planning Task
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
