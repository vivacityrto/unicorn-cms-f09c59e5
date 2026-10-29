import { useMemo, useState } from 'react';
import { History, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TodoIssueTag } from '@/components/eos/TodoIssueTag';
import { TodoRockLink } from '@/components/eos/rocks/todos/TodoRockLink';
import { usePastTodos, type PastTodo } from '@/hooks/useMeetingTodos';
import { useTodoRockLinks } from '@/hooks/useRockTodos';
import { formatNoteDay } from '@/utils/rockNotes';

interface PastTodosPanelProps {
  meetingId: string | undefined;
  tenantId: number | undefined;
  /** Puts a past To-Do back to Open, so it joins the list to review. */
  onReopen: (todo: PastTodo) => Promise<void>;
  busy?: boolean;
}

/** Cancelled and completed To-Dos from earlier, read-only apart from an explicit Reopen. */
export function PastTodosPanel({ meetingId, tenantId, onReopen, busy = false }: PastTodosPanelProps) {
  const past = usePastTodos(meetingId, tenantId, true);
  const [query, setQuery] = useState('');
  const todos = past.data ?? [];
  const rockLinks = useTodoRockLinks(todos.map(t => t.id), todos.length > 0);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? todos.filter(t => t.title.toLowerCase().includes(needle) || (t.ownerName ?? '').toLowerCase().includes(needle)) : todos;
  }, [todos, query]);

  return (
    <section aria-label="Past To-Dos" className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4" aria-hidden />
          Past To-Dos{!past.isLoading && ` (${todos.length})`}
        </h4>
        {todos.length > 5 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search past To-Dos" placeholder="Search" className="h-8 w-44 pl-7 text-xs" />
          </div>
        )}
      </div>

      {past.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : past.isError ? (
        <p role="alert" className="text-xs text-destructive">Past To-Dos could not be loaded.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">{todos.length === 0 ? 'No completed or cancelled To-Dos from earlier meetings.' : 'Nothing matches that search.'}</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map(todo => {
            const cancelled = (todo.status ?? '').toLowerCase() === 'cancelled';
            const when = todo.closedAt ? formatNoteDay(todo.closedAt) : null;
            return (
              <li key={todo.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="break-words text-sm text-muted-foreground line-through">{todo.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {cancelled ? 'Cancelled' : 'Completed'}{when && ` ${when}`} · {todo.ownerName ?? 'Unassigned'}
                    <TodoIssueTag issueTitle={todo.issueTitle} />
                    <TodoRockLink todoId={todo.id} link={rockLinks.data?.[todo.id]} canManage />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{cancelled ? 'Cancelled' : 'Done'}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={busy}
                    aria-label={`Reopen: ${todo.title}`}
                    onClick={() => void onReopen(todo)}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden />Reopen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
