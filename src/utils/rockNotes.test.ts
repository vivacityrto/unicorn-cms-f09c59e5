import { describe, expect, it } from 'vitest';
import { formatNoteTime, lastTimeNotes, notesSinceSummary, progressText, withStatusChanges, type RockNote } from '@/utils/rockNotes';

const note = (id: string, at: string, over: Partial<RockNote> = {}): RockNote => ({
  id,
  rock_id: 'r1',
  meeting_id: null,
  body: id,
  source: 'typed',
  rock_status: 'on_track',
  milestones_complete: 1,
  milestones_total: 4,
  created_by: 'u1',
  created_at: at,
  ...over,
});

describe('withStatusChanges', () => {
  it('lists newest first and flags the note where the status moved', () => {
    const result = withStatusChanges([
      note('a', '2026-10-01T00:00:00Z', { rock_status: 'on_track' }),
      note('b', '2026-10-08T00:00:00Z', { rock_status: 'on_track' }),
      note('c', '2026-10-15T00:00:00Z', { rock_status: 'at_risk' }),
    ]);
    expect(result.map(n => n.id)).toEqual(['c', 'b', 'a']);
    expect(result.map(n => n.statusChangedFrom)).toEqual(['on_track', null, null]);
  });

  it('compares each Rock only with itself in a roll-up', () => {
    const result = withStatusChanges([
      note('a', '2026-10-01T00:00:00Z', { rock_id: 'r1', rock_status: 'on_track' }),
      note('b', '2026-10-02T00:00:00Z', { rock_id: 'r2', rock_status: 'off_track' }),
      note('c', '2026-10-03T00:00:00Z', { rock_id: 'r1', rock_status: 'on_track' }),
    ]);
    expect(result.every(n => n.statusChangedFrom === null)).toBe(true);
  });

  it('does not invent a change when a status was not recorded', () => {
    const result = withStatusChanges([note('a', '2026-10-01T00:00:00Z', { rock_status: null }), note('b', '2026-10-02T00:00:00Z')]);
    expect(result.every(n => n.statusChangedFrom === null)).toBe(true);
  });
});

describe('lastTimeNotes', () => {
  const notes = [
    note('old1', '2026-10-01T01:00:00Z', { meeting_id: 'm1' }),
    note('old2', '2026-10-01T01:10:00Z', { meeting_id: 'm1' }),
    note('mid', '2026-10-08T01:00:00Z', { meeting_id: 'm2' }),
    note('now', '2026-10-15T01:00:00Z', { meeting_id: 'm3' }),
  ];

  it('is the latest meeting that is not the current one', () => {
    const result = lastTimeNotes(notes, 'm3');
    expect(result?.meetingId).toBe('m2');
    expect(result?.notes.map(n => n.id)).toEqual(['mid']);
  });

  it('keeps every note of that meeting, oldest first', () => {
    expect(lastTimeNotes(notes.filter(n => n.id !== 'mid' && n.id !== 'now'), 'm3')?.notes.map(n => n.id)).toEqual(['old1', 'old2']);
  });

  it('is empty when every note belongs to the current meeting', () => {
    expect(lastTimeNotes([note('x', '2026-10-15T01:00:00Z', { meeting_id: 'm3' })], 'm3')).toBeNull();
  });

  it('groups notes written outside a meeting by day', () => {
    const result = lastTimeNotes([note('d1', '2026-10-02T01:00:00Z'), note('d2', '2026-10-02T05:00:00Z'), note('d0', '2026-09-30T05:00:00Z')], undefined);
    expect(result?.notes.map(n => n.id)).toEqual(['d1', 'd2']);
    expect(result?.meetingId).toBeNull();
  });
});

describe('notesSinceSummary', () => {
  it('counts only notes written after the summary looked', () => {
    const notes = [note('a', '2026-10-01T00:00:00Z'), note('b', '2026-10-05T00:00:00Z'), note('c', '2026-10-09T00:00:00Z')];
    expect(notesSinceSummary(notes, { notes_through: '2026-10-05T00:00:00Z' })).toBe(1);
    expect(notesSinceSummary(notes, null)).toBe(3);
  });
});

describe('formatNoteTime', () => {
  const now = new Date('2026-10-28T03:00:00Z'); // 2:00 pm Sydney (AEDT)

  it('says Today and Yesterday in Sydney time', () => {
    expect(formatNoteTime('2026-10-28T01:40:00Z', now)).toMatch(/^Today, 12:40 pm/);
    expect(formatNoteTime('2026-10-27T01:40:00Z', now)).toMatch(/^Yesterday, 12:40 pm/);
  });

  it('uses a short date for older notes and adds the year across a year boundary', () => {
    expect(formatNoteTime('2026-10-14T05:00:00Z', now)).toMatch(/^Wed 14 Oct, 4:00 pm/);
    expect(formatNoteTime('2025-10-14T05:00:00Z', now)).toMatch(/2025/);
  });

  it('puts a late-evening UTC note on the Sydney day it was written', () => {
    expect(formatNoteTime('2026-10-27T14:30:00Z', now)).toMatch(/^Today, 1:30 am/);
  });
});

describe('progressText', () => {
  it('reads as words, and says nothing when there were no milestones', () => {
    expect(progressText({ milestones_complete: 2, milestones_total: 5 })).toBe('2 of 5 milestones');
    expect(progressText({ milestones_complete: 0, milestones_total: 0 })).toBeNull();
    expect(progressText({ milestones_complete: null, milestones_total: null })).toBeNull();
  });
});
