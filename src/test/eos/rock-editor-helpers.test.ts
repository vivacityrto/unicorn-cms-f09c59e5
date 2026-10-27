import { describe, expect, it } from 'vitest';
import { changeLevel, changeParent, changeQuarter, initialValues, newMilestone, nextInBatch, quarterEnd, quarterOf } from '@/utils/rockEditor/defaults';
import { findLikelyDuplicates, normalizeTitle } from '@/utils/rockEditor/duplicates';
import { parseMilestoneList } from '@/utils/rockEditor/pasteList';
import { clearDraft, draftKey, isMeaningful, loadDraft, saveDraft } from '@/utils/rockEditor/draft';
import { buildLinkRows, buildMilestoneRows, buildRockPayload } from '@/utils/rockEditor/payload';
import type { ParentCandidate, RockEditorValues } from '@/utils/rockEditor/types';

const NOW = new Date(2026, 10, 10, 9, 0, 0);
const parent = (over: Partial<ParentCandidate> = {}): ParentCandidate => ({
  id: 'co', title: 'Company', level: 'company', quarterYear: 2027, quarterNumber: 1, ownerId: null, archived: false, parentId: null, ...over,
});

describe('defaults', () => {
  it('knows the quarter and its end', () => {
    expect(quarterOf(new Date(2026, 0, 1))).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf(new Date(2026, 11, 31))).toEqual({ year: 2026, quarter: 4 });
    expect(quarterEnd(2026, 2)).toBe('2026-06-30');
  });

  it('starts a Rock in the current quarter, due at its end, owned by the maker only for an Individual Rock', () => {
    const individual = initialValues({ level: 'individual', currentUserId: 'me', now: NOW });
    expect(individual).toMatchObject({ quarterYear: 2026, quarterNumber: 4, dueDate: '2026-12-31', ownerId: 'me', parentId: null });
    expect(initialValues({ level: 'company', currentUserId: 'me', now: NOW }).ownerId).toBeNull();
    expect(initialValues({ level: 'team', currentUserId: 'me', now: NOW }).ownerId).toBeNull();
  });

  it('adopts the parent’s quarter, which the rules require to match', () => {
    const v = initialValues({ level: 'team', parent: parent(), now: NOW });
    expect(v).toMatchObject({ parentId: 'co', quarterYear: 2027, quarterNumber: 1, dueDate: '2027-03-31' });
  });

  it('moves a default due date with the quarter but leaves a chosen one alone', () => {
    const v = initialValues({ level: 'company', now: NOW });
    expect(changeQuarter(v, 2027, 1).dueDate).toBe('2027-03-31');
    expect(changeQuarter({ ...v, dueDate: '2026-11-15' }, 2027, 1).dueDate).toBe('2026-11-15');
  });

  it('adopts a new parent’s quarter and drops milestone links that belonged to the old parent', () => {
    const v = { ...initialValues({ level: 'individual', now: NOW }), milestones: [{ ...newMilestone('A', 'a'), supports: ['c1'] }, newMilestone('B', 'b')] };
    const next = changeParent(v, parent());
    expect(next).toMatchObject({ parentId: 'co', quarterYear: 2027, quarterNumber: 1, dueDate: '2027-03-31' });
    expect(next.milestones.map(m => m.supports)).toEqual([[], []]);
    expect(changeParent(next, null).parentId).toBeNull();
  });

  it('resets what only made sense at the old level when the level changes', () => {
    const v: RockEditorValues = { ...initialValues({ level: 'team', parent: parent(), now: NOW }), functionId: 'fn', ownerId: null };
    const next = changeLevel(v, 'individual', 'me');
    expect(next).toMatchObject({ level: 'individual', parentId: null, functionId: null, ownerId: 'me' });
    expect(changeLevel(v, 'team', 'me')).toBe(v);
    expect(changeLevel({ ...v, ownerId: 'keep' }, 'individual', 'me').ownerId).toBe('keep');
  });

  it('prepares the next Rock in a batch with the same level, parent and quarter', () => {
    const v: RockEditorValues = { ...initialValues({ level: 'team', parent: parent(), now: NOW }), functionId: 'fn', ownerId: 'o', title: 'Done', description: 'd', issue: 'i', outcome: 'o', milestones: [newMilestone('M')] };
    expect(nextInBatch(v)).toMatchObject({ level: 'team', parentId: 'co', functionId: 'fn', ownerId: 'o', quarterYear: 2027, title: '', description: '', issue: '', outcome: '', milestones: [] });
  });
});

describe('duplicates', () => {
  const rocks = [
    { id: '1', title: 'Launch the new client portal', quarterYear: 2026, quarterNumber: 4, archived: false },
    { id: '2', title: 'Client Rock - Altaira Education - Q3 2026', quarterYear: 2026, quarterNumber: 3, archived: false },
    { id: '3', title: 'Launch the new client portal', quarterYear: 2026, quarterNumber: 3, archived: false },
    { id: '4', title: 'Launch the new client portal', quarterYear: 2026, quarterNumber: 4, archived: true },
    { id: '5', title: 'Hire two account managers for sales', quarterYear: 2026, quarterNumber: 4, archived: false },
  ];
  const q4 = { year: 2026, quarter: 4 };

  it('normalises case, punctuation and accents', () => {
    expect(normalizeTitle('  Launch: the NEW client-portal! ')).toBe('launch the new client portal');
    expect(normalizeTitle('Café Rock')).toBe('cafe rock');
  });

  it('finds an identical title in the same quarter, ignoring other quarters and archived Rocks', () => {
    const found = findLikelyDuplicates('launch the new client portal', q4, rocks);
    expect(found.map(m => [m.rock.id, m.reason])).toEqual([['1', 'same_title']]);
  });

  it('finds a close title by shared words, but not a loose one', () => {
    expect(findLikelyDuplicates('Launch new client portal v2', q4, rocks)[0]).toMatchObject({ reason: 'similar' });
    expect(findLikelyDuplicates('Launch the marketing website', q4, rocks)).toEqual([]);
  });

  it('does not compare very short titles, and can exclude the Rock being edited', () => {
    expect(findLikelyDuplicates('Hire', q4, rocks)).toEqual([]);
    expect(findLikelyDuplicates('Launch the new client portal', q4, rocks, { excludeId: '1' })).toEqual([]);
  });

  it('caps the matches it returns', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, title: 'Same title here', quarterYear: 2026, quarterNumber: 4, archived: false }));
    expect(findLikelyDuplicates('Same title here', q4, many, { limit: 2 })).toHaveLength(2);
    expect(findLikelyDuplicates('Same title here', q4, many)).toHaveLength(3);
  });
});

describe('parseMilestoneList', () => {
  it('strips bullets and numbering, drops blanks and repeats, and keeps order', () => {
    const text = '- Build the inventory\n2. Review callers\n  • Record evidence\n\n* build the inventory\n3) Close findings\r\n';
    expect(parseMilestoneList(text)).toEqual(['Build the inventory', 'Review callers', 'Record evidence', 'Close findings']);
  });

  it('leaves a title that merely starts with a number alone', () => {
    expect(parseMilestoneList('2026 planning pack\n3 phases of rollout')).toEqual(['2026 planning pack', '3 phases of rollout']);
  });

  it('caps the list', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Item ${i}`).join('\n');
    expect(parseMilestoneList(text)).toHaveLength(30);
    expect(parseMilestoneList(text, 5)).toHaveLength(5);
    expect(parseMilestoneList('   \n\n')).toEqual([]);
  });
});

describe('drafts', () => {
  const make = (): Record<string, string> => ({});
  const storage = (bag: Record<string, string>) => ({
    getItem: (k: string) => (k in bag ? bag[k] : null),
    setItem: (k: string, v: string) => { bag[k] = v; },
    removeItem: (k: string) => { delete bag[k]; },
  });
  const typed: RockEditorValues = { ...initialValues({ level: 'team', now: NOW }), title: 'Half-typed' };

  it('keys a draft by level and parent', () => {
    expect(draftKey('team', 'co')).toBe('eos-rock-draft:team:co');
    expect(draftKey('company', null)).toBe('eos-rock-draft:company:none');
  });

  it('keeps only drafts with something typed', () => {
    expect(isMeaningful(initialValues({ level: 'team', now: NOW }))).toBe(false);
    expect(isMeaningful(typed)).toBe(true);
    expect(isMeaningful({ ...initialValues({ level: 'team', now: NOW }), milestones: [newMilestone('x')] })).toBe(true);
  });

  it('round-trips a draft and clears it', () => {
    const bag = make();
    saveDraft(storage(bag), 'k', typed, 1000);
    expect(loadDraft(storage(bag), 'k', 2000)?.values.title).toBe('Half-typed');
    clearDraft(storage(bag), 'k');
    expect(loadDraft(storage(bag), 'k', 2000)).toBeNull();
  });

  it('removes a draft once it is empty again', () => {
    const bag = make();
    saveDraft(storage(bag), 'k', typed, 1000);
    saveDraft(storage(bag), 'k', initialValues({ level: 'team', now: NOW }), 1500);
    expect(bag.k).toBeUndefined();
  });

  it('drops a draft that is stale or malformed', () => {
    const bag = make();
    saveDraft(storage(bag), 'k', typed, 1000);
    expect(loadDraft(storage(bag), 'k', 1000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(bag.k).toBeUndefined();
    bag.k = '{not json';
    expect(loadDraft(storage(bag), 'k')).toBeNull();
    bag.k = JSON.stringify({ v: 2, savedAt: 1, values: typed });
    expect(loadDraft(storage(bag), 'k', 2)).toBeNull();
  });

  it('survives storage that throws or is missing', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(() => saveDraft(broken, 'k', typed)).not.toThrow();
    expect(loadDraft(broken, 'k')).toBeNull();
    expect(() => clearDraft(broken, 'k')).not.toThrow();
    expect(() => saveDraft(undefined, 'k', typed)).not.toThrow();
    expect(loadDraft(undefined, 'k')).toBeNull();
  });
});

describe('payload builders', () => {
  const values: RockEditorValues = {
    level: 'individual', parentId: 'tm', functionId: 'fn-ignored', ownerId: 'me', title: '  Ship it  ', description: '', issue: ' why ', outcome: '',
    quarterYear: 2026, quarterNumber: 4, dueDate: '2026-12-31',
    milestones: [
      { ...newMilestone('  First  ', 'm1'), ownerId: 'other', dueDate: '2026-11-20', priority: 'high', exitCriteria: ' done when x ', supports: ['c1', 'c1', 'c2'] },
      { ...newMilestone('', 'blank') },
      { ...newMilestone('Second', 'm2'), status: 'complete' },
    ],
  };

  it('builds the server payload', () => {
    const p = buildRockPayload({ ...values, functionId: null }, { tenantId: 6372 });
    expect(p).toMatchObject({ title: 'Ship it', description: null, issue: 'why', outcome: null, rock_level: 'individual', function_id: null, owner_id: 'me', parent_rock_id: 'tm', quarter_year: 2026, quarter_number: 4, due_date: '2026-12-31', tenant_id: 6372 });
    expect(p).not.toHaveProperty('id');
    expect(p).not.toHaveProperty('status');
    expect(p).not.toHaveProperty('client_tenant_id');
  });

  it('sends the team for a Team Rock, keeps one an Individual Rock already has, and never sends a parent or team for a Company Rock', () => {
    expect(buildRockPayload({ ...values, level: 'team', functionId: 'fn' }, { tenantId: 1 }).function_id).toBe('fn');
    expect(buildRockPayload({ ...values, functionId: null }, { tenantId: 1 }).function_id).toBeNull();
    expect(buildRockPayload({ ...values, functionId: 'saved-team' }, { tenantId: 1 }).function_id).toBe('saved-team');
    expect(buildRockPayload({ ...values, level: 'company' }, { tenantId: 1 })).toMatchObject({ parent_rock_id: null, function_id: null });
  });

  it('keeps the legacy checklist in step, skipping blank rows', () => {
    const p = buildRockPayload(values, { tenantId: 1 });
    expect(p.milestones).toEqual([{ id: 'm1', text: 'First', completed: false }, { id: 'm2', text: 'Second', completed: true }]);
    expect(buildRockPayload({ ...values, milestones: [] }, { tenantId: 1 }).milestones).toBeNull();
  });

  it('resends what an edit must not lose', () => {
    const p = buildRockPayload(values, { tenantId: 1, id: 'rock-1', status: 'at_risk', priority: 3, clientTenantId: 55, rockType: 'client' });
    expect(p).toMatchObject({ id: 'rock-1', status: 'at_risk', priority: 3, client_tenant_id: 55, rock_type: 'client' });
  });

  it('builds milestone rows that fall back to the Rock’s own owner and date', () => {
    const rows = buildMilestoneRows(values, 'rock-1', 6372);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'm1', rock_id: 'rock-1', tenant_id: 6372, title: 'First', owner_id: 'other', due_date: '2026-11-20', priority: 'high', exit_criteria: 'done when x', status: 'not_started', sort_order: 0 });
    expect(rows[1]).toMatchObject({ id: 'm2', owner_id: 'me', due_date: '2026-12-31', status: 'complete', exit_criteria: null, sort_order: 1 });
  });

  it('builds links only for an Individual Rock, once per Company milestone', () => {
    expect(buildLinkRows(values, 6372)).toEqual([
      { tenant_id: 6372, company_milestone_id: 'c1', individual_milestone_id: 'm1' },
      { tenant_id: 6372, company_milestone_id: 'c2', individual_milestone_id: 'm1' },
    ]);
    expect(buildLinkRows({ ...values, level: 'team' }, 6372)).toEqual([]);
  });
});
