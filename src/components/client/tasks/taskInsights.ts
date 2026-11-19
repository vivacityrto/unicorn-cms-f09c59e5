import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { UnifiedTask } from '@/hooks/useClientAllTasks';

export const STATUS_ORDER = ['todo', 'in_progress', 'blocked', 'waiting_client', 'done', 'cancelled'] as const;
export type TaskStatusKey = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<TaskStatusKey, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  waiting_client: 'Waiting on you',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** A task's status as one of the known keys; anything else counts as to do. */
export function statusKey(t: Pick<UnifiedTask, 'actionItemStatus' | 'status'>): TaskStatusKey {
  const raw = String(t.actionItemStatus ?? t.status ?? 'todo').toLowerCase();
  return (STATUS_ORDER as readonly string[]).includes(raw) ? (raw as TaskStatusKey) : 'todo';
}

export const isOpen = (t: Pick<UnifiedTask, 'actionItemStatus' | 'status'>) => {
  const k = statusKey(t);
  return k !== 'done' && k !== 'cancelled';
};

export interface TaskSummary {
  total: number;
  open: number;
  overdue: number;
  dueSoon: number;
  completed: number;
  /** Done as a share of tasks that were not cancelled, 0 to 100. */
  completionPercent: number;
  oldestOverdueDays: number | null;
  nextDue: { name: string; inDays: number } | null;
  byStatus: Array<{ key: TaskStatusKey; label: string; count: number }>;
  /** Open tasks per person, most first, with the unassigned ones as their own row. */
  byAssignee: Array<{ name: string; count: number; unassigned?: boolean }>;
}

/** The figures on the Tasks cards and panel, worked out from the task list. */
export function summariseTasks(tasks: readonly UnifiedTask[], today: Date = new Date()): TaskSummary {
  const live = tasks.filter((t) => !t.isArchived);
  const open = live.filter(isOpen);
  const overdue = open.filter((t) => t.isOverdue);
  const dueSoon = open.filter((t) => t.isDueSoon && !t.isOverdue);
  const completed = live.filter((t) => statusKey(t) === 'done');
  const notCancelled = live.filter((t) => statusKey(t) !== 'cancelled');

  const overdueDays = overdue.filter((t) => t.dueDate).map((t) => differenceInCalendarDays(today, parseISO(t.dueDate!)));
  const upcoming = open
    .filter((t) => t.dueDate && !t.isOverdue)
    .map((t) => ({ name: t.taskName, inDays: differenceInCalendarDays(parseISO(t.dueDate!), today) }))
    .filter((t) => t.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays);

  const counts = new Map<TaskStatusKey, number>();
  for (const t of live) counts.set(statusKey(t), (counts.get(statusKey(t)) ?? 0) + 1);

  const people = new Map<string, number>();
  let unassigned = 0;
  for (const t of open) {
    if (t.assigneeName) people.set(t.assigneeName, (people.get(t.assigneeName) ?? 0) + 1);
    else unassigned += 1;
  }
  const byAssignee: TaskSummary['byAssignee'] = [...people.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
  if (unassigned > 0) byAssignee.push({ name: 'Unassigned', count: unassigned, unassigned: true });

  return {
    total: live.length,
    open: open.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    completed: completed.length,
    completionPercent: notCancelled.length ? Math.round((completed.length / notCancelled.length) * 100) : 0,
    oldestOverdueDays: overdueDays.length ? Math.max(...overdueDays) : null,
    nextDue: upcoming[0] ?? null,
    byStatus: STATUS_ORDER.map((key) => ({ key, label: STATUS_LABEL[key], count: counts.get(key) ?? 0 })),
    byAssignee,
  };
}
