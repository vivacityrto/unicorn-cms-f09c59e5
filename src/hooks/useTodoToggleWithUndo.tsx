import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

interface ToggleableTodo {
  id: string;
  title: string;
  status: string | null;
  completed_at?: string | null;
}

interface TodoUpdate {
  id: string;
  status: 'Open' | 'Complete';
  completed_at: string | null;
  quiet: boolean;
}

/** How long the Undo stays on screen. Long enough to notice a slip, short enough not to linger. */
export const UNDO_VISIBLE_MS = 8000;

/**
 * Marks a To-Do done or not done from the meeting's list, and offers Undo for a few seconds. A row in that
 * list toggles on a single click, so a slip is easy to make; Undo puts back exactly what was there before
 * (status and completion time), not just the opposite status. The change is saved first; Undo is a second,
 * ordinary save, so nothing depends on the toast staying open.
 */
export function useTodoToggleWithUndo(
  updateTodo: { mutateAsync: (update: TodoUpdate) => Promise<unknown> },
  afterChange?: () => void,
) {
  return useCallback(
    async (todo: ToggleableTodo) => {
      const markingDone = todo.status !== 'Complete';
      const before = { status: (todo.status === 'Complete' ? 'Complete' : 'Open') as 'Open' | 'Complete', completed_at: todo.completed_at ?? null };

      await updateTodo.mutateAsync({
        id: todo.id,
        status: markingDone ? 'Complete' : 'Open',
        completed_at: markingDone ? new Date().toISOString() : null,
        quiet: true,
      });
      afterChange?.();

      const shown = toast({
        title: markingDone ? 'Marked done' : 'Marked not done',
        description: todo.title,
        duration: UNDO_VISIBLE_MS,
        action: (
          <ToastAction
            altText={`Undo: ${markingDone ? 'mark as done' : 'mark as not done'} for ${todo.title}`}
            onClick={async () => {
              shown.dismiss();
              try {
                await updateTodo.mutateAsync({ id: todo.id, ...before, quiet: true });
                afterChange?.();
                toast({ title: 'Undone', description: todo.title, duration: 3000 });
              } catch {
                // The update has already reported what went wrong; the To-Do keeps the state it now has.
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    },
    [updateTodo, afterChange],
  );
}
