import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';
import type { PhaseProgressSummary } from '@/types/checkpoint-phase';

/**
 * Hook to fetch phase progress for a package instance at runtime.
 * Uses v_phase_progress_summary view.
 */
export function usePhaseProgress(packageInstanceId: number | null) {
  const { data: phases = [], isLoading } = useQuery({
    queryKey: ['phase-progress', packageInstanceId],
    queryFn: async (): Promise<PhaseProgressSummary[]> => {
      if (!packageInstanceId) return [];
      const { data, error } = await (supabase as any)
        .from('v_phase_progress_summary')
        .select('*')
        .eq('package_instance_id', packageInstanceId)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!packageInstanceId,
    staleTime: QUERY_STALE_TIMES.REALTIME,
  });

  return { phases, isLoading };
}
