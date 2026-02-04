import type { EosRock, RockWithHierarchy } from '@/types/eos';

/**
 * Compute the roll-up status for a rock based on its children's statuses.
 * Rules:
 * - If any child is off_track or at_risk, parent is off_track
 * - If all children are complete, parent can be complete
 * - Otherwise, parent is on_track
 */
export function computeRollupStatus(rock: EosRock, allRocks: EosRock[]): string {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id && !r.archived_at);
  
  if (children.length === 0) {
    return normalizeStatus(rock.status);
  }
  
  const hasOffTrack = children.some(c => {
    const status = normalizeStatus(c.status);
    return status === 'off_track' || status === 'at_risk';
  });
  
  if (hasOffTrack) return 'off_track';
  
  const allComplete = children.every(c => 
    normalizeStatus(c.status) === 'complete'
  );
  
  if (allComplete) return 'complete';
  
  return 'on_track';
}

/**
 * Get statistics about a rock's children
 */
export function getChildStats(rock: EosRock, allRocks: EosRock[]): { total: number; complete: number; offTrack: number } {
  const children = allRocks.filter(r => r.parent_rock_id === rock.id && !r.archived_at);
  
  return {
    total: children.length,
    complete: children.filter(c => normalizeStatus(c.status) === 'complete').length,
    offTrack: children.filter(c => {
      const status = normalizeStatus(c.status);
      return status === 'off_track' || status === 'at_risk';
    }).length,
  };
}

/**
 * Normalize status strings to lowercase, handling various formats
 */
export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'on_track';
  const lower = status.toLowerCase().replace(/-/g, '_');
  
  // Map common variations
  const statusMap: Record<string, string> = {
    'on_track': 'on_track',
    'ontrack': 'on_track',
    'off_track': 'off_track',
    'offtrack': 'off_track',
    'at_risk': 'at_risk',
    'atrisk': 'at_risk',
    'complete': 'complete',
    'completed': 'complete',
    'not_started': 'not_started',
    'notstarted': 'not_started',
  };
  
  return statusMap[lower] || lower;
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
      rollupStatus: normalizeStatus(rock.status),
      childStats: { total: 0, complete: 0, offTrack: 0 },
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
  
  return children.every(c => normalizeStatus(c.status) === 'complete');
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
