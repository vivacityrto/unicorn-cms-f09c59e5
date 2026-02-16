/**
 * useWorkflowOptimisation – Unicorn 2.0 Phase 16
 * Hooks for workflow signals, metrics, and executive overview.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkflowSignal {
  id: string;
  tenant_id: number | null;
  stage_instance_id: number | null;
  consultant_user_id: string | null;
  signal_type: string;
  signal_severity: string;
  signal_summary: string;
  suggested_action_json: string[];
  created_at: string;
  resolved_flag: boolean;
  resolved_at: string | null;
}

export function useActiveWorkflowSignals() {
  return useQuery({
    queryKey: ['workflow-signals-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_optimisation_signals')
        .select('*')
        .eq('resolved_flag', false)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WorkflowSignal[];
    },
  });
}

export function useResolveWorkflowSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (signalId: string) => {
      const { error } = await supabase
        .from('workflow_optimisation_signals')
        .update({ resolved_flag: true, resolved_at: new Date().toISOString() })
        .eq('id', signalId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-signals-active'] }),
  });
}

export interface WorkflowOverview {
  active_bottlenecks: number;
  rework_signals: number;
  imbalance_signals: number;
  stalled_signals: number;
  unresolved_14d: number;
  total_unresolved: number;
}

export function useWorkflowOverview() {
  return useQuery({
    queryKey: ['workflow-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_optimisation_signals')
        .select('signal_type, signal_severity, created_at')
        .eq('resolved_flag', false);
      if (error) throw error;

      const all = data ?? [];
      const d14 = new Date(Date.now() - 14 * 86400000).toISOString();

      return {
        active_bottlenecks: all.filter((s: any) => s.signal_type === 'bottleneck_detected').length,
        rework_signals: all.filter((s: any) => s.signal_type === 'repeated_rework').length,
        imbalance_signals: all.filter((s: any) => s.signal_type === 'workload_imbalance').length,
        stalled_signals: all.filter((s: any) => s.signal_type === 'stalled_stage').length,
        unresolved_14d: all.filter((s: any) => s.created_at < d14).length,
        total_unresolved: all.length,
      } as WorkflowOverview;
    },
  });
}
