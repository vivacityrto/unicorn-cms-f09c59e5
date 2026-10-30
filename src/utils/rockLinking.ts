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

export interface LinkTargetRock {
  id: string;
  title: string;
  level: 'team' | 'company';
}

export type LinkTargets =
  | { status: 'ok'; rocks: LinkTargetRock[] }
  | { status: 'none'; reason: 'not_linkable' | 'no_parent' | 'parent_not_found'; message: string };

/**
 * The Rocks whose milestones a Rock's milestones can support (`validate_eos_rock_milestone_link`):
 * an Individual Rock's milestones can support those of the Team Rock it serves and of the Company Rock
 * above (directly or through that Team Rock); a Team Rock's milestones can support those of the Company
 * Rock it serves. Team Rocks come first, nearest Rock first.
 */
export function linkTargetRocksFor(rock: RockRef, byId: ReadonlyMap<string, RockRef>): LinkTargets {
  if (rock.level !== 'individual' && rock.level !== 'team') {
    return { status: 'none', reason: 'not_linkable', message: 'Only Individual and Team Rocks’ milestones link up.' };
  }
  const subject = rock.level === 'team' ? 'Team' : 'Individual';
  if (!rock.parentId) {
    return {
      status: 'none',
      reason: 'no_parent',
      message: `This ${subject} Rock does not serve a ${rock.level === 'team' ? 'Company' : 'Company or Team'} Rock yet, so its milestones have nothing to map to. Edit the Rock to choose what it serves.`,
    };
  }
  const parent = byId.get(rock.parentId);
  if (!parent) {
    return { status: 'none', reason: 'parent_not_found', message: 'The Rock this one serves could not be found, so its milestones cannot be mapped.' };
  }
  if (parent.level === 'company') return { status: 'ok', rocks: [{ id: parent.id, title: parent.title, level: 'company' }] };
  if (rock.level === 'individual' && parent.level === 'team') {
    const rocks: LinkTargetRock[] = [{ id: parent.id, title: parent.title, level: 'team' }];
    const grand = parent.parentId ? byId.get(parent.parentId) : undefined;
    if (grand?.level === 'company') rocks.push({ id: grand.id, title: grand.title, level: 'company' });
    return { status: 'ok', rocks };
  }
  return { status: 'none', reason: 'parent_not_found', message: 'The Rock this one serves is not a Company or Team Rock, so its milestones cannot be mapped.' };
}

/** "Company", "Team" or "Team or Company": which milestones a link can reach, for button and heading text. */
export function linkTargetNoun(rocks: readonly LinkTargetRock[]): string {
  const levels = new Set(rocks.map(r => r.level));
  if (levels.has('team') && levels.has('company')) return 'Team or Company';
  return levels.has('team') ? 'Team' : 'Company';
}

/** The text on the button that opens the link picker. */
export function linkButtonLabel(rocks: readonly LinkTargetRock[], hasLinks: boolean): string {
  const noun = linkTargetNoun(rocks);
  return hasLinks ? `Change the ${noun} milestones it supports` : `Link to a ${noun} milestone`;
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
