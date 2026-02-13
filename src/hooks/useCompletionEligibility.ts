/**
 * useCompletionEligibility – Unicorn 2.0
 * Fetches completion eligibility from v_completion_eligibility.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompletionEligibility {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  is_final_phase_completed: boolean;
  missing_required_docs_ratio: number;
  has_active_critical: boolean;
  eligible: boolean;
  ineligible_reasons: string[];
}

export function useCompletionEligibility(tenantId: number | null, packageInstanceId: number | null) {
  return useQuery({
    queryKey: ['completion-eligibility', tenantId, packageInstanceId],
    queryFn: async () => {
      if (!tenantId || !packageInstanceId) return null;

      const { data, error } = await supabase
        .from('v_completion_eligibility' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('package_instance_id', packageInstanceId)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as CompletionEligibility | null;
    },
    enabled: !!tenantId && !!packageInstanceId,
    staleTime: 30_000,
  });
}
