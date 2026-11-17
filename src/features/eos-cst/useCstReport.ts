import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CstPeriod, CstReport } from './cstReport';

type UntypedRpc = (
  functionName: string,
  params: Record<string, string | null>,
) => Promise<{ data: unknown; error: Error | null }>;

// get_cst_report is deployed but not yet in the generated Supabase types.
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/**
 * CST report for a period, grouped by primary CSC. The RPC itself rejects
 * anyone who is not Vivacity staff, so this is safe to call from any page.
 * `anchor` is a yyyy-mm-dd date inside the wanted period (Sydney time);
 * omit it for the current period.
 */
export function useCstReport(period: CstPeriod, anchor?: string) {
  return useQuery({
    queryKey: ['eos', 'cst-report', period, anchor ?? 'current'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CstReport> => {
      const { data, error } = await rpc('get_cst_report', {
        p_period: period,
        p_anchor: anchor ?? null,
      });
      if (error) throw error;
      return data as CstReport;
    },
  });
}
