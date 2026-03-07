import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MembershipStateOption {
  code: number;
  value: string;
  label: string;
  seq: number;
}

/**
 * Fetches membership state options from the dd_membership_state lookup table.
 * Excludes 'complete' by default since it's handled via is_complete.
 */
export function useMembershipStateOptions(includeComplete = false) {
  return useQuery({
    queryKey: ['dd_membership_state', includeComplete],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dd_membership_state' as any)
        .select('code, value, description, seq')
        .order('seq');
      if (error) throw error;
      const all = (data as any[]).map((d: any) => ({
        code: d.code,
        value: d.value,
        label: d.description,
        seq: d.seq,
      }));
      return includeComplete ? all : all.filter(s => s.value !== 'complete');
    },
    staleTime: 5 * 60_000,
  });
}
