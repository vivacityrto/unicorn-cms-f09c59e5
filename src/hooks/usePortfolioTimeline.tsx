import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent } from './useClientManagementData';

/**
 * Portfolio-wide (all clients) version of the per-client Timeline feed.
 * client_timeline_events RLS already grants every Vivacity staff role
 * SELECT across every tenant (client_timeline_events_vivacity_select,
 * 20260710000744) — no tenant filter, no new RPC needed.
 */

export interface PortfolioTimelineEvent extends TimelineEvent {
  tenant_name: string;
}

export const PORTFOLIO_TIMELINE_QUERY_KEY = ['portfolio-timeline'] as const;

interface UsePortfolioTimelineOptions {
  limit?: number;
  eventTypes?: string[] | null;
  search?: string;
}

async function fetchPortfolioTimeline({
  limit,
  eventTypes,
  search,
}: Required<UsePortfolioTimelineOptions>): Promise<PortfolioTimelineEvent[]> {
  let query = supabase
    .from('client_timeline_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (eventTypes && eventTypes.length > 0) {
    query = query.in('event_type', eventTypes);
  }
  if (search.trim()) {
    const term = search.trim().replace(/[%,]/g, '');
    query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as unknown as TimelineEvent[];
  if (rows.length === 0) return [];

  const tenantIds = [...new Set(rows.map((r) => r.tenant_id))];
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .in('id', tenantIds);
  const nameMap = new Map<number, string>((tenants || []).map((t: any) => [t.id, t.name]));

  return rows.map((r) => ({ ...r, tenant_name: nameMap.get(r.tenant_id) ?? 'Unknown client' }));
}

/**
 * `refetchInterval` is a deliberate safety net, not the primary update
 * mechanism — several existing hooks in this codebase (e.g.
 * useRiskCommandCentre.ts) subscribe to postgres_changes on tables that
 * were never added to the supabase_realtime publication, so those
 * subscriptions silently never fire. client_timeline_events was added to
 * the publication alongside this hook (see the accompanying migration), so
 * the realtime path should work — but polling underneath means the widget
 * still updates within ~30s even if a websocket drops or Realtime has an
 * outage, rather than going silently stale.
 */
export function usePortfolioTimeline(options: UsePortfolioTimelineOptions = {}) {
  const { limit = 8, eventTypes = null, search = '' } = options;
  const queryClient = useQueryClient();
  const queryKey = [...PORTFOLIO_TIMELINE_QUERY_KEY, limit, eventTypes?.join(',') ?? 'all', search];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchPortfolioTimeline({ limit, eventTypes, search }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`portfolio-timeline-live-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_timeline_events' },
        () => {
          queryClient.invalidateQueries({ queryKey: PORTFOLIO_TIMELINE_QUERY_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    events: data ?? [],
    isLoading,
    error,
    refetch,
  };
}
