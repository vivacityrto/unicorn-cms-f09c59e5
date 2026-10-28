/**
 * To-Dos linked to a Rock or to one of its milestones. A To-Do is the app's own task (owner, due
 * date, open or complete), so unlike a linked GitHub issue its state is live. These helpers only
 * arrange and count; nothing here writes anything.
 */

export interface RockTodo {
  todoId: string;
  linkId: string;
  rockId: string;
  /** Null when the To-Do is for the Rock as a whole. */
  milestoneId: string | null;
  title: string;
  status: string | null;
  dueDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
}

export interface TodoRockLinkInfo {
  rockId: string;
  rockTitle: string;
  milestoneId: string | null;
  milestoneTitle: string | null;
}

const normal = (status: string | null | undefined) => (status ?? 'open').toLowerCase();
export const isTodoDone = (todo: Pick<RockTodo, 'status'>) => normal(todo.status) === 'complete';
/** A cancelled To-Do is neither outstanding nor done, so it is left out of every count. */
export const isTodoCancelled = (todo: Pick<RockTodo, 'status'>) => normal(todo.status) === 'cancelled';
export const isTodoOpen = (todo: Pick<RockTodo, 'status'>) => !isTodoDone(todo) && !isTodoCancelled(todo);

export function isOverdueTodo(todo: Pick<RockTodo, 'status' | 'dueDate'>, todayIso: string): boolean {
  return isTodoOpen(todo) && !!todo.dueDate && todo.dueDate.slice(0, 10) < todayIso;
}

export interface TodoSummary {
  total: number;
  done: number;
  open: number;
  overdue: number;
}

export function summarizeTodos(todos: readonly RockTodo[], todayIso: string): TodoSummary {
  const counted = todos.filter(t => !isTodoCancelled(t));
  return {
    total: counted.length,
    done: counted.filter(isTodoDone).length,
    open: counted.filter(isTodoOpen).length,
    overdue: counted.filter(t => isOverdueTodo(t, todayIso)).length,
  };
}

/** Overdue first, then open by due date (undated last), then done, then cancelled; stable by title. */
export function sortTodos(todos: readonly RockTodo[], todayIso: string): RockTodo[] {
  const rank = (t: RockTodo) => (isTodoCancelled(t) ? 3 : isTodoDone(t) ? 2 : isOverdueTodo(t, todayIso) ? 0 : 1);
  return [...todos].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      a.title.localeCompare(b.title),
  );
}

/** "Rock title" or "Rock title · Milestone title", for a To-Do's link. */
export function todoTargetLabel(info: Pick<TodoRockLinkInfo, 'rockTitle' | 'milestoneTitle'>): string {
  return info.milestoneTitle ? `${info.rockTitle} · ${info.milestoneTitle}` : info.rockTitle;
}

/** Groups To-Dos by milestone id; Rock-level To-Dos (no milestone) come back separately. */
export function splitTodosByMilestone(todos: readonly RockTodo[]): { byMilestone: Map<string, RockTodo[]>; rockLevel: RockTodo[] } {
  const byMilestone = new Map<string, RockTodo[]>();
  const rockLevel: RockTodo[] = [];
  for (const todo of todos) {
    if (!todo.milestoneId) {
      rockLevel.push(todo);
      continue;
    }
    byMilestone.set(todo.milestoneId, [...(byMilestone.get(todo.milestoneId) ?? []), todo]);
  }
  return { byMilestone, rockLevel };
}
