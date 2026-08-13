import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent } from './useClientManagementData';
import { groupPortfolioTimelineEvents, type PortfolioTimelineEvent, type CourseActorInfo } from './portfolioTimelineGrouping';

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
// is met in *grouped* rows, not raw ones, without an unbounded query.
const RAW_FETCH_MULTIPLIER = 5;
const RAW_FETCH_CAP = 500;

interface CourseRow {
  id: number | string;
  title: string;
  slug: string | null;
  published_by: string | null;
  created_by: string | null;
}

interface ActorRow {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * The academy_enrolled trigger stamps created_by as enrolled_by, falling
 * back to the enrolled user's own id when no admin is recorded (true for a
 * whole-course auto-enrollment) — so it can't be trusted as "who did this".
 * The course's own published_by/created_by is the reliable actor for that
 * case, so grouped enrollment titles resolve the actor from there instead.
 */
async function fetchEnrollmentCourseContext(
  rows: TimelineEvent[]
): Promise<{ courseInfoByCourseId: Map<string, CourseActorInfo>; actorNameByUuid: Map<string, string> }> {
  const courseIds = [
    ...new Set(
      rows
        .filter((r) => r.event_type === 'academy_enrolled')
        .map((r) => (r.metadata as Record<string, unknown> | null)?.course_id)
        .filter((id): id is number | string => id != null)
    ),
  ];
  if (courseIds.length === 0) {
    return { courseInfoByCourseId: new Map(), actorNameByUuid: new Map() };
  }

  const { data: courses } = await supabase
    .from('academy_courses')
    .select('id, title, slug, published_by, created_by')
    .in('id', courseIds);

  const courseInfoByCourseId = new Map<string, CourseActorInfo>(
    ((courses || []) as CourseRow[]).map((c) => [
      String(c.id),
      { title: c.title, slug: c.slug ?? null, actorUuid: c.published_by ?? c.created_by ?? null },
    ])
  );

  const actorUuids = [...new Set([...courseInfoByCourseId.values()].map((c) => c.actorUuid).filter(Boolean))] as string[];
  if (actorUuids.length === 0) {
    return { courseInfoByCourseId, actorNameByUuid: new Map() };
  }

  const { data: actors } = await supabase
    .from('users')
    .select('user_uuid, first_name, last_name')
    .in('user_uuid', actorUuids);

  const actorNameByUuid = new Map<string, string>(
    ((actors || []) as ActorRow[])
      .map((u): [string, string] => [u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(' ').trim()])
      .filter(([, name]) => !!name)
  );

  return { courseInfoByCourseId, actorNameByUuid };
}

async function fetchPortfolioTimeline({
  limit,
  eventTypes,
  tenantIds,
  search,
}: Required<UsePortfolioTimelineOptions>): Promise<PortfolioTimelineResult> {
  const rawLimit = Math.min(limit * RAW_FETCH_MULTIPLIER, RAW_FETCH_CAP);
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

  const rows = (data || []) as unknown as TimelineEvent[];
  if (rows.length === 0) return { events: [], hasMore: false };

  const distinctTenantIds = [...new Set(rows.map((r) => r.tenant_id))];
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .in('id', distinctTenantIds);
  const nameMap = new Map<number, string>((tenants || []).map((t: any) => [t.id, t.name]));

  const enriched = rows.map((r) => ({ ...r, tenant_name: nameMap.get(r.tenant_id) ?? 'Unknown client' }));

  const { courseInfoByCourseId, actorNameByUuid } = await fetchEnrollmentCourseContext(rows);
  const grouped = groupPortfolioTimelineEvents(enriched, courseInfoByCourseId, actorNameByUuid);

  return {
    events: grouped.slice(0, limit),
    hasMore: grouped.length > limit || rows.length === rawLimit,
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
