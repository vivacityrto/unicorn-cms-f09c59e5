/**
 * useExecutiveData – Unicorn 2.0
 *
 * Fetches momentum + consultant distribution data for the redesigned Executive Dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MomentumData {
  phases_completed_7d: number;
  phases_completed_prev_7d: number;
  documents_generated_7d: number;
  documents_generated_prev_7d: number;
  clients_moved_forward_7d: number;
  clients_moved_forward_prev_7d: number;
  rocks_closed_7d: number;
  rocks_closed_prev_7d: number;
  hours_logged_7d: number;
  hours_logged_prev_7d: number;
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
    queryFn: async (): Promise<MomentumData> => {
      const { data, error } = await supabase
        .from('v_executive_momentum_7d' as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as MomentumData;
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
