/**
 * How an Individual Rock's milestones can map up to a Company Rock's milestones.
 *
 * The database allows a link only between a Company Rock's milestone and a milestone of an
 * Individual Rock that serves that Company Rock directly, or through a Team Rock that serves it
 * (`validate_eos_rock_milestone_link`). Team Rock milestones are not link ends. So the first
 * question for any Individual milestone is: which Company Rock does its Rock ultimately serve?
 */

export interface RockRef {
  id: string;
  title: string;
  level: string | null;
  parentId: string | null;
}

export type LinkRoot =
  | { status: 'ok'; companyRockId: string; via: 'direct' | 'team'; teamTitle?: string }
  | { status: 'none'; reason: 'not_individual' | 'no_parent' | 'parent_not_found' | 'team_without_company'; message: string };

/** The Company Rock an Individual Rock serves, directly or through a Team Rock, or why there is none. */
export function companyRootFor(rock: RockRef, byId: ReadonlyMap<string, RockRef>): LinkRoot {
  if (rock.level !== 'individual') {
    return { status: 'none', reason: 'not_individual', message: 'Only an Individual Rock’s milestones link up to a Company milestone.' };
  }
  if (!rock.parentId) {
    return {
      status: 'none',
      reason: 'no_parent',
      message: 'This Rock does not serve a Company or Team Rock yet, so its milestones have nothing to map to. Edit the Rock to choose what it serves.',
    };
  }
  const parent = byId.get(rock.parentId);
  if (!parent) {
    return { status: 'none', reason: 'parent_not_found', message: 'The Rock this one serves could not be found, so its milestones cannot be mapped.' };
  }
  if (parent.level === 'company') return { status: 'ok', companyRockId: parent.id, via: 'direct' };
  if (parent.level === 'team') {
    const grand = parent.parentId ? byId.get(parent.parentId) : undefined;
    if (grand?.level === 'company') return { status: 'ok', companyRockId: grand.id, via: 'team', teamTitle: parent.title };
    return {
      status: 'none',
      reason: 'team_without_company',
      message: `This Rock serves the Team Rock “${parent.title}”, which is not under a Company Rock, so its milestones have no Company milestone to map to. Put that Team Rock under a Company Rock to map them.`,
    };
  }
  return { status: 'none', reason: 'parent_not_found', message: 'The Rock this one serves is not a Company or Team Rock, so its milestones cannot be mapped.' };
}

/** What has to be added and removed to turn the current links into the chosen set. */
export function diffLinks(current: readonly string[], selected: readonly string[]): { add: string[]; remove: string[] } {
  const have = new Set(current);
  const want = new Set(selected);
  return {
    add: [...want].filter(id => !have.has(id)),
    remove: [...have].filter(id => !want.has(id)),
  };
}
