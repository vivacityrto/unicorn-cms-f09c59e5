import { describe, expect, it } from 'vitest';
import { companyRootFor, diffLinks, linkButtonLabel, linkTargetNoun, linkTargetRocksFor, type RockRef } from '@/utils/rockLinking';

const r = (id: string, level: string, parentId: string | null = null, title = id): RockRef => ({ id, level, parentId, title });
const index = (...rocks: RockRef[]) => new Map(rocks.map(x => [x.id, x]));

describe('companyRootFor: which Company Rock an Individual Rock serves', () => {
  const company = r('co', 'company');
  const team = r('tm', 'team', 'co', 'Client Rock – EduCareer');
  const orphanTeam = r('ot', 'team', null, 'Client Rock – Orphan');

  it('finds the Company Rock directly above', () => {
    expect(companyRootFor(r('i', 'individual', 'co'), index(company))).toEqual({ status: 'ok', companyRockId: 'co', via: 'direct' });
  });

  it('finds it through a Team Rock, and names the team', () => {
    expect(companyRootFor(r('i', 'individual', 'tm'), index(company, team))).toEqual({ status: 'ok', companyRockId: 'co', via: 'team', teamTitle: 'Client Rock – EduCareer' });
  });

  it('says why when there is no parent, and what to do', () => {
    const result = companyRootFor(r('i', 'individual', null), index(company));
    expect(result).toMatchObject({ status: 'none', reason: 'no_parent' });
    expect(result.status === 'none' && result.message).toMatch(/Edit the Rock to choose what it serves/);
  });

  it('says so when its Team Rock stands alone, naming the Team Rock (the case for auto-created client Team Rocks)', () => {
    const result = companyRootFor(r('i', 'individual', 'ot'), index(company, orphanTeam));
    expect(result).toMatchObject({ status: 'none', reason: 'team_without_company' });
    expect(result.status === 'none' && result.message).toContain('Client Rock – Orphan');
  });

  it('copes with a parent that cannot be found', () => {
    expect(companyRootFor(r('i', 'individual', 'gone'), index(company))).toMatchObject({ status: 'none', reason: 'parent_not_found' });
  });

  it('does not offer linking for Company or Team Rocks', () => {
    expect(companyRootFor(company, index(company))).toMatchObject({ status: 'none', reason: 'not_individual' });
    expect(companyRootFor(team, index(company, team))).toMatchObject({ status: 'none', reason: 'not_individual' });
  });
});

describe('diffLinks', () => {
  it('adds what was ticked and removes what was unticked, and leaves the rest alone', () => {
    expect(diffLinks(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
  });
  it('does nothing when nothing changed, and handles all or none', () => {
    expect(diffLinks(['a'], ['a'])).toEqual({ add: [], remove: [] });
    expect(diffLinks([], ['a', 'b'])).toEqual({ add: ['a', 'b'], remove: [] });
    expect(diffLinks(['a', 'b'], [])).toEqual({ add: [], remove: ['a', 'b'] });
  });
  it('ignores duplicates', () => {
    expect(diffLinks(['a', 'a'], ['a', 'b', 'b'])).toEqual({ add: ['b'], remove: [] });
  });
});

describe('linkTargetRocksFor: which Rocks a Rock’s milestones can support', () => {
  const company = r('co', 'company', null, 'Beta launch');
  const team = r('tm', 'team', 'co', 'Client Rock – EduCareer');
  const orphanTeam = r('ot', 'team', null, 'Client Rock – Orphan');

  it('offers the Company Rock when an Individual Rock serves it directly', () => {
    expect(linkTargetRocksFor(r('i', 'individual', 'co'), index(company))).toEqual({
      status: 'ok', rocks: [{ id: 'co', title: 'Beta launch', level: 'company' }],
    });
  });

  it('offers the Team Rock first and then the Company Rock above it', () => {
    expect(linkTargetRocksFor(r('i', 'individual', 'tm'), index(company, team))).toEqual({
      status: 'ok',
      rocks: [{ id: 'tm', title: 'Client Rock – EduCareer', level: 'team' }, { id: 'co', title: 'Beta launch', level: 'company' }],
    });
  });

  it('still offers the Team Rock when it stands alone, which used to be a dead end', () => {
    expect(linkTargetRocksFor(r('i', 'individual', 'ot'), index(company, orphanTeam))).toEqual({
      status: 'ok', rocks: [{ id: 'ot', title: 'Client Rock – Orphan', level: 'team' }],
    });
  });

  it('lets a Team Rock’s milestones support its Company Rock', () => {
    expect(linkTargetRocksFor(team, index(company, team))).toEqual({
      status: 'ok', rocks: [{ id: 'co', title: 'Beta launch', level: 'company' }],
    });
  });

  it('says why when a Team Rock has no Company Rock, or an Individual Rock has no parent', () => {
    expect(linkTargetRocksFor(orphanTeam, index(orphanTeam))).toMatchObject({ status: 'none', reason: 'no_parent' });
    const none = linkTargetRocksFor(r('i', 'individual', null), index(company));
    expect(none).toMatchObject({ status: 'none', reason: 'no_parent' });
    expect(none.status === 'none' && none.message).toMatch(/Edit the Rock to choose what it serves/);
  });

  it('says so when the parent cannot be found, and offers nothing for a Company Rock', () => {
    expect(linkTargetRocksFor(r('i', 'individual', 'gone'), index(company))).toMatchObject({ status: 'none', reason: 'parent_not_found' });
    expect(linkTargetRocksFor(company, index(company))).toMatchObject({ status: 'none', reason: 'not_linkable' });
  });

  it('words the button for what it can reach', () => {
    const t = { id: 'tm', title: 't', level: 'team' as const };
    const c = { id: 'co', title: 'c', level: 'company' as const };
    expect(linkTargetNoun([c])).toBe('Company');
    expect(linkTargetNoun([t])).toBe('Team');
    expect(linkTargetNoun([t, c])).toBe('Team or Company');
    expect(linkButtonLabel([c], false)).toBe('Link to a Company milestone');
    expect(linkButtonLabel([c], true)).toBe('Change the Company milestones it supports');
    expect(linkButtonLabel([t, c], false)).toBe('Link to a Team or Company milestone');
  });
});
