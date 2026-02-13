/**
 * useClientProgress – Unicorn 2.0
 * Fetches client dashboard progress from v_client_dashboard_progress.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClientProgress {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  package_name: string;
  current_phase_name: string | null;
  phase_completion: number;
  steps_remaining: number;
  overall_score: number;
  documentation_coverage: number;
  risk_state: 'on_track' | 'needs_attention' | 'action_required';
  next_best_action_type: string;
  next_best_action_label: string;
  next_best_action_href: string;
  score_calculated_at: string | null;
}

export function useClientProgress(tenantId: number | null) {
  return useQuery({
    queryKey: ['client-progress', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('v_client_dashboard_progress' as any)
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return (data ?? []) as unknown as ClientProgress[];
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}
