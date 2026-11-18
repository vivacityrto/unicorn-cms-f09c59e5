import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { parseClientDetail, type ClientPerson } from './clientDetail';

type Rpc = (fn: string, params: Record<string, string | number | null>) => Promise<{ data: unknown; error: { message: string } | null }>;

// get_cst_client_detail is not in the generated Supabase types yet.
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

/**
 * Everyone at one client, with what each did in the 28 days ending the Sunday that ends the week under review.
 * The function rejects anyone who is not Vivacity staff, so this is safe to call from any page.
 */
export function useClientDetail(tenantId: number | null, weekEnding: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['scorecard-client-detail', tenantId, weekEnding],
    staleTime: 5 * 60_000,
    enabled: !!profile && tenantId !== null,
    queryFn: async (): Promise<ClientPerson[]> => {
      const { data, error } = await rpc('get_cst_client_detail', { p_tenant_id: tenantId, p_anchor: weekEnding });
      if (error) throw new Error(error.message);
      return parseClientDetail(data);
    },
  });
}
