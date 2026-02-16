import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export type RiskAlertType =
  | 'high_severity_risk'
  | 'critical_stage'
  | 'regulator_overlap'
  | 'repeated_gap'
  | 'rapid_risk_spike'
  | 'consultant_overload_risk';

export type AlertSeverity = 'moderate' | 'high' | 'critical';

export interface RealTimeRiskAlert {
  id: string;
  tenant_id: number;
  source_entity_id: string | null;
  source_type: string | null;
  alert_type: RiskAlertType;
  severity: AlertSeverity;
  alert_summary: string;
  recommended_actions_json: { action: string; priority: string }[];
  acknowledged_flag: boolean;
  acknowledged_by_user_id: string | null;
  acknowledged_at: string | null;
  resolved_flag: boolean;
  resolved_at: string | null;
  archived_flag: boolean;
  created_at: string;
  dedupe_hash: string | null;
}

export interface RiskCommandOverview {
  total: number;
  critical: number;
  high: number;
  moderate: number;
  unacknowledged: number;
  unresolvedOver14Days: number;
  byType: Record<string, number>;
}

export function useRiskCommandAlerts() {
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['risk-command-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('real_time_risk_alerts')
        .select('*')
        .eq('archived_flag', false)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as RealTimeRiskAlert[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('rt-risk-alerts-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'real_time_risk_alerts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['risk-command-alerts'] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const overview: RiskCommandOverview = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    moderate: alerts.filter(a => a.severity === 'moderate').length,
    unacknowledged: alerts.filter(a => !a.acknowledged_flag && !a.resolved_flag).length,
    unresolvedOver14Days: alerts.filter(a => {
      if (a.resolved_flag) return false;
      const age = Date.now() - new Date(a.created_at).getTime();
      return age > 14 * 86400000;
    }).length,
    byType: alerts.reduce((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  return { alerts, overview, isLoading };
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ alertId, userId }: { alertId: string; userId: string }) => {
      const { error } = await supabase
        .from('real_time_risk_alerts')
        .update({
          acknowledged_flag: true,
          acknowledged_by_user_id: userId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['risk-command-alerts'] }),
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('real_time_risk_alerts')
        .update({
          resolved_flag: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['risk-command-alerts'] }),
  });
}
