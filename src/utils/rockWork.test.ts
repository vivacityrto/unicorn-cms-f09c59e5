import { describe, expect, it } from 'vitest';
import { rockStatusSignals, rockWorkSummary } from '@/utils/rockWork';
import type { RockTodo } from '@/utils/rockTodos';

const TODAY = '2026-11-17';

const todo = (over: Partial<RockTodo> = {}): RockTodo => ({
  todoId: 't', linkId: 'l', rockId: 'r', milestoneId: null, title: 'Do it', status: 'Open',
  dueDate: '2026-12-31', ownerId: null, ownerName: null, ...over,
});
const summary = (todos: RockTodo[]) => rockWorkSummary(todos, TODAY);
const ids = (status: Parameters<typeof rockStatusSignals>[0]['status'], hasMilestones: boolean, todos: RockTodo[]) =>
  rockStatusSignals({ status, hasMilestones, todos: summary(todos) }).map(s => s.id);

describe('rockWorkSummary', () => {
  it('counts Rock-level and milestone-level To-Dos together, once each, without cancelled ones', () => {
    const result = summary([
      todo({ todoId: 'a', milestoneId: null, status: 'Complete' }),
      todo({ todoId: 'b', milestoneId: 'm1', status: 'Complete' }),
      todo({ todoId: 'c', milestoneId: 'm1', status: 'Open', dueDate: '2026-11-01' }),
      todo({ todoId: 'd', milestoneId: 'm2', status: 'Cancelled' }),
    ]);
    expect(result).toMatchObject({ total: 3, done: 2, open: 1, overdue: 1, percent: 67 });
  });

  it('has no percentage when there is nothing to count', () => {
    expect(summary([])).toMatchObject({ total: 0, percent: null });
    expect(summary([todo({ status: 'Cancelled' })]).percent).toBeNull();
  });
});

describe('rockStatusSignals', () => {
  it('flags a Complete Rock that still has open To-Dos, and mentions how many are overdue', () => {
    const [signal] = rockStatusSignals({
      status: 'complete', hasMilestones: true,
      todos: summary([todo({ dueDate: '2026-11-01' }), todo({ todoId: 'b' }), todo({ todoId: 'c', status: 'Complete' })]),
    });
    expect(signal).toMatchObject({ id: 'complete_with_open_todos', tone: 'warn' });
    expect(signal.text).toBe('This Rock is marked Complete, but 2 linked To-Dos are still open, 1 overdue.');
  });

  it('uses the singular for one open To-Do', () => {
    const [signal] = rockStatusSignals({ status: 'complete', hasMilestones: false, todos: summary([todo()]) });
    expect(signal.text).toBe('This Rock is marked Complete, but 1 linked To-Do is still open.');
  });

  it('flags an On Track Rock with overdue To-Dos, but not one whose To-Dos are merely open', () => {
    expect(ids('on_track', true, [todo({ dueDate: '2026-11-16' })])).toEqual(['on_track_with_overdue_todos']);
    expect(ids('on_track', true, [todo({ dueDate: '2026-11-17' }), todo({ todoId: 'b', dueDate: null })])).toEqual([]);
  });

  it('stays quiet for statuses that already say the Rock is in trouble', () => {
    for (const status of ['at_risk', 'off_track', 'blocked'] as const) {
      expect(ids(status, true, [todo({ dueDate: '2026-11-01' })])).toEqual([]);
    }
  });

  it('asks whether a Rock with no milestones is finished once every linked To-Do is done, and offers Mark Complete', () => {
    const [signal] = rockStatusSignals({ status: 'on_track', hasMilestones: false, todos: summary([todo({ status: 'Complete' }), todo({ todoId: 'b', status: 'Complete' })]) });
    expect(signal).toMatchObject({ id: 'all_todos_done', tone: 'info', action: 'mark_complete' });
    expect(signal.text).toBe('All 2 linked To-Dos are done. If the work is finished, mark the Rock Complete.');
  });

  it('does not ask that when milestones exist, the Rock is already Complete or Blocked, or nothing is linked', () => {
    const done = [todo({ status: 'Complete' })];
    expect(ids('on_track', true, done)).toEqual([]);
    expect(ids('complete', false, done)).toEqual([]);
    expect(ids('blocked', false, done)).toEqual([]);
    expect(ids('on_track', false, [])).toEqual([]);
  });

  it('does not flag a Complete Rock that has no milestones and no To-Dos (older Rocks were closed that way)', () => {
    expect(ids('complete', false, [])).toEqual([]);
  });

  it('gives only the line that applies to a Complete Rock with a late To-Do', () => {
    expect(ids('complete', true, [todo({ dueDate: '2026-11-01' })])).toEqual(['complete_with_open_todos']);
  });
});
