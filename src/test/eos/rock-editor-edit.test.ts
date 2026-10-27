import { describe, expect, it } from 'vitest';
import { isDirty, milestonesFromRows, originalOf, valuesFromRock, type StoredMilestone } from '@/utils/rockEditor/fromRock';
import { findClientRockOffer, resolveClient } from '@/utils/rockEditor/client';
import { buildMilestoneRows } from '@/utils/rockEditor/payload';
import { newMilestone } from '@/utils/rockEditor/defaults';
import type { EosRock } from '@/types/eos';
import type { ParentCandidate } from '@/utils/rockEditor/types';

const rock = (over: Partial<EosRock> = {}): EosRock => ({
  id: 'r1', tenant_id: 6372, title: 'Ship it', description: null, issue: null, outcome: null, status: 'at_risk',
  quarter_year: 2026, quarter_number: 4, due_date: '2026-12-31T00:00:00.000Z', created_at: '', updated_at: '',
  rock_level: 'individual', owner_id: 'u1', parent_rock_id: 'tm', function_id: 'fn', ...over,
} as EosRock);

const row = (over: Partial<StoredMilestone> = {}): StoredMilestone => ({
  id: 'm1', title: 'Step one', owner_id: null, due_date: null, priority: 'high', status: 'in_progress',
  exit_criteria: 'done when x', evidence_url: 'https://e.x/1', ...over,
});

const cand = (over: Partial<ParentCandidate> & { id: string }): ParentCandidate => ({
  title: over.id, level: 'team', quarterYear: 2026, quarterNumber: 4, ownerId: 'u1', archived: false, parentId: null, clientTenantId: null, ...over,
});

describe('valuesFromRock', () => {
  it('loads a saved Rock exactly, trimming the date to the day', () => {
    const v = valuesFromRock(rock({ description: 'd', issue: 'i', outcome: 'o' }), []);
    expect(v).toMatchObject({ level: 'individual', parentId: 'tm', functionId: 'fn', ownerId: 'u1', title: 'Ship it', description: 'd', issue: 'i', outcome: 'o', quarterYear: 2026, quarterNumber: 4, dueDate: '2026-12-31' });
    expect(valuesFromRock(rock({ due_date: null }), []).dueDate).toBe('');
  });

  it('describes the hierarchy the server will compare against', () => {
    expect(originalOf(valuesFromRock(rock(), []))).toEqual({ level: 'individual', parentId: 'tm', quarterYear: 2026, quarterNumber: 4 });
  });
});

describe('milestonesFromRows', () => {
  it('carries saved status, evidence, priority and links', () => {
    const [m] = milestonesFromRows([row({ owner_id: 'u2', due_date: '2026-11-20' })], [
      { company_milestone_id: 'c1', individual_milestone_id: 'm1' },
      { company_milestone_id: 'c2', individual_milestone_id: 'other' },
    ]);
    expect(m).toMatchObject({ id: 'm1', title: 'Step one', ownerId: 'u2', dueDate: '2026-11-20', priority: 'high', status: 'in_progress', exitCriteria: 'done when x', evidenceUrl: 'https://e.x/1', supports: ['c1'] });
  });

  it('falls back to safe values for anything unexpected', () => {
    const [m] = milestonesFromRows([row({ priority: 'urgent', status: 'weird', exit_criteria: null, evidence_url: null })]);
    expect(m).toMatchObject({ priority: 'medium', status: 'not_started', exitCriteria: '', evidenceUrl: '' });
  });

  it('remembers which saved milestones had no owner or date, so saving does not invent them', () => {
    const [m] = milestonesFromRows([row()]);
    expect(m.keepBlank).toEqual({ owner: true, due: true });
    const values = { ...valuesFromRock(rock(), []), milestones: [m] };
    expect(buildMilestoneRows(values, 'r1', 6372)[0]).toMatchObject({ owner_id: null, due_date: null, status: 'in_progress', evidence_url: 'https://e.x/1' });

    // Once the person sets an owner and date, those win.
    const set = { ...values, milestones: [{ ...m, ownerId: 'u3', dueDate: '2026-11-01' }] };
    expect(buildMilestoneRows(set, 'r1', 6372)[0]).toMatchObject({ owner_id: 'u3', due_date: '2026-11-01' });
  });

  it('still gives a new milestone the Rock’s owner and date', () => {
    const values = { ...valuesFromRock(rock(), []), milestones: [newMilestone('New', 'n1')] };
    expect(buildMilestoneRows(values, 'r1', 6372)[0]).toMatchObject({ owner_id: 'u1', due_date: '2026-12-31' });
  });
});

describe('isDirty', () => {
  const loaded = valuesFromRock(rock(), milestonesFromRows([row()]));

  it('is clean when nothing changed, and ignores whitespace and blank rows', () => {
    expect(isDirty(loaded, loaded)).toBe(false);
    expect(isDirty({ ...loaded, title: '  Ship it ' }, loaded)).toBe(false);
    expect(isDirty({ ...loaded, milestones: [...loaded.milestones, newMilestone('  ')] }, loaded)).toBe(false);
  });

  it('is dirty after a real change, including a status change', () => {
    expect(isDirty({ ...loaded, title: 'Ship it now' }, loaded)).toBe(true);
    expect(isDirty({ ...loaded, milestones: [] }, loaded)).toBe(true);
    expect(isDirty(loaded, loaded, { current: 'on_track', loaded: 'at_risk' })).toBe(true);
  });
});

describe('resolveClient', () => {
  const rocks = [cand({ id: 'co', level: 'company' }), cand({ id: 'ct', clientTenantId: 55 }), cand({ id: 'tm' })];

  it('follows the parent when creating an Individual Rock', () => {
    expect(resolveClient({ level: 'individual', parentId: 'ct', rocks })).toEqual({ clientTenantId: 55, droppedFrom: null });
    expect(resolveClient({ level: 'individual', parentId: 'tm', rocks })).toEqual({ clientTenantId: null, droppedFrom: null });
  });

  it('keeps a saved Rock’s client while its parent is unchanged, even if the parent has none', () => {
    const original = { parentId: 'co', clientTenantId: 55 };
    expect(resolveClient({ level: 'individual', parentId: 'co', rocks, original })).toEqual({ clientTenantId: 55, droppedFrom: null });
  });

  it('follows the new parent once it changes, and says what was dropped', () => {
    const original = { parentId: 'co', clientTenantId: 55 };
    expect(resolveClient({ level: 'individual', parentId: 'tm', rocks, original })).toEqual({ clientTenantId: null, droppedFrom: 55 });
    expect(resolveClient({ level: 'individual', parentId: 'ct', rocks, original })).toEqual({ clientTenantId: 55, droppedFrom: null });
  });

  it('keeps the client of a Team Rock even when its parent changes', () => {
    expect(resolveClient({ level: 'team', parentId: 'co', rocks, original: { parentId: null, clientTenantId: 55 } })).toEqual({ clientTenantId: 55, droppedFrom: null });
  });
});

describe('findClientRockOffer', () => {
  const base = { level: 'individual' as const, quarterYear: 2026, quarterNumber: 4 };
  const rocks = [
    cand({ id: 'co', level: 'company' }),
    cand({ id: 'b-client', title: 'B Client Rock', clientTenantId: 55 }),
    cand({ id: 'a-client', title: 'A Client Rock', clientTenantId: 55 }),
    cand({ id: 'other-client', clientTenantId: 66 }),
    cand({ id: 'old', clientTenantId: 55, quarterNumber: 3 }),
    cand({ id: 'gone', clientTenantId: 55, archived: true }),
  ];

  it('offers the client’s Team Rock for the same quarter, first by title', () => {
    expect(findClientRockOffer({ ...base, parentId: 'co', clientTenantId: 55, rocks })?.id).toBe('a-client');
  });

  it('does not offer when already under a Team Rock for that client, or there is no client', () => {
    expect(findClientRockOffer({ ...base, parentId: 'b-client', clientTenantId: 55, rocks })).toBeNull();
    expect(findClientRockOffer({ ...base, parentId: 'co', clientTenantId: null, rocks })).toBeNull();
    expect(findClientRockOffer({ ...base, level: 'team', parentId: 'co', clientTenantId: 55, rocks })).toBeNull();
  });

  it('offers nothing when the client has no active Team Rock that quarter', () => {
    expect(findClientRockOffer({ ...base, parentId: 'co', clientTenantId: 77, rocks })).toBeNull();
  });
});
