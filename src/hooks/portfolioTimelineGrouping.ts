import type { TimelineEvent } from './useClientManagementData';

/**
 * Cross-tenant "Client Activity" dashboard feed only — never applied to the
 * per-tenant Timeline (rpc_search_timeline_events / ClientTimelineTab), which
 * intentionally keeps one row per underlying client_timeline_events row so
 * staff can see exactly which users/messages made up an admin action.
 *
 * A single bulk academy enrollment (useBulkEnroll/useEnrollTenant) or a
 * broadcast campaign fanned out to many tenants each fire a DB trigger once
 * per inserted row, so the raw feed shows one near-identical row per
 * user/tenant. This collapses those into one summary row for display.
 */

export interface PortfolioTimelineEvent extends TimelineEvent {
  tenant_name: string;
  /** Present only on a synthetic row produced by grouping >1 raw events. */
  group_count?: number;
  group_kind?: 'enrollment' | 'broadcast';
  /** All distinct tenant_ids folded into a broadcast group. */
  group_tenant_ids?: number[];
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

interface GroupKeyInfo {
  bucketKey: string;
  windowMs: number;
  kind: 'enrollment' | 'broadcast';
}

function groupKeyFor(e: PortfolioTimelineEvent): GroupKeyInfo | null {
  if (e.event_type === 'academy_enrolled') {
    const courseId = (e.metadata as Record<string, unknown> | null)?.course_id;
    if (courseId == null) return null;
    return {
      bucketKey: `enrollment:${e.tenant_id}:${String(courseId)}`,
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
  kind: 'enrollment' | 'broadcast'
): PortfolioTimelineEvent {
  if (cluster.length === 1) return cluster[0];

  // Cluster is sorted newest-first; use the newest row as the template.
  const newest = cluster[0];
  const count = cluster.length;

  if (kind === 'enrollment') {
    const courseTitle = extractCourseTitle(newest.title);
    const courseId = (newest.metadata as Record<string, unknown> | null)?.course_id;
    return {
      ...newest,
      id: `group:enrollment:${newest.tenant_id}:${String(courseId)}:${newest.id}`,
      title: `${count} users enrolled in ${courseTitle}`,
      group_count: count,
      group_kind: 'enrollment',
    };
  }

  const subject = (newest.metadata as Record<string, unknown> | null)?.conversation_subject as
    | string
    | null
    | undefined;
  const tenantIds = [...new Set(cluster.map((e) => e.tenant_id))];
  return {
    ...newest,
    id: `group:broadcast:${newest.created_by ?? 'unknown'}:${newest.id}`,
    title: subject ? `Broadcast sent to ${tenantIds.length} clients: ${subject}` : `Broadcast sent to ${tenantIds.length} clients`,
    tenant_name: `${tenantIds.length} clients`,
    group_count: count,
    group_kind: 'broadcast',
    group_tenant_ids: tenantIds,
  };
}

/**
 * Groups is display-only: it never mutates or removes the underlying
 * client_timeline_events rows, and the per-tenant Timeline reads that table
 * directly (via RPC) so it stays fully granular. `events` must already be
 * sorted newest-first (the query already does this).
 */
export function groupPortfolioTimelineEvents(
  events: PortfolioTimelineEvent[]
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
        output.push(buildGroupedEvent(members.slice(clusterStart, i), meta.kind));
        clusterStart = i;
      }
    }
  }

  output.sort((a, b) => occurredAtMs(b) - occurredAtMs(a));
  return output;
}
