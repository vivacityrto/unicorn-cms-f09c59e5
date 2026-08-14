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
  group_kind?: 'enrollment' | 'enrollment_multi' | 'broadcast' | 'document_delivery';
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

/** Resolved profile for a course's published_by/created_by — fetched by the caller. */
export interface ActorProfile {
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

const ENROLLMENT_GROUP_WINDOW_MS = 10 * 60 * 1000;
const BROADCAST_GROUP_WINDOW_MS = 30 * 60 * 1000;
// document_shared_to_client rows carry a real metadata.batch_id shared by
// every delivery in the same bulk-generate job / Generate-All run — a
// precise correlator, unlike broadcast's reconstructed sender+subject key.
// Still windowed (not grouped unconditionally) as a safety cap bounding
// memory/display, generous enough to cover a large bulk job's worker
// draining its item queue over time.
const DOCUMENT_DELIVERY_GROUP_WINDOW_MS = 2 * 60 * 60 * 1000;

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
  kind: 'enrollment' | 'broadcast' | 'document_delivery';
}

function groupKeyFor(e: PortfolioTimelineEvent, groupBroadcasts: boolean): GroupKeyInfo | null {
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

  if (e.event_type === 'message_sent' && groupBroadcasts) {
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

  if (e.event_type === 'document_shared_to_client') {
    const batchId = (e.metadata as Record<string, unknown> | null)?.batch_id;
    // No batch_id means this delivery wasn't part of a job/batch run (e.g. a
    // one-off single-document delivery) — nothing to correlate it with, so
    // it stays its own row.
    if (batchId == null) return null;
    return {
      bucketKey: `document_delivery:${String(batchId)}`,
      windowMs: DOCUMENT_DELIVERY_GROUP_WINDOW_MS,
      kind: 'document_delivery',
    };
  }

  return null;
}

function buildGroupedEvent(
  cluster: PortfolioTimelineEvent[],
  kind: 'enrollment' | 'broadcast' | 'document_delivery',
  courseInfoByCourseId: Map<string, CourseActorInfo>,
  actorByUuid: Map<string, ActorProfile>
): PortfolioTimelineEvent {
  // Cluster is sorted newest-first; use the newest row as the template.
  const newest = cluster[0];
  const count = cluster.length;

  if (kind === 'enrollment') {
    const metadata = newest.metadata as Record<string, unknown> | null;
    // Classify off the whole cluster, not just the newest row: a cluster is
    // sorted newest-first, so a single coincidental 'manual' enrollment
    // landing just after a large auto_all_clients burst (same course, same
    // 10-minute window) would otherwise flip the entire burst's wording and
    // attribution onto the manual path. Any auto/bulk row is proof enough.
    const isAutoOrBulk = cluster.some((e) => {
      const s = (e.metadata as Record<string, unknown> | null)?.source;
      return typeof s === 'string' && s !== 'manual';
    });
    // A lone row with no bulk/auto signal is a genuine, ambiguous-actor
    // single enrollment — leave it exactly as the trigger wrote it.
    if (count === 1 && !isAutoOrBulk) return newest;

    const courseId = String(metadata?.course_id ?? '');
    const courseInfo = courseInfoByCourseId.get(courseId);
    const courseTitle = courseInfo?.title || extractCourseTitle(newest.title);
    const tenantIds = [...new Set(cluster.map((e) => e.tenant_id))];

    let verb: string;
    let actorOverride: Partial<PortfolioTimelineEvent> = {};

    if (isAutoOrBulk) {
      // The trigger stamps created_by as enrolled_by, falling back to the
      // enrolled user's own id when no admin is recorded — true for this
      // source, so the row's own created_by can't be trusted. Resolve the
      // actor from the course instead, and override both fields so the
      // creator chip agrees with the headline.
      const actorProfile = courseInfo?.actorUuid ? actorByUuid.get(courseInfo.actorUuid) : undefined;
      verb = actorProfile ? `${actorProfile.name} auto enrolled` : 'Auto enrolled';
      actorOverride = actorProfile
        ? {
            created_by: courseInfo!.actorUuid,
            creator: {
              first_name: actorProfile.first_name,
              last_name: actorProfile.last_name,
              avatar_url: actorProfile.avatar_url,
            },
          }
        : {};
    } else {
      // metadata.source is 'manual' (or unset) and count > 1 — a deliberate
      // admin bulk-select (e.g. useBulkEnroll), which *does* set enrolled_by
      // reliably. Use the cluster's own actor rather than the course
      // publisher, and don't call it "auto" since a human chose these users.
      const rowActorUuids = new Set(cluster.map((e) => e.created_by).filter(Boolean));
      const rowActorUuid = rowActorUuids.size === 1 ? [...rowActorUuids][0] : null;
      const actorProfile = rowActorUuid ? actorByUuid.get(rowActorUuid) : undefined;
      if (actorProfile) {
        verb = `${actorProfile.name} enrolled`;
      } else {
        // Mixed/unresolved actors — a coincidental cluster, not one
        // action. Don't claim a specific actor rather than guess wrong.
        verb = 'Multiple staff enrolled';
        actorOverride = { creator: undefined };
      }
    }

    if (count === 1) {
      const userName = extractUserName(newest.title);
      return {
        ...newest,
        ...actorOverride,
        id: `group:enrollment:${courseId}:${newest.id}`,
        title: userName ? `${verb} ${userName} in ${courseTitle}` : `${verb} to ${courseTitle}`,
        group_kind: 'enrollment',
      };
    }

    if (tenantIds.length === 1) {
      return {
        ...newest,
        ...actorOverride,
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
      ...actorOverride,
      id: `group:enrollment-multi:${courseId}:${newest.id}`,
      title: `${verb} ${count} users across ${tenantIds.length} clients`,
      tenant_name: courseTitle,
      group_count: count,
      group_kind: 'enrollment_multi',
      group_tenant_ids: tenantIds,
      group_course_slug: courseInfo?.slug ?? undefined,
    };
  }

  if (kind === 'document_delivery') {
    // A lone delivery (no burst in this batch) keeps its own natural title —
    // no rewording needed, unlike broadcast/enrollment which reword even a
    // single row for attribution reasons.
    if (count === 1) return newest;

    const tenantIds = [...new Set(cluster.map((e) => e.tenant_id))];
    const documentIds = new Set(
      cluster
        .map((e) => (e.metadata as Record<string, unknown> | null)?.document_id)
        .filter((id) => id != null),
    );
    const docCount = documentIds.size;
    const batchId = (newest.metadata as Record<string, unknown> | null)?.batch_id;

    if (tenantIds.length === 1) {
      return {
        ...newest,
        id: `group:document_delivery:${String(batchId)}:${newest.id}`,
        title: `${count} documents delivered to your account`,
        group_count: count,
        group_kind: 'document_delivery',
      };
    }

    // Cross-tenant — mirrors the broadcast headline shape ("Sent to N
    // clients"), with the document (or "bulk document generation" when the
    // batch spans more than one) as the subtitle.
    const singleDocTitle =
      docCount === 1
        ? (newest.metadata as Record<string, unknown> | null)?.delivered_file_name as string | undefined
        : undefined;
    return {
      ...newest,
      id: `group:document_delivery:${String(batchId)}:${newest.id}`,
      title: `Delivered to ${tenantIds.length} clients`,
      tenant_name: singleDocTitle || `${docCount} documents`,
      group_count: count,
      group_kind: 'document_delivery',
      group_tenant_ids: tenantIds,
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
  // Only the cross-tenant document_delivery shape needs an override — the
  // single-tenant multi-doc case has group_tenant_ids unset and falls
  // through to the default per-tenant Timeline href, which is already right.
  if (event.group_kind === 'document_delivery' && event.group_tenant_ids) return '/manage-documents';
  return null;
}

export interface GroupOptions {
  /**
   * Broadcast collapsing only makes sense where `tenant_name` is actually
   * rendered (the cross-tenant dashboard) — the per-tenant Timeline shows
   * `title`/`body` only, so rewording a broadcast there would just lose
   * the subject and message body. Default true (dashboard); pass false
   * for the per-tenant Timeline.
   */
  groupBroadcasts?: boolean;
}

/**
 * Groups is display-only: it never mutates or removes the underlying
 * client_timeline_events rows, and the per-tenant Timeline reads that table
 * directly (via RPC) so it stays fully granular. `events` must already be
 * sorted newest-first (the query already does this).
 *
 * `courseInfoByCourseId`/`actorByUuid` are pre-fetched by the caller
 * (fetchEnrollmentCourseContext) since this function stays a pure,
 * synchronous transform — no DB access here.
 */
export function groupPortfolioTimelineEvents(
  events: PortfolioTimelineEvent[],
  courseInfoByCourseId: Map<string, CourseActorInfo> = new Map(),
  actorByUuid: Map<string, ActorProfile> = new Map(),
  options: GroupOptions = {}
): PortfolioTimelineEvent[] {
  const { groupBroadcasts = true } = options;
  const buckets = new Map<string, PortfolioTimelineEvent[]>();
  const bucketMeta = new Map<string, GroupKeyInfo>();

  // A broadcast's fan-out is exactly one message per tenant conversation
  // (entity_id = conversation_id). A later reply lands in that same
  // conversation and would otherwise share the bucket key (sender+subject)
  // and get folded into the original blast, inflating its count. Only the
  // earliest message per conversation is eligible for bucketing; anything
  // later sharing that entity_id is a reply and stays its own row. Computed
  // up front (not "first seen while iterating") since `events` is
  // newest-first and the earliest message is what we actually want to keep.
  const earliestAtByEntityId = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== 'message_sent' || !e.entity_id) continue;
    const t = occurredAtMs(e);
    const cur = earliestAtByEntityId.get(e.entity_id);
    if (cur === undefined || t < cur) earliestAtByEntityId.set(e.entity_id, t);
  }

  const output: PortfolioTimelineEvent[] = [];

  for (const e of events) {
    const key = groupKeyFor(e, groupBroadcasts);
    if (!key) {
      output.push(e);
      continue;
    }
    if (key.kind === 'broadcast' && e.entity_id && occurredAtMs(e) !== earliestAtByEntityId.get(e.entity_id)) {
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
        output.push(buildGroupedEvent(members.slice(clusterStart, i), meta.kind, courseInfoByCourseId, actorByUuid));
        clusterStart = i;
      }
    }
  }

  output.sort((a, b) => occurredAtMs(b) - occurredAtMs(a));
  return output;
}
