import type { EosRock, RockWithHierarchy } from '@/types/eos';
import { dbToUiStatus, uiToDbStatus, DB_ROCK_STATUS, type UiRockStatus } from './rockStatusUtils';

// Re-export for backwards compatibility
export { dbToUiStatus as normalizeStatus, uiToDbStatus, getStatusConfig } from './rockStatusUtils';

/** Company Rocks can own Team or Individual Rocks; Team Rocks can own Individuals. */
export function canRockLevelBeParent(parentLevel: string | null | undefined, childLevel: string): boolean {
  if (childLevel === 'team') return parentLevel === 'company';
  if (childLevel === 'individual') return parentLevel === 'company' || parentLevel === 'team';
  return parentLevel == null;
}

/** How bad a progress status is. At risk (might slip) and off track (late against plan) are different things. */
const PROGRESS_SEVERITY: Record<string, number> = { on_track: 0, at_risk: 1, off_track: 2 };
const severityOf = (status: UiRockStatus) => PROGRESS_SEVERITY[status] ?? 0;
const progressStatus = (severity: number): UiRockStatus => (severity >= 2 ? 'off_track' : severity === 1 ? 'at_risk' : 'on_track');

/**
 * Compute the roll-up status for a rock based on its children's statuses.
 * Rules:
 * - A Rock that is itself blocked (it has its own recorded blocker) stays blocked,
 *   whatever its children say. Only a person resolving that blocker changes it.
 * - If every child is complete, the parent shows complete.
 * - Otherwise the parent shows the worse of its own status and its worst child's,
 *   on the scale on track < at risk < off track. So one child at risk makes the
 *   parent at risk (not off track), a child off track makes it off track, and a
 *   parent is never shown better than its own status says.
 * - A blocked child is neither at risk nor off track and does not count as
 *   complete; the parent reports the blocked count (see getChildStats) instead.
 *   If every child that is not complete is blocked, the parent is blocked: no
 *   remaining work can move.
 * - Otherwise, the parent is on_track.
 */
export function computeRollupStatus(rock: EosRock, allRocks: EosRock[]): UiRockStatus {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id && !r.archived_at);
  const own = dbToUiStatus(rock.status);

  if (children.length === 0 || own === 'blocked') return own;

  const childStatuses = children.map(c => dbToUiStatus(c.status));
  if (childStatuses.every(s => s === 'complete')) return 'complete';

  const childWorst = Math.max(...childStatuses.map(severityOf));
  const worst = Math.max(childWorst, severityOf(own));
  if (childWorst > 0) return progressStatus(worst);

  if (childStatuses.filter(s => s !== 'complete').every(s => s === 'blocked')) return 'blocked';

  return progressStatus(worst);
}

/**
 * Get statistics about a rock's children. Off track and at risk are counted apart:
 * they mean different things and the card shows them as different things.
 */
export function getChildStats(rock: EosRock, allRocks: EosRock[]): { total: number; complete: number; offTrack: number; atRisk: number; blocked: number } {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id && !r.archived_at);
  const countOf = (status: UiRockStatus) => children.filter(c => dbToUiStatus(c.status) === status).length;

  return {
    total: children.length,
    complete: countOf('complete'),
    offTrack: countOf('off_track'),
    atRisk: countOf('at_risk'),
    blocked: countOf('blocked'),
  };
}

/**
 * Build hierarchy tree from flat rock list
 */
export function buildRockHierarchy(rocks: EosRock[]): RockWithHierarchy[] {
  const rockMap = new Map<string, RockWithHierarchy>();
  
  // First pass: create enhanced rocks
  rocks.forEach(rock => {
    rockMap.set(rock.id, {
      ...rock,
      children: [],
      parent: null,
      rollupStatus: dbToUiStatus(rock.status),
      childStats: { total: 0, complete: 0, offTrack: 0, atRisk: 0, blocked: 0 },
    });
  });
  
  // Second pass: link children to parents
  rocks.forEach(rock => {
    if (rock.parent_rock_id) {
      const parent = rockMap.get(rock.parent_rock_id);
      const child = rockMap.get(rock.id);
      if (parent && child) {
        parent.children = parent.children || [];
        parent.children.push(child);
        child.parent = parent;
      }
    }
  });
  
  // Third pass: compute stats and rollup status (bottom-up)
  const computeStatsRecursive = (rock: RockWithHierarchy) => {
    if (rock.children && rock.children.length > 0) {
      rock.children.forEach(child => computeStatsRecursive(child as RockWithHierarchy));
      rock.childStats = getChildStats(rock, rocks);
      rock.rollupStatus = computeRollupStatus(rock, rocks);
    }
  };
  
  // Get root rocks (company level, no parent)
  const rootRocks = Array.from(rockMap.values()).filter(r => !r.parent_rock_id);
  rootRocks.forEach(computeStatsRecursive);
  
  return Array.from(rockMap.values());
}

/**
 * Get rocks grouped by level
 */
export function groupRocksByLevel(rocks: RockWithHierarchy[]): {
  company: RockWithHierarchy[];
  team: RockWithHierarchy[];
  individual: RockWithHierarchy[];
} {
  return {
    company: rocks.filter(r => r.rock_level === 'company' || (!r.rock_level && !r.parent_rock_id)),
    team: rocks.filter(r => r.rock_level === 'team'),
    individual: rocks.filter(r => r.rock_level === 'individual'),
  };
}

/**
 * Get team rocks grouped by function
 */
export function groupTeamRocksByFunction(rocks: RockWithHierarchy[]): Map<string, RockWithHierarchy[]> {
  const map = new Map<string, RockWithHierarchy[]>();
  
  rocks
    .filter(r => r.rock_level === 'team' && r.function_id)
    .forEach(rock => {
      const functionId = rock.function_id!;
      const existing = map.get(functionId) || [];
      map.set(functionId, [...existing, rock]);
    });
  
  return map;
}

/**
 * Get individual rocks grouped by owner
 */
export function groupIndividualRocksByOwner(rocks: RockWithHierarchy[]): Map<string, RockWithHierarchy[]> {
  const map = new Map<string, RockWithHierarchy[]>();
  
  rocks
    .filter(r => r.rock_level === 'individual' && r.owner_id)
    .forEach(rock => {
      const ownerId = rock.owner_id!;
      const existing = map.get(ownerId) || [];
      map.set(ownerId, [...existing, rock]);
    });
  
  return map;
}

/**
 * Check if a rock can be marked complete (all children must be complete)
 */
export function canMarkComplete(rock: EosRock, allRocks: EosRock[]): boolean {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id && !r.archived_at);
  
  if (children.length === 0) return true;
  
  return children.every(c => dbToUiStatus(c.status) === 'complete');
}

/**
 * Get current quarter info
 */
export function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.ceil((now.getMonth() + 1) / 3),
  };
}

/**
 * Format quarter display string
 */
export function formatQuarter(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}
