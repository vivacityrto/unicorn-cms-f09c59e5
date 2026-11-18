import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ScorecardInsight {
  headline: string;
  why: string[];
  actions: { action: string; detail: string; who: string; clients: string[] }[];
  watch: string | null;
}

export interface ScorecardInsightResult {
  insight: ScorecardInsight;
  generated_at: string;
  model: string;
  week_key: string;
}

/**
 * Viv's plain-language read of one measure for one week. It only runs when someone asks, and the answer is kept for
 * the session so reopening the report does not spend another AI call. Nothing is stored and nothing is created.
 */
export function useScorecardInsight(metricId: string, weekKey: string) {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ['scorecard-insight', metricId, weekKey],
    enabled: false,
    retry: false,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<ScorecardInsightResult> => {
      if (!profile) throw new Error('Sign in to ask Viv.');
      const { data, error } = await supabase.functions.invoke('scorecard-insight', { body: { metric_id: metricId, week_key: weekKey } });
      if (error) {
        // The function answers with a readable message in the body; show it rather than a generic one.
        const context = (error as { context?: Response }).context;
        const detail = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error ?? 'Viv could not read this measure. Please try again.');
      }
      return data as ScorecardInsightResult;
    },
  });
  return {
    result: query.data ?? null,
    isAsking: query.isFetching,
    error: query.isError ? (query.error as Error).message : null,
    ask: () => void query.refetch(),
  };
}
