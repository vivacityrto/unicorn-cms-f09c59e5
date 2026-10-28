import { describe, expect, it } from 'vitest';
import { companyRootFor, diffLinks, type RockRef } from '@/utils/rockLinking';

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
