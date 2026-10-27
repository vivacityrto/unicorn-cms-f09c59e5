import type { RockWithHierarchy } from '@/types/eos';
import { todayLocalIso } from '@/utils/localDate';
import { emptyBreakdown, type MilestoneBreakdown } from '@/utils/rockMilestoneRollup';
import { dbToUiStatus, type UiRockStatus } from '@/utils/rockStatusUtils';

export type StatusCounts = Record<UiRockStatus, number> & { total: number };

/** Why a Rock is worth discussing in the meeting. */
export type AttentionReason =
  | 'off_track'
  | 'at_risk'
  | 'blocked_milestones'
  | 'overdue_milestones'
  | 'rock_overdue'
  | 'no_owner';

export interface RockCascadeNode {
  rock: RockWithHierarchy;
  /** In the meeting's rocks_scope, so the facilitator can set its status. */
  reviewable: boolean;
  children: RockCascadeNode[];
  /** Status counts across every descendant (not including this Rock). */
  descendants: StatusCounts;
  /** Reasons this Rock itself needs discussing. */
  attention: AttentionReason[];
  /** This Rock, or anything cascading from it, needs discussing. */
  needsAttention: boolean;
}

export interface MeetingRocksCascade {
  roots: RockCascadeNode[];
  /** Flat, owner-sorted list of the Rocks under review (same set the old list showed). */
  reviewRocks: RockWithHierarchy[];
  counts: StatusCounts;
  /** Active milestones across everything under review. Each root already includes what cascades from it. */
  milestoneTotals: MilestoneBreakdown;
}

const LEVEL_ORDER: Record<string, number> = { company: 0, team: 1, individual: 2 };

export function emptyCounts(): StatusCounts {
  return { not_started: 0, on_track: 0, at_risk: 0, off_track: 0, complete: 0, total: 0 };
}

/** An empty scope means "all levels", matching the Configuration's behaviour. */
export function isRockInReviewScope(rock: RockWithHierarchy, scope: readonly string[]): boolean {
  return scope.length === 0 || scope.includes(rock.rock_level ?? '');
}

function addTo(counts: StatusCounts, rock: RockWithHierarchy) {
  counts[dbToUiStatus(rock.status)] += 1;
  counts.total += 1;
}

function mergeInto(target: StatusCounts, source: StatusCounts) {
  target.not_started += source.not_started;
  target.on_track += source.on_track;
  target.at_risk += source.at_risk;
  target.off_track += source.off_track;
  target.complete += source.complete;
  target.total += source.total;
}

/**
 * Why this Rock itself is worth discussing: its own status is off track or at
 * risk, milestones under it are blocked, off track or overdue, the Rock is past
 * its due date, or nobody owns it. A completed Rock never needs attention.
 */
export function attentionReasons(rock: RockWithHierarchy, now: Date = new Date()): AttentionReason[] {
  const status = dbToUiStatus(rock.status);
  if (status === 'complete') return [];
  const reasons: AttentionReason[] = [];
  if (status === 'off_track') reasons.push('off_track');
  if (status === 'at_risk') reasons.push('at_risk');
  const m = rock.milestoneBreakdown;
  if (m && (m.blocked > 0 || m.offTrack > 0)) reasons.push('blocked_milestones');
  if (m && m.overdue > 0) reasons.push('overdue_milestones');
  if (rock.due_date && rock.due_date.slice(0, 10) < todayLocalIso(now)) reasons.push('rock_overdue');
  if (!rock.owner_id) reasons.push('no_owner');
  return reasons;
}

/** A node with no cascade, for the flat list. */
export function standaloneNode(rock: RockWithHierarchy, scope: readonly string[], now: Date = new Date()): RockCascadeNode {
  const attention = attentionReasons(rock, now);
  return {
    rock,
    reviewable: isRockInReviewScope(rock, scope),
    children: [],
    descendants: emptyCounts(),
    attention,
    needsAttention: attention.length > 0,
  };
}

/**
 * Builds the Company → Team → Individual cascade for the meeting's Rock Review.
 *
 * - Rocks under review are those in `scope` and not complete (as before).
 * - A reviewed Rock is a root unless its parent is also under review.
 * - Children are every Rock cascading from a node, whatever its status or level,
 *   so out-of-scope levels stay visible as context under their parent.
 */
export function buildMeetingRocksCascade(
  rocks: readonly RockWithHierarchy[],
  scope: readonly string[],
  ownerNames: Readonly<Record<string, string>> = {},
  now: Date = new Date(),
): MeetingRocksCascade {
  const ownerOf = (rock: RockWithHierarchy) => ownerNames[rock.owner_id || ''] || '';
  const byOwnerThenTitle = (a: RockWithHierarchy, b: RockWithHierarchy) =>
    ownerOf(a).localeCompare(ownerOf(b)) || a.title.localeCompare(b.title);
  const byLevelOwnerTitle = (a: RockWithHierarchy, b: RockWithHierarchy) =>
    (LEVEL_ORDER[a.rock_level ?? ''] ?? 3) - (LEVEL_ORDER[b.rock_level ?? ''] ?? 3) || byOwnerThenTitle(a, b);

  const reviewRocks = rocks
    .filter(r => isRockInReviewScope(r, scope) && dbToUiStatus(r.status) !== 'complete')
    .sort(byOwnerThenTitle);
  const reviewIds = new Set(reviewRocks.map(r => r.id));

  const childrenByParent = new Map<string, RockWithHierarchy[]>();
  for (const rock of rocks) {
    if (!rock.parent_rock_id) continue;
    const siblings = childrenByParent.get(rock.parent_rock_id) || [];
    siblings.push(rock);
    childrenByParent.set(rock.parent_rock_id, siblings);
  }

  const build = (rock: RockWithHierarchy, seen: Set<string>): RockCascadeNode => {
    const nextSeen = new Set(seen).add(rock.id);
    const children = (childrenByParent.get(rock.id) || [])
      .filter(child => !nextSeen.has(child.id)) // guards against a parent cycle in bad data
      .sort(byLevelOwnerTitle)
      .map(child => build(child, nextSeen));
    const descendants = emptyCounts();
    for (const child of children) {
      addTo(descendants, child.rock);
      mergeInto(descendants, child.descendants);
    }
    const attention = attentionReasons(rock, now);
    return {
      rock,
      reviewable: isRockInReviewScope(rock, scope),
      children,
      descendants,
      attention,
      needsAttention: attention.length > 0 || children.some(child => child.needsAttention),
    };
  };

  const roots = reviewRocks
    .filter(rock => !(rock.parent_rock_id && reviewIds.has(rock.parent_rock_id)))
    .map(rock => build(rock, new Set()));

  const counts = emptyCounts();
  for (const rock of reviewRocks) addTo(counts, rock);

  const milestoneTotals = emptyBreakdown();
  for (const { rock } of roots) {
    const b = rock.milestoneBreakdown;
    if (!b) continue;
    milestoneTotals.total += b.total;
    milestoneTotals.complete += b.complete;
    milestoneTotals.inProgress += b.inProgress;
    milestoneTotals.blocked += b.blocked;
    milestoneTotals.offTrack += b.offTrack;
    milestoneTotals.notStarted += b.notStarted;
    milestoneTotals.overdue += b.overdue;
  }

  return { roots, reviewRocks, counts, milestoneTotals };
}

/** Ids of every node that has children, for expand-all. */
export function collectBranchIds(nodes: readonly RockCascadeNode[]): string[] {
  return nodes.flatMap(node => (node.children.length > 0 ? [node.rock.id, ...collectBranchIds(node.children)] : []));
}
