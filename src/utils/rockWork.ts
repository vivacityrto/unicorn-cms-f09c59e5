import type { UiRockStatus } from '@/utils/rockStatusUtils';
import { summarizeTodos, type RockTodo, type TodoSummary } from '@/utils/rockTodos';

/**
 * A Rock's work as one figure, and where it disagrees with the status someone set.
 *
 * The status stays a person's call: nothing here changes it, and nothing completes a Rock.
 * These helpers only count and compare, so every line shown in the panel can be tested.
 */

export interface RockWorkSummary extends TodoSummary {
  /** Done share of the counted To-Dos, 0 to 100; null when there are none. */
  percent: number | null;
}

/**
 * Every To-Do linked to the Rock, the ones for the Rock as a whole and the ones for its
 * milestones, counted once each. Cancelled To-Dos are left out, as everywhere else.
 */
export function rockWorkSummary(todos: readonly RockTodo[], todayIso: string): RockWorkSummary {
  const summary = summarizeTodos(todos, todayIso);
  return { ...summary, percent: summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : null };
}

export type RockSignalId = 'complete_with_open_todos' | 'on_track_with_overdue_todos' | 'all_todos_done';

export interface RockStatusSignal {
  id: RockSignalId;
  /** `warn`: the status looks wrong against the evidence. `info`: the evidence may mean the Rock is finished. */
  tone: 'warn' | 'info';
  text: string;
  /** What the panel may offer beside the line, using the control the Rock already has. */
  action?: 'mark_complete';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where the declared status and the linked To-Dos disagree. Deliberately narrow, so a line only
 * appears when it is worth a person's attention:
 *
 * - Complete, but linked To-Dos are still open.
 * - On Track, but linked To-Dos are overdue. (At Risk, Off Track and Blocked already say so.)
 * - No milestones, every linked To-Do done, and the Rock is not Complete: the To-Dos may be the
 *   whole plan, so ask. A Blocked Rock is left alone; its blocker is the story.
 *
 * Not flagged on purpose: a Complete Rock with no milestones or To-Dos at all. Many older Rocks
 * were closed that way, so it would only add noise. Milestone progress against status has its own
 * banner in the Rock panel and is not repeated here.
 */
export function rockStatusSignals(input: { status: UiRockStatus; hasMilestones: boolean; todos: TodoSummary }): RockStatusSignal[] {
  const { status, hasMilestones, todos } = input;
  const signals: RockStatusSignal[] = [];

  if (status === 'complete' && todos.open > 0) {
    const overdue = todos.overdue > 0 ? `, ${todos.overdue} overdue` : '';
    signals.push({
      id: 'complete_with_open_todos',
      tone: 'warn',
      text: `This Rock is marked Complete, but ${plural(todos.open, 'linked To-Do is', 'linked To-Dos are')} still open${overdue}.`,
    });
  }

  if (status === 'on_track' && todos.overdue > 0) {
    signals.push({
      id: 'on_track_with_overdue_todos',
      tone: 'warn',
      text: `This Rock is marked On Track, but ${plural(todos.overdue, 'linked To-Do is', 'linked To-Dos are')} overdue.`,
    });
  }

  if (!hasMilestones && status !== 'complete' && status !== 'blocked' && todos.total > 0 && todos.open === 0) {
    signals.push({
      id: 'all_todos_done',
      tone: 'info',
      text: `${todos.total === 1 ? 'The linked To-Do is' : `All ${todos.total} linked To-Dos are`} done. If the work is finished, mark the Rock Complete.`,
      action: 'mark_complete',
    });
  }

  return signals;
}
