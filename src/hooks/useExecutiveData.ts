/**
 * useExecutiveData – Unicorn 2.0
 *
 * Fetches momentum + consultant distribution data for the redesigned Executive Dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MomentumData {
  tenant_id: number;
  risks_resolved_7d: number;
  risks_resolved_prev_7d: number;
  risks_resolved_delta: number;
  documents_generated_7d: number;
  documents_generated_prev_7d: number;
  documents_generated_delta: number;
  document_events_7d: number;
  document_events_prev_7d: number;
  document_events_delta: number;
  phases_completed_7d: number;
  phases_completed_prev_7d: number;
  phases_completed_delta: number;
  consult_hours_logged_7d: number;
  consult_hours_logged_prev_7d: number;
  consult_hours_logged_delta: number;
}

export interface ConsultantDistRow {
  consultant_uuid: string;
  consultant_name: string;
  client_count: number;
  immediate_count: number;
  at_risk_count: number;
  stalled_count: number;
  avg_score: number;
  avg_score_delta_7d: number;
}

export function useExecutiveMomentum() {
  return useQuery({
    queryKey: ['executive-momentum'],
    queryFn: async (): Promise<MomentumData[]> => {
      const { data, error } = await supabase
        .from('v_exec_execution_momentum_7d' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as MomentumData[];
    },
    staleTime: 30_000,
  });
}

export interface SystemHealthData {
  tenant_id: number;
  active_clients: number;
  clients_with_compliance_snapshot: number;
  compliance_coverage_pct: number;
  latest_compliance_snapshot_at: string | null;
}

export function useExecSystemHealth() {
  return useQuery({
    queryKey: ['exec-system-health'],
    queryFn: async (): Promise<SystemHealthData[]> => {
      const { data, error } = await supabase
        .from('v_exec_system_health' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as SystemHealthData[];
    },
    staleTime: 30_000,
  });
}

export function useConsultantDistribution() {
  return useQuery({
    queryKey: ['executive-consultant-dist'],
    queryFn: async (): Promise<ConsultantDistRow[]> => {
      const { data, error } = await supabase
        .from('v_executive_consultant_distribution' as any)
        .select('*')
        .order('immediate_count', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConsultantDistRow[];
    },
    staleTime: 30_000,
  });
}
