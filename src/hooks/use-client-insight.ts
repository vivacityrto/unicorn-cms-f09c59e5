import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

export type InsightSurface = 'home' | 'packages' | 'academy';

export interface ClientInsight {
  summary: { headline: string; points: string[]; next_step: string };
  surface: InsightSurface;
  generated_at: string;
}

/** An insight is reused for this long, so pressing the button again within it costs nothing. */
export const INSIGHT_TTL_MS = 30 * 60_000;

/** The server's plain failure messages, keyed by the code it sends. */
export class InsightError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InsightError';
  }
}

async function requestInsight(surface: InsightSurface, previewTenantId: number | null): Promise<ClientInsight> {
  const { data, error } = await supabase.functions.invoke('client-insights', {
    body: previewTenantId ? { surface, preview_tenant_id: previewTenantId } : { surface },
  });
  if (error) {
    // The function answers with { ok: false, code, detail }; the client library hands back the raw response.
    let code = 'FAILED';
    let detail = 'Viv could not write a summary. Please try again.';
    try {
      const res = (error as { context?: Response }).context;
      const body = res ? ((await res.json()) as { code?: string; detail?: string }) : null;
      if (body?.code) code = body.code;
      if (body?.detail) detail = body.detail;
    } catch {
      /* Keep the plain message. */
    }
    throw new InsightError(code, detail);
  }
  const payload = data as { ok?: boolean; data?: ClientInsight } | ClientInsight | null;
  const insight = payload && 'data' in payload && payload.data ? payload.data : (payload as ClientInsight | null);
  if (!insight?.summary?.headline) throw new InsightError('NO_SUMMARY', 'Viv could not write a summary. Please try again.');
  return insight;
}

/**
 * Viv's written read of the figures on a page, written by AI ONLY when the person presses the button (`ask`). Nothing
 * runs when a page opens. A result is kept for 30 minutes, and `ask` while one is fresh returns it without calling the
 * model again, so repeated presses do not use tokens.
 */
export function useClientInsight(surface: InsightSurface) {
  const qc = useQueryClient();
  const { activeTenantId, isPreview, isAcademyOnly } = useClientTenant();
  const previewTenantId = isPreview && activeTenantId ? activeTenantId : null;
  const key = ['client-insight', surface, activeTenantId, previewTenantId] as const;
  const queryFn = useCallback(() => requestInsight(surface, previewTenantId), [surface, previewTenantId]);

  // Never fetches on its own (enabled: false); it only shows what `ask` has fetched.
  const query = useQuery({ queryKey: key, queryFn, enabled: false, staleTime: INSIGHT_TTL_MS, gcTime: INSIGHT_TTL_MS, retry: false });

  const ask = useCallback(() => qc.fetchQuery({ queryKey: key, queryFn, staleTime: INSIGHT_TTL_MS, retry: false }).catch(() => undefined), [qc, key, queryFn]);

  return {
    insight: query.data ?? null,
    isLoading: query.isFetching,
    error: query.error instanceof InsightError ? query.error : query.error ? new InsightError('FAILED', 'Viv could not write a summary. Please try again.') : null,
    /** Academy-only people have no client AI at all. */
    available: !isAcademyOnly && !!activeTenantId,
    ask,
  };
}
