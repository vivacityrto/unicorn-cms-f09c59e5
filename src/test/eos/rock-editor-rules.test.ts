import { describe, expect, it } from 'vitest';
import { allowedParentLevels, candidateParents, hasErrors, isValidIsoDate, needsParent, validateRockEditor } from '@/utils/rockEditor/rules';
import { newMilestone } from '@/utils/rockEditor/defaults';
import type { ParentCandidate, RockEditorValues } from '@/utils/rockEditor/types';

const NOW = new Date(2026, 10, 10, 9, 0, 0); // 10 Nov 2026

const parent = (id: string, level: ParentCandidate['level'], extra: Partial<ParentCandidate> = {}): ParentCandidate => ({
  id, title: `Rock ${id}`, level, quarterYear: 2026, quarterNumber: 4, ownerId: 'u1', archived: false, parentId: null, ...extra,
});

const company = parent('co', 'company');
const team = parent('tm', 'team', { parentId: 'co' });
const rocks = [company, team];

const values = (over: Partial<RockEditorValues> = {}): RockEditorValues => ({
  level: 'individual', parentId: 'tm', functionId: null, ownerId: 'u1', title: 'Ship the thing', description: '', issue: '', outcome: '',
  quarterYear: 2026, quarterNumber: 4, dueDate: '2026-12-31', milestones: [], ...over,
});

const check = (v: RockEditorValues, ctx: Parameters<typeof validateRockEditor>[1] = { rocks, now: NOW }) => validateRockEditor(v, { now: NOW, ...ctx });

describe('hierarchy helpers', () => {
  it('knows which levels may parent which', () => {
    expect(allowedParentLevels('company')).toEqual([]);
    expect(allowedParentLevels('team')).toEqual(['company']);
    expect(allowedParentLevels('individual')).toEqual(['company', 'team']);
    expect(needsParent('company')).toBe(false);
    expect(needsParent('team')).toBe(true);
    expect(needsParent('individual')).toBe(true);
  });

  it('offers only active Rocks of the right level in the same quarter', () => {
    const all = [
      company,
      team,
      parent('old', 'company', { quarterNumber: 3 }),
      parent('gone', 'company', { archived: true }),
      parent('ind', 'individual'),
    ];
    expect(candidateParents('team', { year: 2026, quarter: 4 }, all).map(r => r.id)).toEqual(['co']);
    expect(candidateParents('individual', { year: 2026, quarter: 4 }, all).map(r => r.id)).toEqual(['co', 'tm']);
    expect(candidateParents('company', { year: 2026, quarter: 4 }, all)).toEqual([]);
  });

  it('validates ISO dates strictly', () => {
    expect(isValidIsoDate('2026-12-31')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('31/12/2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('validateRockEditor: what the server requires', () => {
  it('accepts a complete Individual Rock', () => {
    const result = check(values());
    expect(hasErrors(result)).toBe(false);
    expect(result.warnings).toEqual({});
  });

  it('requires a title and an owner at every level', () => {
    expect(check(values({ title: '   ' })).errors.title).toBeDefined();
    expect(check(values({ ownerId: null })).errors.owner).toBeDefined();
    expect(check(values({ level: 'company', parentId: null, ownerId: null })).errors.owner).toBeDefined();
    expect(check(values({ title: 'x'.repeat(201) })).errors.title).toMatch(/under 200/);
  });

  it('requires a team for a Team Rock, and an owner, which the old dialog called optional', () => {
    const base = values({ level: 'team', parentId: 'co' });
    expect(check(base).errors.function).toBeDefined();
    expect(check({ ...base, functionId: 'fn', ownerId: null }).errors.owner).toBeDefined();
    expect(hasErrors(check({ ...base, functionId: 'fn' }))).toBe(false);
  });

  it('gives a Company Rock no parent', () => {
    expect(check(values({ level: 'company', parentId: 'co' })).errors.parent).toMatch(/cannot have a parent/);
    expect(hasErrors(check(values({ level: 'company', parentId: null })))).toBe(false);
  });

  it('requires a parent for Team and Individual Rocks', () => {
    expect(check(values({ level: 'team', parentId: null, functionId: 'fn' })).errors.parent).toMatch(/Company Rock/);
    expect(check(values({ parentId: null })).errors.parent).toMatch(/Company or Team/);
  });

  it('only allows the right parent level', () => {
    expect(check(values({ level: 'team', functionId: 'fn', parentId: 'tm' })).errors.parent).toMatch(/must serve a Company Rock/);
    const withIndividual = [...rocks, parent('ind', 'individual')];
    expect(check(values({ parentId: 'ind' }), { rocks: withIndividual, now: NOW }).errors.parent).toMatch(/Company or Team/);
  });

  it('rejects a parent from another quarter, an archived one, or one that does not exist', () => {
    const other = [company, parent('q3', 'company', { quarterNumber: 3 }), parent('arch', 'team', { archived: true })];
    expect(check(values({ parentId: 'q3' }), { rocks: other, now: NOW }).errors.parent).toMatch(/same quarter \(Q4 2026\)/);
    expect(check(values({ parentId: 'arch' }), { rocks: other, now: NOW }).errors.parent).toMatch(/archived/);
    expect(check(values({ parentId: 'nope' }), { rocks: other, now: NOW }).errors.parent).toMatch(/could not be found/);
  });

  it('leaves an unchanged legacy hierarchy alone when editing, as the server does', () => {
    const legacy = values({ level: 'team', functionId: 'fn', parentId: null });
    const original = { level: 'team' as const, parentId: null, quarterYear: 2026, quarterNumber: 4 };

    expect(check(legacy, { rocks, original, now: NOW }).errors.parent).toBeUndefined();
    // Changing the hierarchy brings the rules back.
    expect(check({ ...legacy, level: 'individual' }, { rocks, original, now: NOW }).errors.parent).toBeDefined();
    expect(check({ ...legacy, quarterNumber: 3 }, { rocks, original, now: NOW }).errors.parent).toBeDefined();
    // A legacy Rock under a parent from another quarter is also let through while unchanged.
    const crossQuarter = [parent('q3', 'company', { quarterNumber: 3 })];
    expect(check(values({ parentId: 'q3' }), { rocks: crossQuarter, original: { level: 'individual', parentId: 'q3', quarterYear: 2026, quarterNumber: 4 }, now: NOW }).errors.parent).toBeUndefined();
  });

  it('checks the quarter and the due date', () => {
    expect(check(values({ quarterNumber: 5 })).errors.quarter).toBeDefined();
    expect(check(values({ quarterYear: 1999 })).errors.quarter).toBeDefined();
    expect(check(values({ dueDate: '' })).errors.dueDate).toBeDefined();
    expect(check(values({ dueDate: '2026-02-30' })).errors.dueDate).toMatch(/not valid/);
  });

  it('warns, without blocking, about a due date outside the quarter or already past', () => {
    const outside = check(values({ dueDate: '2027-02-01' }));
    expect(hasErrors(outside)).toBe(false);
    expect(outside.warnings.dueDate).toMatch(/outside Q4 2026/);

    expect(check(values({ dueDate: '2026-10-05' })).warnings.dueDate).toMatch(/already passed/);
    // An edit does not nag about a past date.
    const original = { level: 'individual' as const, parentId: 'tm', quarterYear: 2026, quarterNumber: 4 };
    expect(check(values({ dueDate: '2026-10-05' }), { rocks, original, now: NOW }).warnings.dueDate).toBeUndefined();
  });
});

describe('validateRockEditor: milestones', () => {
  const ms = (over: Partial<ReturnType<typeof newMilestone>> = {}) => ({ ...newMilestone('Do it', `m-${Math.random()}`), ...over });

  it('ignores blank milestone rows', () => {
    expect(hasErrors(check(values({ milestones: [ms({ title: '   ', dueDate: 'garbage' })] })))).toBe(false);
  });

  it('rejects a long title or a bad date on a milestone', () => {
    const long = ms({ title: 'x'.repeat(201) });
    const bad = ms({ dueDate: '2026-13-01' });
    const result = check(values({ milestones: [long, bad] }));
    expect(result.errors[`milestone:${long.id}`]).toMatch(/under 200/);
    expect(result.errors[`milestone:${bad.id}`]).toMatch(/not valid/);
  });

  it('accepts links to this Company Rock’s milestones and rejects others', () => {
    const good = ms({ supports: ['c1'] });
    const stray = ms({ supports: ['elsewhere'] });
    const ctx = { rocks, companyMilestoneIds: new Set(['c1', 'c2']), now: NOW };

    expect(hasErrors(check(values({ milestones: [good] }), ctx))).toBe(false);
    expect(check(values({ milestones: [stray] }), ctx).errors[`milestone:${stray.id}`]).toMatch(/not part of this Rock/);
  });

  it('nudges an Individual milestone to link to a Company milestone, only when there are some', () => {
    const lonely = ms();
    const ctx = { rocks, companyMilestoneIds: new Set(['c1']), now: NOW };

    expect(check(values({ milestones: [lonely] }), ctx).warnings[`milestone:${lonely.id}:link`]).toMatch(/Not linked/);
    expect(check(values({ milestones: [lonely] }), { rocks, now: NOW }).warnings).toEqual({});
    expect(check(values({ level: 'team', functionId: 'fn', parentId: 'co', milestones: [lonely] }), ctx).warnings).toEqual({});
  });
});
