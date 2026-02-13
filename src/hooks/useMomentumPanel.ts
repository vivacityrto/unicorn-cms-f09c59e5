/**
 * useMomentumPanel – Unicorn 2.0
 * Fetches consultant's momentum data from v_dashboard_consultant_momentum.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MomentumClient {
  user_uuid: string;
  tenant_id: number;
  client_name: string;
  package_instance_id: number;
  package_id: number;
  package_name: string;
  overall_score: number;
  phase_completion: number;
  risk_health: number;
  consult_health: number;
  days_stale: number;
  is_stale: boolean;
  caps_applied: any[];
  hours_remaining: number;
  risk_state: 'critical' | 'at_risk' | 'on_track';
  score_calculated_at: string | null;
}

export function useMomentumPanel(userUuid: string | null) {
  return useQuery({
    queryKey: ['momentum-panel', userUuid],
    queryFn: async () => {
      if (!userUuid) return [];

      const { data, error } = await supabase
        .from('v_dashboard_consultant_momentum' as any)
        .select('*')
        .eq('user_uuid', userUuid);

      if (error) throw error;
      return (data ?? []) as unknown as MomentumClient[];
    },
    enabled: !!userUuid,
    staleTime: 30_000,
  });
}
