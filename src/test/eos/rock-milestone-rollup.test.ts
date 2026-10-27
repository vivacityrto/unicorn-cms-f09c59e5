import { describe, expect, it } from 'vitest';
import { rollupMilestones, type RollupMilestone, type RollupRock } from '@/utils/rockMilestoneRollup';
import { todayLocalIso } from '@/utils/localDate';

const NOW = new Date(2026, 10, 10, 9, 0, 0); // 10 Nov 2026, local time

const company: RollupRock = { id: 'company', rock_level: 'company', parent_rock_id: null };
const team: RollupRock = { id: 'team', rock_level: 'team', parent_rock_id: 'company' };
const indA: RollupRock = { id: 'indA', rock_level: 'individual', parent_rock_id: 'company' };
const indB: RollupRock = { id: 'indB', rock_level: 'individual', parent_rock_id: 'team' };

const ms = (rock: string, status: string, due: string | null = null): RollupMilestone => ({ rock_id: rock, status, due_date: due });

describe('rollupMilestones', () => {
  it('breaks an Individual Rock’s own milestones down by status', () => {
    const result = rollupMilestones([indA], [
      ms('indA', 'complete'), ms('indA', 'in_progress'), ms('indA', 'blocked'),
      ms('indA', 'off_track'), ms('indA', 'not_started'), ms('indA', 'not_started'),
    ], NOW).get('indA');

    expect(result).toEqual({ total: 6, complete: 1, inProgress: 1, blocked: 1, offTrack: 1, notStarted: 2, overdue: 0 });
  });

  it('leaves deferred milestones out of every count', () => {
    const result = rollupMilestones([indA], [ms('indA', 'complete'), ms('indA', 'deferred', '2020-01-01')], NOW).get('indA');
    expect(result).toMatchObject({ total: 1, complete: 1, overdue: 0 });
  });

  it('counts overdue as past due and not complete, within the status counts', () => {
    const result = rollupMilestones([indA], [
      ms('indA', 'in_progress', '2026-11-09'), // yesterday: overdue
      ms('indA', 'blocked', '2026-11-10'),     // due today: not overdue
      ms('indA', 'complete', '2026-01-01'),    // done: not overdue
      ms('indA', 'not_started', null),         // no due date: not overdue
      ms('indA', 'not_started', '2026-11-09T00:00:00Z'),
    ], NOW).get('indA');

    expect(result?.overdue).toBe(2);
    expect(result?.total).toBe(5);
  });

  it('rolls Individual milestones up through Team to Company, counting each once', () => {
    const rocks = [company, team, indA, indB];
    const result = rollupMilestones(rocks, [
      ms('indA', 'complete'), ms('indA', 'blocked'), ms('indB', 'in_progress'), ms('indB', 'not_started'),
      ms('company', 'complete'), // the Company Rock's own checklist is ignored once leaves have rows
    ], NOW);

    expect(result.get('company')).toMatchObject({ total: 4, complete: 1, blocked: 1, inProgress: 1, notStarted: 1 });
    expect(result.get('team')).toMatchObject({ total: 2, inProgress: 1, notStarted: 1 });
  });

  it('falls back to a Rock’s own checklist when nothing beneath it has milestone rows', () => {
    const result = rollupMilestones([company, indA], [ms('company', 'complete'), ms('company', 'not_started')], NOW).get('company');
    expect(result).toMatchObject({ total: 2, complete: 1 });
  });

  it('still prefers leaves whose rows are all deferred, reporting zero (the existing behaviour)', () => {
    const result = rollupMilestones([company, indA], [ms('indA', 'deferred'), ms('company', 'complete')], NOW).get('company');
    expect(result).toMatchObject({ total: 0, complete: 0 });
  });

  it('reports zeros for a Rock with no milestones at all', () => {
    const result = rollupMilestones([company, indA], [], NOW);
    expect(result.get('company')?.total).toBe(0);
    expect(result.get('indA')?.total).toBe(0);
  });

  it('does not recurse forever on a parent cycle in bad data', () => {
    const a: RollupRock = { id: 'a', rock_level: 'company', parent_rock_id: 'b' };
    const b: RollupRock = { id: 'b', rock_level: 'team', parent_rock_id: 'a' };
    expect(() => rollupMilestones([a, b], [ms('a', 'complete')], NOW)).not.toThrow();
  });
});

describe('todayLocalIso', () => {
  it('formats the viewer’s local date, zero padded', () => {
    expect(todayLocalIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayLocalIso(new Date(2026, 10, 10, 0, 1))).toBe('2026-11-10');
  });
});
