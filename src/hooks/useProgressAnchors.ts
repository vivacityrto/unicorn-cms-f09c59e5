/**
 * useProgressAnchors – Unicorn 2.0
 * Fetches data-driven progress anchor inputs from v_progress_anchor_inputs.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProgressAnchorData {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  client_name: string;
  package_name: string;
  overall_score: number;
  days_stale: number;
  is_stale: boolean;
  actions_remaining_current_phase: number;
  documents_pending_upload: number;
  next_milestone_label: string | null;
  has_active_critical: boolean;
}

export function useProgressAnchors(tenantId: number | null, packageInstanceId?: number | null) {
  return useQuery({
    queryKey: ['progress-anchors', tenantId, packageInstanceId],
    queryFn: async () => {
      if (!tenantId) return [];

      let query = supabase
        .from('v_progress_anchor_inputs' as any)
        .select('*')
        .eq('tenant_id', tenantId);

      if (packageInstanceId) {
        query = query.eq('package_instance_id', packageInstanceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ProgressAnchorData[];
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}
