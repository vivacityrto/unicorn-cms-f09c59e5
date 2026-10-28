import { describe, expect, it } from 'vitest';
import { sortMilestoneTasks, summarizeMilestoneTasks, type MilestoneTaskLink } from '@/utils/rockMilestoneTasks';

const task = (overrides: Partial<MilestoneTaskLink>): MilestoneTaskLink => ({
  id: 't', milestone_id: 'm', external_key: 'repo#1', external_url: 'https://github.com/o/r/issues/1',
  title: 'Task', task_state: 'open', task_status: 'backlog', priority: null, due_date: null,
  assignees: [], last_synced_at: '2026-10-27T00:00:00Z', ...overrides,
});

describe('summarizeMilestoneTasks', () => {
  it('counts open, closed and blocked tasks', () => {
    const summary = summarizeMilestoneTasks(
      [task({ id: '1', task_status: 'blocked' }), task({ id: '2', task_state: 'closed', task_status: 'completed' }), task({ id: '3' })],
      'in_progress',
    );
    expect(summary).toEqual({ total: 3, closed: 1, open: 2, blocked: 1, overdue: 0, readyForReview: false });
  });

  it('does not count a closed task as blocked, whatever its last status was', () => {
    const summary = summarizeMilestoneTasks([task({ task_state: 'closed', task_status: 'blocked' })], 'in_progress');
    expect(summary.blocked).toBe(0);
  });

  it('is ready for review only when every task is closed and the milestone is still open', () => {
    const closed = [task({ id: '1', task_state: 'closed' }), task({ id: '2', task_state: 'closed' })];
    expect(summarizeMilestoneTasks(closed, 'in_progress').readyForReview).toBe(true);
    expect(summarizeMilestoneTasks(closed, 'not_started').readyForReview).toBe(true);
    expect(summarizeMilestoneTasks(closed, 'blocked').readyForReview).toBe(true);
    expect(summarizeMilestoneTasks(closed, 'complete').readyForReview).toBe(false);
    expect(summarizeMilestoneTasks(closed, 'deferred').readyForReview).toBe(false);
  });

  it('is never ready for review with no tasks or an open task', () => {
    expect(summarizeMilestoneTasks([], 'in_progress').readyForReview).toBe(false);
    expect(summarizeMilestoneTasks([task({ task_state: 'closed' }), task({ id: '2' })], 'in_progress').readyForReview).toBe(false);
  });
});

describe('sortMilestoneTasks', () => {
  it('puts blocked first, then other open tasks, then closed, by title within a group', () => {
    const sorted = sortMilestoneTasks([
      task({ id: 'c', title: 'Closed', task_state: 'closed' }),
      task({ id: 'b', title: 'B open' }),
      task({ id: 'a', title: 'A open' }),
      task({ id: 'x', title: 'Blocked', task_status: 'blocked' }),
    ]);
    expect(sorted.map(t => t.id)).toEqual(['x', 'a', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const input = [task({ id: '2', title: 'B' }), task({ id: '1', title: 'A' })];
    sortMilestoneTasks(input);
    expect(input.map(t => t.id)).toEqual(['2', '1']);
  });
});
