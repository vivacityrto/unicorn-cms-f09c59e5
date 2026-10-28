import { describe, expect, it } from 'vitest';
import { milestoneMetrics, type PanelMilestone } from '@/utils/rockPanelMetrics';
import { summarizeMilestoneTasks } from '@/utils/rockMilestoneTasks';
import { isOverdueTodo, sortTodos, splitTodosByMilestone, summarizeTodos, todoTargetLabel, type RockTodo } from '@/utils/rockTodos';

const TODAY = '2026-10-29';

const todo = (id: string, over: Partial<RockTodo> = {}): RockTodo => ({
  todoId: id, linkId: `l-${id}`, rockId: 'r1', milestoneId: 'm1', title: id, status: 'Open', dueDate: '2026-11-05', ownerId: 'u1', ownerName: 'Ana', ...over,
});

describe('summarizeTodos', () => {
  it('counts done, open and overdue, and leaves cancelled To-Dos out of everything', () => {
    const summary = summarizeTodos(
      [todo('a'), todo('b', { dueDate: '2026-10-01' }), todo('c', { status: 'Complete', dueDate: '2026-10-01' }), todo('d', { status: 'Cancelled' })],
      TODAY,
    );
    expect(summary).toEqual({ total: 3, done: 1, open: 2, overdue: 1 });
  });

  it('does not call a finished To-Do overdue, nor one with no date', () => {
    expect(isOverdueTodo(todo('x', { status: 'Complete', dueDate: '2026-01-01' }), TODAY)).toBe(false);
    expect(isOverdueTodo(todo('y', { dueDate: null }), TODAY)).toBe(false);
    expect(isOverdueTodo(todo('z', { dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdueTodo(todo('w', { dueDate: '2026-10-28T00:00:00Z' }), TODAY)).toBe(true);
  });
});

describe('sortTodos', () => {
  it('puts overdue first, then open by date with undated last, then done, then cancelled', () => {
    const sorted = sortTodos(
      [
        todo('done', { status: 'Complete' }),
        todo('undated', { dueDate: null }),
        todo('soon', { dueDate: '2026-10-30' }),
        todo('late', { dueDate: '2026-10-01' }),
        todo('cancelled', { status: 'Cancelled' }),
      ],
      TODAY,
    );
    expect(sorted.map(t => t.todoId)).toEqual(['late', 'soon', 'undated', 'done', 'cancelled']);
  });
});

describe('splitTodosByMilestone', () => {
  it('separates To-Dos for a milestone from those for the whole Rock', () => {
    const { byMilestone, rockLevel } = splitTodosByMilestone([todo('a'), todo('b', { milestoneId: 'm2' }), todo('c', { milestoneId: null }), todo('d')]);
    expect(byMilestone.get('m1')?.map(t => t.todoId)).toEqual(['a', 'd']);
    expect(byMilestone.get('m2')?.map(t => t.todoId)).toEqual(['b']);
    expect(rockLevel.map(t => t.todoId)).toEqual(['c']);
  });
});

describe('todoTargetLabel', () => {
  it('names the Rock, and the milestone when there is one', () => {
    expect(todoTargetLabel({ rockTitle: 'Harden RBAC', milestoneTitle: null })).toBe('Harden RBAC');
    expect(todoTargetLabel({ rockTitle: 'Harden RBAC', milestoneTitle: 'Verify roles' })).toBe('Harden RBAC · Verify roles');
  });
});

describe('To-Dos in the milestone summary', () => {
  it('adds live To-Dos to the linked-task counts, and reports overdue ones', () => {
    const summary = summarizeMilestoneTasks([], 'in_progress', [todo('a'), todo('b', { status: 'Complete' }), todo('c', { dueDate: '2026-10-01' })], TODAY);
    expect(summary).toMatchObject({ total: 3, closed: 1, open: 2, overdue: 1, readyForReview: false });
  });

  it('is ready for review only when every To-Do is done, and never completes anything itself', () => {
    expect(summarizeMilestoneTasks([], 'in_progress', [todo('a', { status: 'Complete' })], TODAY).readyForReview).toBe(true);
    expect(summarizeMilestoneTasks([], 'complete', [todo('a', { status: 'Complete' })], TODAY).readyForReview).toBe(false);
  });
});

describe('To-Dos in the milestone metrics', () => {
  const milestone = (id: string, over: Partial<PanelMilestone> = {}): PanelMilestone => ({
    id, title: id, label: id, number: null, status: 'in_progress', priority: null, ownerId: null, dueDate: '2026-12-31', exitCriteria: null, evidenceUrl: null, order: 1, ...over,
  });

  it('flags an open milestone with an overdue To-Do for attention, and counts To-Dos in the task totals', () => {
    const metrics = milestoneMetrics(
      [milestone('m1'), milestone('m2')],
      [],
      TODAY,
      [todo('a', { milestoneId: 'm1', dueDate: '2026-10-01' }), todo('b', { milestoneId: 'm2' }), todo('c', { milestoneId: 'm2', status: 'Complete' }), todo('rock-level', { milestoneId: null })],
    );
    expect([...metrics.attentionIds]).toEqual(['m1']);
    expect(metrics.tasks).toEqual({ total: 3, closed: 1, blocked: 0 }); // the Rock-level To-Do is not a milestone task
  });

  it('does not flag a completed milestone for an overdue To-Do', () => {
    const metrics = milestoneMetrics([milestone('m1', { status: 'complete' })], [], TODAY, [todo('a', { milestoneId: 'm1', dueDate: '2026-10-01' })]);
    expect(metrics.attentionIds.size).toBe(0);
  });
});
