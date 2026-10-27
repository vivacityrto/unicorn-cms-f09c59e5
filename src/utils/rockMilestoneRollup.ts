import { todayLocalIso } from '@/utils/localDate';

/** Counts of a Rock's active milestones (deferred ones are excluded) by status. */
export interface MilestoneBreakdown {
  total: number;
  complete: number;
  inProgress: number;
  blocked: number;
  offTrack: number;
  notStarted: number;
  /** Past due and not complete. Counted within the status counts above, not in addition to them. */
  overdue: number;
}

export interface RollupRock {
  id: string;
  rock_level?: string | null;
  parent_rock_id?: string | null;
}

export interface RollupMilestone {
  rock_id: string;
  status: string;
  due_date?: string | null;
}

export function emptyBreakdown(): MilestoneBreakdown {
  return { total: 0, complete: 0, inProgress: 0, blocked: 0, offTrack: 0, notStarted: 0, overdue: 0 };
}

function add(target: MilestoneBreakdown, source: MilestoneBreakdown) {
  target.total += source.total;
  target.complete += source.complete;
  target.inProgress += source.inProgress;
  target.blocked += source.blocked;
  target.offTrack += source.offTrack;
  target.notStarted += source.notStarted;
  target.overdue += source.overdue;
}

/**
 * Milestone progress per Rock.
 *
 * - An Individual Rock reports its own milestones.
 * - A Company or Team Rock reports the Individual milestones beneath it, so
 *   delivery is counted once however many levels sit between. If nothing beneath
 *   it has any milestone rows yet, it falls back to its own checklist.
 * - Deferred milestones are left out of every count.
 */
export function rollupMilestones(
  rocks: readonly RollupRock[],
  milestones: readonly RollupMilestone[],
  now: Date = new Date(),
): Map<string, MilestoneBreakdown> {
  const today = todayLocalIso(now);
  const own = new Map<string, MilestoneBreakdown>();
  const rocksWithMilestoneRows = new Set<string>();

  for (const milestone of milestones) {
    rocksWithMilestoneRows.add(milestone.rock_id);
    if (milestone.status === 'deferred') continue;
    const counts = own.get(milestone.rock_id) ?? emptyBreakdown();
    counts.total += 1;
    if (milestone.status === 'complete') counts.complete += 1;
    else if (milestone.status === 'in_progress') counts.inProgress += 1;
    else if (milestone.status === 'blocked') counts.blocked += 1;
    else if (milestone.status === 'off_track') counts.offTrack += 1;
    else counts.notStarted += 1;
    if (milestone.status !== 'complete' && milestone.due_date && milestone.due_date.slice(0, 10) < today) {
      counts.overdue += 1;
    }
    own.set(milestone.rock_id, counts);
  }

  const childrenByParent = new Map<string, RollupRock[]>();
  for (const rock of rocks) {
    if (!rock.parent_rock_id) continue;
    const siblings = childrenByParent.get(rock.parent_rock_id) ?? [];
    siblings.push(rock);
    childrenByParent.set(rock.parent_rock_id, siblings);
  }
  const descendantIndividuals = (rockId: string, seen: Set<string>): string[] => {
    if (seen.has(rockId)) return []; // a parent cycle in bad data must not recurse forever
    const nextSeen = new Set(seen).add(rockId);
    return (childrenByParent.get(rockId) ?? []).flatMap(child =>
      child.rock_level === 'individual' ? [child.id] : descendantIndividuals(child.id, nextSeen),
    );
  };

  const result = new Map<string, MilestoneBreakdown>();
  for (const rock of rocks) {
    if (rock.rock_level === 'individual') {
      result.set(rock.id, { ...(own.get(rock.id) ?? emptyBreakdown()) });
      continue;
    }
    const leafIds = descendantIndividuals(rock.id, new Set());
    if (leafIds.some(id => rocksWithMilestoneRows.has(id))) {
      const total = emptyBreakdown();
      for (const id of leafIds) {
        const leaf = own.get(id);
        if (leaf) add(total, leaf);
      }
      result.set(rock.id, total);
    } else {
      result.set(rock.id, { ...(own.get(rock.id) ?? emptyBreakdown()) });
    }
  }
  return result;
}
