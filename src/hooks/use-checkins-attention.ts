import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CheckinsAttention } from '@/components/dashboard/checkinsAttention';

type UntypedRpc = (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Packages whose client check-ins need a consultant's attention (get_checkins_attention). Staff and super admins only;
 * the function refuses anyone else. Not in the generated types yet, hence the cast.
 */
export function useCheckinsAttention(enabled = true) {
  return useQuery({
    queryKey: ['checkins-attention'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CheckinsAttention> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc('get_checkins_attention', {});
      if (error) throw new Error(error.message);
      return (data ?? { items: [] }) as CheckinsAttention;
    },
  });
}
