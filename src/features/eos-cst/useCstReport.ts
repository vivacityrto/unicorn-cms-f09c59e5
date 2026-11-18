import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { historyAnchors } from './cstHistory';
import type { CstPeriod, CstReport } from './cstReport';

type UntypedRpc = (
  functionName: string,
  params: Record<string, string | null>,
) => Promise<{ data: unknown; error: Error | null }>;

// get_cst_report is deployed but not yet in the generated Supabase types.
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

async function fetchCstReport(period: CstPeriod, anchor: string | undefined): Promise<CstReport> {
  const { data, error } = await rpc('get_cst_report', {
    p_period: period,
    p_anchor: anchor ?? null,
  });
  if (error) throw error;
  return data as CstReport;
}

const STALE = 5 * 60_000;
const keyFor = (period: CstPeriod, anchor: string | undefined) => ['eos', 'cst-report', period, anchor ?? 'current'] as const;

/**
 * CST report for a period, grouped by primary CSC. The RPC itself rejects
 * anyone who is not Vivacity staff, so this is safe to call from any page.
 * `anchor` is a yyyy-mm-dd date inside the wanted period (Sydney time);
 * omit it for the current period.
 */
export function useCstReport(period: CstPeriod, anchor?: string) {
  return useQuery({
    queryKey: keyFor(period, anchor),
    staleTime: STALE,
    queryFn: () => fetchCstReport(period, anchor),
  });
}

/**
 * The same report for this period and the ones before it, oldest first, ending with the period that contains `anchor`.
 * It shares its cache with useCstReport, so the period already on screen is not fetched twice. A period that fails
 * stays undefined, which the comparison treats as a gap.
 */
export function useCstHistory(period: CstPeriod, anchor: string, enabled = true) {
  const anchors = historyAnchors(period, anchor);
  const results = useQueries({
    queries: anchors.map((a) => ({
      queryKey: keyFor(period, a),
      staleTime: STALE,
      enabled,
      queryFn: () => fetchCstReport(period, a),
    })),
  });
  return {
    anchors,
    reports: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    failed: results.filter((r) => r.isError).length,
  };
}
