import type { RockMilestoneStatus } from '@/types/eos';

/** A GitHub task linked to a milestone (a snapshot; the rock-task-sync webhook that updated it was retired 2026-10-28). */
export interface MilestoneTaskLink {
  id: string;
  milestone_id: string;
  external_key: string;
  external_url: string;
  title: string;
  task_state: string;
  task_status: string;
  priority: string | null;
  due_date: string | null;
  assignees: string[];
  last_synced_at: string;
}

export interface MilestoneTaskSummary {
  total: number;
  closed: number;
  open: number;
  blocked: number;
  /** Every linked task is closed, so a person can review the milestone and mark it complete. */
  readyForReview: boolean;
}

const isClosed = (task: MilestoneTaskLink) => task.task_state === 'closed';

/**
 * Ready for review is derived, never stored: all linked tasks are closed and the
 * milestone is not already complete or deferred. The sync never completes a
 * milestone; that stays a human decision in Unicorn.
 */
export function summarizeMilestoneTasks(
  tasks: readonly MilestoneTaskLink[],
  milestoneStatus: RockMilestoneStatus,
): MilestoneTaskSummary {
  const closed = tasks.filter(isClosed).length;
  const open = tasks.length - closed;
  const blocked = tasks.filter(t => !isClosed(t) && t.task_status === 'blocked').length;
  return {
    total: tasks.length,
    closed,
    open,
    blocked,
    readyForReview: tasks.length > 0 && open === 0 && milestoneStatus !== 'complete' && milestoneStatus !== 'deferred',
  };
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  'in progress': 'In progress',
  blocked: 'Blocked',
  review: 'In review',
  completed: 'Closed',
};

/** Open tasks first (blocked at the top), then closed; stable by title within a group. */
export function sortMilestoneTasks(tasks: readonly MilestoneTaskLink[]): MilestoneTaskLink[] {
  const rank = (task: MilestoneTaskLink) =>
    isClosed(task) ? 2 : task.task_status === 'blocked' ? 0 : 1;
  return [...tasks].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}
