import type { TimelineEvent } from './useClientManagementData';

/**
 * Used by both the cross-tenant "Client Activity" dashboard feed
 * (usePortfolioTimeline) and the per-tenant Timeline (useClientTimeline) —
 * display-only in both cases, never mutating the underlying
 * client_timeline_events rows.
 *
 * A bulk/auto academy enrollment (useBulkEnroll/useEnrollTenant, or a
 * course published with available_to_all_clients) or a broadcast campaign
 * fanned out to many tenants each fire a DB trigger once per inserted row,
 * so the raw feed shows one near-identical row per user/tenant. This
 * collapses those into one summary row for display, and — even for a
 * lone row — rewords a clearly-automated enrollment (metadata.source is
 * set and isn't 'manual') so it doesn't read as the user's own action.
 */

export interface PortfolioTimelineEvent extends TimelineEvent {
  tenant_name: string;
  /** Present only on a synthetic row produced by grouping >1 raw events. */
  group_count?: number;
  group_kind?: 'enrollment' | 'enrollment_multi' | 'broadcast';
  /** All distinct tenant_ids folded into a multi-tenant enrollment or broadcast group. */
  group_tenant_ids?: number[];
  /** Set on 'enrollment_multi' groups when the course's slug is known, for click-through. */
  group_course_slug?: string;
}

/** Course info needed to word/link a grouped enrollment event — fetched by the caller. */
export interface CourseActorInfo {
  title: string;
  slug: string | null;
  actorUuid: string | null;
}

const ENROLLMENT_GROUP_WINDOW_MS = 10 * 60 * 1000;
const BROADCAST_GROUP_WINDOW_MS = 30 * 60 * 1000;

function occurredAtMs(e: PortfolioTimelineEvent): number {
  return new Date(e.occurred_at || e.created_at).getTime();
}

function extractCourseTitle(title: string): string {
  const match = /enrolled in (.+)$/i.exec(title);
  return match?.[1]?.trim() || 'an Academy course';
}

function extractUserName(title: string): string | null {
  const match = /^(.+?) enrolled in /i.exec(title);
  return match?.[1]?.trim() || null;
}

interface GroupKeyInfo {
  bucketKey: string;
  windowMs: number;
  kind: 'enrollment' | 'broadcast';
}

function groupKeyFor(e: PortfolioTimelineEvent): GroupKeyInfo | null {
  if (e.event_type === 'academy_enrolled') {
    const courseId = (e.metadata as Record<string, unknown> | null)?.course_id;
    if (courseId == null) return null;
    // Bucketed by course only (not tenant) so one platform-wide action — e.g.
    // publishing a course with available_to_all_clients — collapses into a
    // single cross-tenant row instead of one row per tenant.
    return {
      bucketKey: `enrollment:${String(courseId)}`,
      windowMs: ENROLLMENT_GROUP_WINDOW_MS,
      kind: 'enrollment',
    };
  }

  if (e.event_type === 'message_sent') {
    const metadata = e.metadata as Record<string, unknown> | null;
    if (metadata?.conversation_type !== 'broadcast') return null;
    const subject = String(metadata?.conversation_subject ?? '');
    const sender = e.created_by ?? '';
    return {
      bucketKey: `broadcast:${sender}:${subject}`,
      windowMs: BROADCAST_GROUP_WINDOW_MS,
      kind: 'broadcast',
    };
  }

  return null;
}

function buildGroupedEvent(
  cluster: PortfolioTimelineEvent[],
  kind: 'enrollment' | 'broadcast',
  courseInfoByCourseId: Map<string, CourseActorInfo>,
  actorNameByUuid: Map<string, string>
): PortfolioTimelineEvent {
  // Cluster is sorted newest-first; use the newest row as the template.
  const newest = cluster[0];
  const count = cluster.length;

  if (kind === 'enrollment') {
    const metadata = newest.metadata as Record<string, unknown> | null;
    const source = metadata?.source;
    const isAutoOrBulk = typeof source === 'string' && source !== 'manual';
    // A lone row with no bulk/auto signal is a genuine, ambiguous-actor
    // single enrollment — leave it exactly as the trigger wrote it.
    if (count === 1 && !isAutoOrBulk) return newest;

    const courseId = String(metadata?.course_id ?? '');
    const courseInfo = courseInfoByCourseId.get(courseId);
    const courseTitle = courseInfo?.title || extractCourseTitle(newest.title);
    const actorName = courseInfo?.actorUuid ? actorNameByUuid.get(courseInfo.actorUuid) : undefined;
    const verb = actorName ? `${actorName} auto enrolled` : 'Auto enrolled';
    const tenantIds = [...new Set(cluster.map((e) => e.tenant_id))];

    if (count === 1) {
      const userName = extractUserName(newest.title);
      return {
        ...newest,
        id: `group:enrollment:${courseId}:${newest.id}`,
        title: userName ? `${verb} ${userName} in ${courseTitle}` : `${verb} to ${courseTitle}`,
        group_kind: 'enrollment',
      };
    }

    if (tenantIds.length === 1) {
      return {
        ...newest,
        id: `group:enrollment:${courseId}:${newest.id}`,
        title: `${verb} ${count} users to ${courseTitle}`,
        group_count: count,
        group_kind: 'enrollment',
      };
    }

    // Cross-tenant: lead with the course (the informative part, like the
    // broadcast subject) and fold the client count into the subtitle
    // instead of leaving a bare "N clients" as the headline.
    return {
      ...newest,
      id: `group:enrollment-multi:${courseId}:${newest.id}`,
      title: `${verb} ${count} users across ${tenantIds.length} clients`,
      tenant_name: courseTitle,
      group_count: count,
      group_kind: 'enrollment_multi',
      group_tenant_ids: tenantIds,
      group_course_slug: courseInfo?.slug ?? undefined,
    };
  }

  // Broadcast bucket entry already required conversation_type === 'broadcast'
  // (see groupKeyFor), so every row here — even a lone one — gets the
  // subject-forward headline instead of the generic "X sent a message".
  const subject = (newest.metadata as Record<string, unknown> | null)?.conversation_subject as
    | string
    | null
    | undefined;
  const tenantIds = [...new Set(cluster.map((e) => e.tenant_id))];
  return {
    ...newest,
    id: `group:broadcast:${newest.created_by ?? 'unknown'}:${newest.id}`,
    title: `Sent to ${tenantIds.length} client${tenantIds.length === 1 ? '' : 's'}`,
    tenant_name: subject || 'Broadcast message',
    ...(count > 1 ? { group_count: count } : {}),
    group_kind: 'broadcast',
    group_tenant_ids: tenantIds,
  };
}

/**
 * A cross-tenant grouped row (broadcast, or an enrollment spanning many
 * clients) has no single tenant to open — route it somewhere more useful
 * than a misleading single-tenant Timeline. Returns null for anything that
 * should keep the default `/tenant/{tenant_id}?tab=timeline` navigation.
 */
export function groupedEventHref(event: PortfolioTimelineEvent): string | null {
  if (event.group_kind === 'broadcast') return '/communications';
  if (event.group_kind === 'enrollment_multi') {
    return event.group_course_slug ? `/academy/course/${event.group_course_slug}` : '/academy/courses';
  }
  return null;
}

/**
 * Groups is display-only: it never mutates or removes the underlying
 * client_timeline_events rows, and the per-tenant Timeline reads that table
 * directly (via RPC) so it stays fully granular. `events` must already be
 * sorted newest-first (the query already does this).
 *
 * `courseInfoByCourseId`/`actorNameByUuid` are pre-fetched by the caller
 * (usePortfolioTimeline) since this function stays a pure, synchronous
 * transform — no DB access here.
 */
export function groupPortfolioTimelineEvents(
  events: PortfolioTimelineEvent[],
  courseInfoByCourseId: Map<string, CourseActorInfo> = new Map(),
  actorNameByUuid: Map<string, string> = new Map()
): PortfolioTimelineEvent[] {
  const buckets = new Map<string, PortfolioTimelineEvent[]>();
  const bucketMeta = new Map<string, GroupKeyInfo>();
  const output: PortfolioTimelineEvent[] = [];

  for (const e of events) {
    const key = groupKeyFor(e);
    if (!key) {
      output.push(e);
      continue;
    }
    if (!buckets.has(key.bucketKey)) {
      buckets.set(key.bucketKey, []);
      bucketMeta.set(key.bucketKey, key);
    }
    buckets.get(key.bucketKey)!.push(e);
  }

  for (const [bucketKey, members] of buckets) {
    const meta = bucketMeta.get(bucketKey)!;
    let clusterStart = 0;
    for (let i = 1; i <= members.length; i++) {
      const prev = members[i - 1];
      const curr = members[i];
      const gapMs = curr ? occurredAtMs(prev) - occurredAtMs(curr) : Infinity;
      if (!curr || gapMs > meta.windowMs) {
        output.push(buildGroupedEvent(members.slice(clusterStart, i), meta.kind, courseInfoByCourseId, actorNameByUuid));
        clusterStart = i;
      }
    }
  }

  output.sort((a, b) => occurredAtMs(b) - occurredAtMs(a));
  return output;
}
