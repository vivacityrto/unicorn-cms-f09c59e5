import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  filterCounts,
  filterMilestones,
  milestoneMetrics,
  milestoneRef,
  parseMilestoneTitle,
  quarterBounds,
  sortMilestones,
  timelineModel,
  type PanelMilestone,
} from '@/utils/rockPanelMetrics';
import type { MilestoneTaskLink } from '@/utils/rockMilestoneTasks';

const TODAY = '2026-11-10';

const m = (id: string, status: PanelMilestone['status'], extra: Partial<PanelMilestone> = {}): PanelMilestone => ({
  id, title: `Milestone ${id} - Thing ${id}`, label: `Thing ${id}`, number: Number(id) || null, status, priority: 'high',
  ownerId: null, dueDate: null, exitCriteria: null, evidenceUrl: null, order: Number(id) || 0, ...extra,
});

const task = (milestone: string, state: string, status: string): MilestoneTaskLink => ({
  id: `${milestone}-${status}-${state}`, milestone_id: milestone, external_key: 'repo#1', external_url: 'https://github.com/o/r/issues/1',
  title: 't', task_state: state, task_status: status, priority: null, due_date: null, assignees: [], last_synced_at: '2026-10-27T00:00:00Z',
});

describe('parseMilestoneTitle / milestoneRef', () => {
  it('splits a numbered "Milestone N - title"', () => {
    expect(parseMilestoneTitle('Milestone 4 - Establish safe cross-tenant test fixtures')).toEqual({ number: 4, label: 'Establish safe cross-tenant test fixtures' });
    expect(parseMilestoneTitle('Milestone 12 – Dash variants')).toEqual({ number: 12, label: 'Dash variants' });
    expect(parseMilestoneTitle('M7: Short form')).toEqual({ number: 7, label: 'Short form' });
  });

  it('leaves an unnumbered title alone', () => {
    expect(parseMilestoneTitle('Prepare RBAC role × capability matrix')).toEqual({ number: null, label: 'Prepare RBAC role × capability matrix' });
    expect(parseMilestoneTitle('Milestone planning for later')).toEqual({ number: null, label: 'Milestone planning for later' });
  });

  it('builds a short reference', () => {
    expect(milestoneRef({ number: 4, label: 'x' })).toBe('M4');
    expect(milestoneRef({ number: null, label: 'A very long unnumbered milestone title indeed' }, 20)).toBe('A very long unnumbe…');
    expect(milestoneRef({ number: null, label: 'Short' })).toBe('Short');
  });
});

describe('daysBetween', () => {
  it('counts calendar days either way and across month ends', () => {
    expect(daysBetween('2026-11-10', '2026-11-10')).toBe(0);
    expect(daysBetween('2026-11-10', '2026-12-04')).toBe(24);
    expect(daysBetween('2026-11-10', '2026-11-01')).toBe(-9);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('milestoneMetrics', () => {
  it('counts every status, leaves deferred out of the active total, and reports the complete share', () => {
    const result = milestoneMetrics([
      m('1', 'complete'), m('2', 'in_progress'), m('3', 'blocked'), m('4', 'off_track'), m('5', 'not_started'), m('6', 'not_started'), m('7', 'deferred'),
    ], [], TODAY);

    expect(result).toMatchObject({ total: 7, active: 6, complete: 1, inProgress: 1, blocked: 1, offTrack: 1, notStarted: 2, deferred: 1 });
    expect(result.percentComplete).toBe(17);
  });

  it('has no percentage when nothing is active', () => {
    expect(milestoneMetrics([m('1', 'deferred')], [], TODAY).percentComplete).toBeNull();
    expect(milestoneMetrics([], [], TODAY).percentComplete).toBeNull();
  });

  it('flags overdue only for open milestones due before today', () => {
    const result = milestoneMetrics([
      m('1', 'in_progress', { dueDate: '2026-11-09' }),
      m('2', 'not_started', { dueDate: '2026-11-10' }),
      m('3', 'complete', { dueDate: '2026-01-01' }),
      m('4', 'deferred', { dueDate: '2026-01-01' }),
      m('5', 'not_started', { dueDate: '2026-11-09T00:00:00Z' }),
    ], [], TODAY);

    expect(result.overdue).toBe(2);
    expect(result.attentionIds).toEqual(new Set(['1', '5']));
  });

  it('needs attention when blocked, off track, overdue or holding an open blocked task, but never when done', () => {
    const result = milestoneMetrics(
      [m('1', 'blocked'), m('2', 'off_track'), m('3', 'in_progress'), m('4', 'not_started'), m('5', 'complete')],
      [task('3', 'open', 'blocked'), task('5', 'open', 'blocked'), task('4', 'closed', 'blocked')],
      TODAY,
    );

    expect(result.attentionIds).toEqual(new Set(['1', '2', '3']));
  });

  it('finds the next due open milestone, which may already be overdue', () => {
    const result = milestoneMetrics([
      m('1', 'complete', { dueDate: '2026-11-01' }),
      m('2', 'not_started', { dueDate: '2026-12-04' }),
      m('3', 'in_progress', { dueDate: '2026-11-20' }),
      m('4', 'not_started'),
    ], [], TODAY);

    expect(result.nextDue).toMatchObject({ id: '3', ref: 'M3', dueDate: '2026-11-20', days: 10 });
    const overdue = milestoneMetrics([m('9', 'in_progress', { dueDate: '2026-11-05' })], [], TODAY);
    expect(overdue.nextDue?.days).toBe(-5);
    expect(milestoneMetrics([m('1', 'complete', { dueDate: '2026-11-20' })], [], TODAY).nextDue).toBeNull();
  });

  it('totals tasks, closed tasks and open blocked tasks', () => {
    const result = milestoneMetrics([m('1', 'in_progress')], [task('1', 'open', 'blocked'), task('1', 'closed', 'completed'), task('1', 'open', 'in progress')], TODAY);
    expect(result.tasks).toEqual({ total: 3, closed: 1, blocked: 1 });
  });
});

describe('quarterBounds', () => {
  it('returns the first and last day of each quarter, including a leap February', () => {
    expect(quarterBounds(2026, 1)).toEqual({ startIso: '2026-01-01', endIso: '2026-03-31' });
    expect(quarterBounds(2026, 2)).toEqual({ startIso: '2026-04-01', endIso: '2026-06-30' });
    expect(quarterBounds(2026, 3)).toEqual({ startIso: '2026-07-01', endIso: '2026-09-30' });
    expect(quarterBounds(2026, 4)).toEqual({ startIso: '2026-10-01', endIso: '2026-12-31' });
  });
});

describe('timelineModel', () => {
  const q4 = { year: 2026, quarter: 4 };

  it('places markers by due date across the quarter and marks today', () => {
    const model = timelineModel([m('1', 'not_started', { dueDate: '2026-10-01' }), m('2', 'not_started', { dueDate: '2026-12-31' }), m('3', 'not_started', { dueDate: '2026-11-15' })], q4, '2026-11-15');

    expect(model.points.map(p => [p.id, Math.round(p.pct)])).toEqual([['1', 0], ['3', 49], ['2', 100]]);
    expect(model.todayPct).toBeCloseTo(49.45, 1); // day 45 of a 91-day quarter
    expect(model.months.map(x => x.label)).toEqual(['Oct', 'Nov', 'Dec']);
    expect(model.months[0].pct).toBe(0);
  });

  it('hides today outside the quarter and pins out-of-quarter due dates to the edge', () => {
    const model = timelineModel([m('1', 'not_started', { dueDate: '2027-02-01' }), m('2', 'not_started', { dueDate: '2026-09-01' })], q4, '2027-03-01');

    expect(model.todayPct).toBeNull();
    expect(model.points.map(p => [p.id, p.pct, p.clamped])).toEqual([['2', 0, true], ['1', 100, true]]);
  });

  it('counts undated milestones instead of placing them', () => {
    const model = timelineModel([m('1', 'not_started'), m('2', 'not_started', { dueDate: '2026-11-15' })], q4, TODAY);
    expect(model.undated).toBe(1);
    expect(model.points).toHaveLength(1);
  });

  it('puts markers that share a date in separate lanes, up to a cap', () => {
    const same = Array.from({ length: 6 }, (_, i) => m(String(i + 1), 'not_started', { dueDate: '2026-12-04' }));
    const model = timelineModel(same, q4, TODAY);

    expect(model.points.map(p => p.lane)).toEqual([0, 1, 2, 3, 3, 3]);
    expect(model.lanes).toBe(4);
  });

  it('reuses a lane once markers are far enough apart', () => {
    const model = timelineModel([m('1', 'not_started', { dueDate: '2026-10-10' }), m('2', 'not_started', { dueDate: '2026-12-01' })], q4, TODAY);
    expect(model.points.map(p => p.lane)).toEqual([0, 0]);
    expect(model.lanes).toBe(1);
  });

  it('marks an open milestone past its due date as overdue', () => {
    const model = timelineModel([m('1', 'in_progress', { dueDate: '2026-11-01' }), m('2', 'complete', { dueDate: '2026-11-01' })], q4, TODAY);
    expect(model.points.map(p => p.overdue)).toEqual([true, false]);
  });
});

describe('filterMilestones / filterCounts / sortMilestones', () => {
  const rows = [
    m('1', 'complete', { exitCriteria: 'Inventory is versioned', ownerId: 'u1' }),
    m('2', 'in_progress', { dueDate: '2026-12-04', ownerId: 'u2' }),
    m('3', 'blocked', { dueDate: '2026-11-20' }),
    m('4', 'not_started', { dueDate: '2026-11-20' }),
    m('5', 'not_started'),
  ];
  const context = { attentionIds: new Set(['3']), ownerNames: new Map([['u1', 'Carl Simpao'], ['u2', 'Khian Sismundo']]) };

  it('filters by status group and attention', () => {
    expect(filterMilestones(rows, 'all', '', context)).toHaveLength(5);
    expect(filterMilestones(rows, 'attention', '', context).map(r => r.id)).toEqual(['3']);
    expect(filterMilestones(rows, 'in_progress', '', context).map(r => r.id)).toEqual(['2']);
    expect(filterMilestones(rows, 'not_started', '', context).map(r => r.id)).toEqual(['4', '5']);
    expect(filterMilestones(rows, 'done', '', context).map(r => r.id)).toEqual(['1']);
  });

  it('searches title, exit criteria and owner name, ignoring case', () => {
    expect(filterMilestones(rows, 'all', 'VERSIONED', context).map(r => r.id)).toEqual(['1']);
    expect(filterMilestones(rows, 'all', 'khian', context).map(r => r.id)).toEqual(['2']);
    expect(filterMilestones(rows, 'all', 'thing 5', context).map(r => r.id)).toEqual(['5']);
    expect(filterMilestones(rows, 'all', 'zzz', context)).toEqual([]);
  });

  it('combines a filter with a search', () => {
    expect(filterMilestones(rows, 'not_started', 'thing 4', context).map(r => r.id)).toEqual(['4']);
  });

  it('counts each filter', () => {
    expect(filterCounts(rows, context)).toEqual({ all: 5, attention: 1, in_progress: 1, not_started: 2, done: 1 });
  });

  it('sorts by plan order or by due date with undated last and ties in plan order', () => {
    const shuffled = [rows[4], rows[1], rows[3], rows[0], rows[2]];
    expect(sortMilestones(shuffled, 'plan').map(r => r.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(sortMilestones(shuffled, 'due').map(r => r.id)).toEqual(['3', '4', '2', '1', '5']);
  });
});
