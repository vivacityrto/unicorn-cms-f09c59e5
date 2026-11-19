import { describe, expect, it } from 'vitest';
import type { UnifiedTask } from '@/hooks/useClientAllTasks';
import { isOpen, statusKey, summariseTasks } from './taskInsights';

const today = new Date('2026-11-19T00:00:00Z');
let n = 0;
const task = (over: Partial<UnifiedTask> = {}): UnifiedTask => ({
  uid: `t${++n}`, source: 'action_item', id: n, taskName: `Task ${n}`, packageName: 'Ruby', stageName: null, dueDate: null, completionDate: null,
  status: 'todo', priority: 3, attachmentRequired: false, isOverdue: false, isDueSoon: false, isArchived: false, archivedAt: null,
  assigneeUserId: null, assigneeName: null, actionItemId: `a${n}`, actionItemStatus: 'todo', ...over,
});

describe('task insights', () => {
  it('reads a status as one of the known keys, defaulting to to do', () => {
    expect(statusKey(task({ actionItemStatus: 'in_progress' }))).toBe('in_progress');
    expect(statusKey(task({ actionItemStatus: 'WAITING_CLIENT' }))).toBe('waiting_client');
    expect(statusKey(task({ actionItemStatus: null, status: 'weird' }))).toBe('todo');
    expect(isOpen(task({ actionItemStatus: 'done' }))).toBe(false);
    expect(isOpen(task({ actionItemStatus: 'cancelled' }))).toBe(false);
    expect(isOpen(task({ actionItemStatus: 'blocked' }))).toBe(true);
  });

  it('counts open, overdue, due soon and completed, leaving archived tasks out', () => {
    const s = summariseTasks([
      task({ isOverdue: true, dueDate: '2026-10-12', assigneeName: 'Ana' }),
      task({ isOverdue: true, dueDate: '2026-11-10', assigneeName: 'Ana' }),
      task({ isDueSoon: true, dueDate: '2026-11-22', taskName: 'Send matrix', assigneeName: 'Ben' }),
      task({ actionItemStatus: 'done' }),
      task({ actionItemStatus: 'cancelled' }),
      task({ isArchived: true, isOverdue: true, dueDate: '2026-01-01' }),
    ], today);
    expect(s).toMatchObject({ total: 5, open: 3, overdue: 2, dueSoon: 1, completed: 1, oldestOverdueDays: 38 });
    // Done as a share of tasks that were not cancelled: 1 of 4.
    expect(s.completionPercent).toBe(25);
    expect(s.nextDue).toEqual({ name: 'Send matrix', inDays: 3 });
  });

  it('shows who has the open work, with unassigned as its own row', () => {
    const s = summariseTasks([task({ assigneeName: 'Ana' }), task({ assigneeName: 'Ana' }), task({ assigneeName: 'Ben' }), task(), task({ actionItemStatus: 'done', assigneeName: 'Cy' })], today);
    expect(s.byAssignee).toEqual([{ name: 'Ana', count: 2 }, { name: 'Ben', count: 1 }, { name: 'Unassigned', count: 1, unassigned: true }]);
    expect(s.byStatus.find((x) => x.key === 'todo')?.count).toBe(4);
    expect(s.byStatus.find((x) => x.key === 'done')?.count).toBe(1);
  });

  it('is safe with no tasks', () => {
    const s = summariseTasks([], today);
    expect(s).toMatchObject({ total: 0, open: 0, overdue: 0, completionPercent: 0, oldestOverdueDays: null, nextDue: null, byAssignee: [] });
  });
});
