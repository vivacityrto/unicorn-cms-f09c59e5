import { describe, expect, it } from 'vitest';
import { archiveEffects, blockerSentences, deleteEffects, describeEvent, type RockEvent, type RockImpact } from '@/utils/rockLifecycle';

const impact = (over: Partial<RockImpact> = {}): RockImpact => ({
  rock: { id: 'r', title: 'A Rock', level: 'team', archived_at: null, quarter_year: 2026, quarter_number: 4 },
  parent: null, children_active: 0, children_archived: 0, descendants_active: 0, linked_issues: 0,
  milestones: { total: 0, started: 0, complete: 0, with_evidence: 0 }, task_links: 0, milestone_links: 0, outcomes: 0,
  blockers: [], can_delete: true, ...over,
});

const names: Record<string, string> = { u1: 'Carl', u2: 'Angela' };
const nameOf = (id: string | null) => (id ? names[id] ?? 'Someone' : 'Someone');
const event = (over: Partial<RockEvent>): RockEvent => ({ id: 1, action: 'updated', actor_user_id: 'u1', before_data: null, after_data: null, occurred_at: '', ...over });

describe('blockerSentences', () => {
  it('explains each reason with its real count', () => {
    const lines = blockerSentences(impact({
      children_active: 2, children_archived: 1, linked_issues: 1, task_links: 3, milestone_links: 1, outcomes: 2,
      milestones: { total: 5, started: 2, complete: 1, with_evidence: 1 },
      blockers: ['children', 'linked_issues', 'milestone_progress', 'task_links', 'milestone_links', 'outcomes'], can_delete: false,
    }));
    expect(lines).toEqual([
      '3 Rocks serve it.',
      '1 issue is linked to it.',
      'Its milestones show progress or evidence (2 started, 1 with evidence).',
      '3 tasks are linked to its milestones.',
      '1 milestone link ties it to other Rocks.',
      '2 outcomes have been recorded for it.',
    ]);
  });

  it('says why a Rock with a carryover or notes cannot be deleted, rather than giving no reason', () => {
    expect(blockerSentences(impact({ blockers: ['carryover', 'notes'], can_delete: false }))).toEqual([
      'It is part of a carryover to or from another quarter.',
      'Notes have been recorded on it, and notes are a permanent record.',
    ]);
  });

  it('is empty when nothing blocks deletion', () => {
    expect(blockerSentences(impact())).toEqual([]);
  });

  it('uses the singular', () => {
    expect(blockerSentences(impact({ children_active: 1, blockers: ['children'], can_delete: false }))).toEqual(['1 Rock serves it.']);
  });
});

describe('archiveEffects', () => {
  it('always says what archiving means', () => {
    expect(archiveEffects(impact(), false)[0]).toMatch(/can be restored/);
  });

  it('says what happens to the Rocks that serve it, depending on the choice', () => {
    const i = impact({ descendants_active: 3 });
    expect(archiveEffects(i, false)).toContain('3 Rocks that serve it stay active, and will no longer show under it.');
    expect(archiveEffects(i, true)).toContain('3 Rocks that serve it are archived with it.');
    expect(archiveEffects(impact({ descendants_active: 1 }), false)).toContain('1 Rock that serves it stays active, and will no longer show under it.');
  });

  it('reassures about linked issues and milestones', () => {
    const lines = archiveEffects(impact({ linked_issues: 2, milestones: { total: 4, started: 1, complete: 0, with_evidence: 0 } }), false);
    expect(lines).toContain('2 linked issues keep the link.');
    expect(lines).toContain('Its 4 milestones and their progress are kept.');
  });
});

describe('deleteEffects', () => {
  it('says it is permanent and that a record remains', () => {
    const lines = deleteEffects(impact({ milestones: { total: 2, started: 0, complete: 0, with_evidence: 0 } }));
    expect(lines[0]).toMatch(/permanently/);
    expect(lines).toContain('Its 2 milestones, none of them started, are removed with it.');
    expect(lines[lines.length - 1]).toMatch(/change history/);
  });
});

describe('describeEvent', () => {
  it('describes whole-Rock events', () => {
    expect(describeEvent(event({ action: 'created' }), nameOf)).toBe('Carl created this Rock');
    expect(describeEvent(event({ action: 'archived', actor_user_id: 'u2' }), nameOf)).toBe('Angela archived this Rock');
    expect(describeEvent(event({ action: 'restored' }), nameOf)).toBe('Carl restored this Rock');
    expect(describeEvent(event({ action: 'deleted' }), nameOf)).toBe('Carl deleted this Rock');
    expect(describeEvent(event({ action: 'created', actor_user_id: null }), nameOf)).toBe('Someone created this Rock');
  });

  it('describes a status change in words', () => {
    expect(describeEvent(event({ before_data: { status: 'on_track' }, after_data: { status: 'at_risk' } }), nameOf))
      .toBe('Carl changed the status from on track to at risk');
  });

  it('names the old and new owner', () => {
    expect(describeEvent(event({ before_data: { owner_id: 'u1' }, after_data: { owner_id: 'u2' } }), nameOf))
      .toBe('Carl changed the owner from Carl to Angela');
    expect(describeEvent(event({ before_data: { owner_id: null }, after_data: { owner_id: 'u2' } }), nameOf))
      .toBe('Carl changed the owner from nobody to Angela');
  });

  it('joins several changes', () => {
    expect(describeEvent(event({ before_data: { status: 'on_track', due_date: '2026-12-31', title: 'a' }, after_data: { status: 'complete', due_date: '2027-01-15', title: 'b' } }), nameOf))
      .toBe('Carl changed the status from on track to complete, the due date from 2026-12-31 to 2027-01-15 and the title');
  });

  it('falls back to a plain sentence for changes it does not narrate', () => {
    expect(describeEvent(event({ before_data: {}, after_data: {} }), nameOf)).toBe('Carl updated this Rock');
    expect(describeEvent(event({ before_data: { parent_rock_id: 'a' }, after_data: { parent_rock_id: 'b' } }), nameOf)).toBe('Carl changed what it serves');
  });
});
