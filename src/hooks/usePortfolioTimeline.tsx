import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent } from './useClientManagementData';
import { groupPortfolioTimelineEvents, type PortfolioTimelineEvent } from './portfolioTimelineGrouping';
import { fetchEnrollmentCourseContext } from './academyEnrollmentActorContext';

/**
 * Portfolio-wide (all clients) version of the per-client Timeline feed.
 * client_timeline_events RLS already grants every Vivacity staff role
 * SELECT across every tenant (client_timeline_events_vivacity_select,
 * 20260710000744) — no tenant filter, no new RPC needed.
 */

export type { PortfolioTimelineEvent };

export const PORTFOLIO_TIMELINE_QUERY_KEY = ['portfolio-timeline'] as const;

interface UsePortfolioTimelineOptions {
  limit?: number;
  eventTypes?: string[] | null;
  tenantIds?: number[] | null;
  search?: string;
}

interface PortfolioTimelineResult {
  events: PortfolioTimelineEvent[];
  hasMore: boolean;
}

// Mass admin actions (bulk enrollment, a broadcast fanned out to many
// tenants) fire the same DB trigger once per row, so `limit` raw rows can
// collapse into far fewer grouped rows. Over-fetch so the requested `limit`
// is met in *grouped* rows, not raw ones, without an unbounded query. The
// cap is generous (not just a small multiple of `limit`) because a handful
// of real-world mass-enrollment bursts can each run into the hundreds of
// rows and land back-to-back — a small cap gets entirely consumed by the
// two or three most recent bursts with no room left to reach anything else.
const RAW_FETCH_MULTIPLIER = 5;
const RAW_FETCH_CAP = 2000;

async function fetchRawRows(
  rawLimit: number,
  { eventTypes, tenantIds, search }: Omit<Required<UsePortfolioTimelineOptions>, 'limit'>
): Promise<TimelineEvent[]> {
  let query = supabase
    .from('client_timeline_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(rawLimit);

  if (eventTypes && eventTypes.length > 0) {
    query = query.in('event_type', eventTypes);
  }
  if (tenantIds && tenantIds.length > 0) {
    query = query.in('tenant_id', tenantIds);
  }
  if (search.trim()) {
    const term = search.trim().replace(/[%,]/g, '');
    query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as TimelineEvent[];
}

async function fetchPortfolioTimeline({
  limit,
  eventTypes,
  tenantIds,
  search,
}: Required<UsePortfolioTimelineOptions>): Promise<PortfolioTimelineResult> {
  let rawLimit = Math.min(limit * RAW_FETCH_MULTIPLIER, RAW_FETCH_CAP);
  let rows = await fetchRawRows(rawLimit, { eventTypes, tenantIds, search });
  if (rows.length === 0) return { events: [], hasMore: false };

  let grouped: PortfolioTimelineEvent[] = [];
  // A single large burst (e.g. one course auto-enrolling dozens of clients)
  // can dominate the most-recent raw rows entirely, leaving nothing else in
  // the window to group — grouped.length would collapse to 1 even though
  // there's plenty of older, still-relevant activity just past the fetch
  // window. Keep widening the raw fetch until there are enough *grouped*
  // items to satisfy `limit`, or we've genuinely run out of matching rows,
  // or hit the cap.
  while (true) {
    const distinctTenantIds = [...new Set(rows.map((r) => r.tenant_id))];
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name')
      .in('id', distinctTenantIds);
    const nameMap = new Map<number, string>((tenants || []).map((t: any) => [t.id, t.name]));

    const enriched = rows.map((r) => ({ ...r, tenant_name: nameMap.get(r.tenant_id) ?? 'Unknown client' }));
    const { courseInfoByCourseId, actorByUuid } = await fetchEnrollmentCourseContext(rows);
    grouped = groupPortfolioTimelineEvents(enriched, courseInfoByCourseId, actorByUuid);

    const exhausted = rows.length < rawLimit; // DB returned fewer than asked — nothing more exists
    const atCap = rawLimit >= RAW_FETCH_CAP;
    if (grouped.length >= limit || exhausted || atCap) break;

    rawLimit = Math.min(rawLimit * 2, RAW_FETCH_CAP);
    rows = await fetchRawRows(rawLimit, { eventTypes, tenantIds, search });
  }

  return {
    events: grouped.slice(0, limit),
    // "Load more" works by widening `limit` (and so `rawLimit`) on the next
    // fetch, not by an offset — so once `rawLimit` is pinned at the cap,
    // fetching again can never return anything new, and claiming hasMore
    // off `rows.length === rawLimit` alone would offer a "Load more" that
    // does nothing forever. Only claim more raw data is reachable while
    // there's still room to grow the fetch past the cap.
    hasMore: grouped.length > limit || (rows.length === rawLimit && rawLimit < RAW_FETCH_CAP),
  };
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
  const { limit = 8, eventTypes = null, tenantIds = null, search = '' } = options;
  const queryClient = useQueryClient();
  const queryKey = [
    ...PORTFOLIO_TIMELINE_QUERY_KEY,
    limit,
    eventTypes?.join(',') ?? 'all',
    tenantIds?.join(',') ?? 'all',
    search,
  ];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchPortfolioTimeline({ limit, eventTypes, tenantIds, search }),
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
    events: data?.events ?? [],
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
    refetch,
  };
}
