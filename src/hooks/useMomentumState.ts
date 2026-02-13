/**
 * useMomentumState – Unicorn 2.0
 * Fetches momentum state per package instance from v_momentum_state.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MomentumStateValue = 'active' | 'paused' | 'at_risk' | 'recovered';

export interface MomentumState {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  client_name: string;
  package_name: string;
  manager_id: string | null;
  days_since_last_activity: number;
  days_in_current_phase: number;
  current_phase_name: string | null;
  has_unresolved_risk: boolean;
  has_active_critical: boolean;
  pause_reason: string[];
  is_paused: boolean;
  momentum_state: MomentumStateValue;
  recovery_eligible: boolean;
}

export function useMomentumState(tenantId: number | null, packageInstanceId?: number | null) {
  return useQuery({
    queryKey: ['momentum-state', tenantId, packageInstanceId],
    queryFn: async () => {
      if (!tenantId) return [];

      let query = supabase
        .from('v_momentum_state' as any)
        .select('*')
        .eq('tenant_id', tenantId);

      if (packageInstanceId) {
        query = query.eq('package_instance_id', packageInstanceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MomentumState[];
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

/** Fetch all momentum states for a consultant's clients */
export function useConsultantMomentumStates(userUuid: string | null) {
  return useQuery({
    queryKey: ['consultant-momentum-states', userUuid],
    queryFn: async () => {
      if (!userUuid) return [];

      const { data, error } = await supabase
        .from('v_momentum_state' as any)
        .select('*')
        .eq('manager_id', userUuid);

      if (error) throw error;
      return (data ?? []) as unknown as MomentumState[];
    },
    enabled: !!userUuid,
    staleTime: 30_000,
  });
}
