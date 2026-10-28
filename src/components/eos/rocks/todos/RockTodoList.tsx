import { useState } from 'react';
import { ListChecks, Link2, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useOptionalRockNotesDictation } from '@/components/eos/rocks/notes/RockNotesDictation';
import {
  defaultTodoDueDate,
  useAddRockTodo,
  useLinkTodoToRock,
  useLinkableTodos,
  useSetTodoDone,
  useUnlinkTodo,
} from '@/hooks/useRockTodos';
import { formatDate } from '@/utils/rockPanelFormat';
import { todayLocalIso } from '@/utils/localDate';
import { isOverdueTodo, isTodoCancelled, isTodoDone, sortTodos, summarizeTodos, type RockTodo } from '@/utils/rockTodos';

interface RockTodoListProps {
  rock: { id: string; title: string };
  /** When set, this list is for one milestone; otherwise it is the Rock's own To-Dos. */
  milestone?: { id: string; title: string } | null;
  todos: readonly RockTodo[];
  /** Staff who can change the Rock may add, link, unlink and tick off. Others only read. */
  canManage: boolean;
  className?: string;
}

/**
 * To-Dos for a Rock or a milestone. They are the app's own To-Dos, so owner, due date and done
 * are live; ticking one here ticks it everywhere (the meeting's To-Do list included).
 */
export function RockTodoList({ rock, milestone = null, todos, canManage, className }: RockTodoListProps) {
  const meetingId = useOptionalRockNotesDictation()?.meetingId;
  const add = useAddRockTodo();
  const link = useLinkTodoToRock();
  const unlink = useUnlinkTodo();
  const setDone = useSetTodoDone();
  const [mode, setMode] = useState<'idle' | 'add' | 'link'>('idle');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(defaultTodoDueDate());
  const linkable = useLinkableTodos(mode === 'link');

  const today = todayLocalIso();
  const summary = summarizeTodos(todos, today);
  const scope = milestone ? 'this milestone' : 'this Rock';
  if (todos.length === 0 && !canManage) return null;

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await add.mutateAsync({ rockId: rock.id, milestoneId: milestone?.id, title: title.trim(), dueDate: due || undefined, meetingId });
      setTitle('');
      setDue(defaultTodoDueDate());
      setMode('idle');
    } catch {
      // The mutation has already said what went wrong; the text stays so nothing is lost.
    }
  };

  return (
    <div className={cn('space-y-1.5 rounded-md border bg-muted/30 p-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          {milestone ? 'To-Dos' : 'To-Dos for this Rock'}{summary.total > 0 && ` · ${summary.done} of ${summary.total} done`}
        </span>
        {summary.overdue > 0 && (
          <Badge variant="outline" className="border-transparent bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {summary.overdue} overdue
          </Badge>
        )}
      </div>

      {todos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No To-Dos for {scope} yet.</p>
      ) : (
        <ul className="space-y-1">
          {sortTodos(todos, today).map(todo => {
            const done = isTodoDone(todo);
            const cancelled = isTodoCancelled(todo);
            const overdue = isOverdueTodo(todo, today);
            const dueLabel = formatDate(todo.dueDate, 'd MMM');
            return (
              <li key={todo.todoId} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-xs">
                <Checkbox
                  className="mt-0.5"
                  checked={done}
                  disabled={!canManage || cancelled || setDone.isPending}
                  aria-label={`${done ? 'Mark as not done' : 'Mark as done'}: ${todo.title}`}
                  onCheckedChange={checked => setDone.mutate({ todoId: todo.todoId, done: checked === true })}
                />
                <span className={cn('min-w-[9rem] flex-1 basis-40 break-words', (done || cancelled) && 'text-muted-foreground line-through')}>{todo.title}</span>
                <span className="inline-flex flex-wrap items-center gap-x-2 text-muted-foreground max-[420px]:order-last max-[420px]:basis-full max-[420px]:pl-6">
                  <span>{todo.ownerName ?? 'Unassigned'}</span>
                  {dueLabel && !done && <span className={cn(overdue && 'font-medium text-destructive')}>{overdue ? 'Overdue · ' : 'Due '}{dueLabel}</span>}
                  {cancelled && <span>Cancelled</span>}
                </span>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Remove the link to ${scope}: ${todo.title}`}
                    title="Remove the link (the To-Do itself stays)"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(todo.todoId)}
                    className="shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && mode === 'idle' && (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setMode('add')}>
            <Plus className="h-3 w-3" aria-hidden />Add a To-Do
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setMode('link')}>
            <Link2 className="h-3 w-3" aria-hidden />Link an existing To-Do
          </Button>
        </div>
      )}

      {canManage && mode === 'add' && (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={title}
            maxLength={300}
            aria-label={`New To-Do for ${scope}`}
            placeholder="What needs doing?"
            className="h-8 min-w-[10rem] flex-1 text-xs"
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setMode('idle');
              }
            }}
          />
          <Input type="date" value={due} aria-label="Due date" className="h-8 w-36 text-xs" onChange={event => setDue(event.target.value)} />
          <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={!title.trim() || add.isPending}>Add</Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setMode('idle')}>Cancel</Button>
          <p className="basis-full text-[11px] text-muted-foreground">Owned by you{meetingId ? ' and added to this meeting' : ''}.</p>
        </form>
      )}

      {canManage && mode === 'link' && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Open To-Dos that are not linked to a Rock yet</p>
          {linkable.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (linkable.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">There are none. Add a new To-Do instead.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {(linkable.data ?? []).map(todo => (
                <li key={todo.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1 text-xs">
                  <span className="min-w-0 break-words">{todo.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    disabled={link.isPending}
                    onClick={async () => {
                      try {
                        await link.mutateAsync({ todoId: todo.id, rockId: rock.id, milestoneId: milestone?.id });
                      } catch {
                        // Already reported by the mutation.
                      }
                    }}
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMode('idle')}>Done</Button>
        </div>
      )}
    </div>
  );
}
