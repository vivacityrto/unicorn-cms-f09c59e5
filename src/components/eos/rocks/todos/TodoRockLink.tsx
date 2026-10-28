import { useState } from 'react';
import { Link2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLinkTodoToRock, useLinkableRocks, useUnlinkTodo } from '@/hooks/useRockTodos';
import { useRockMilestones } from '@/hooks/useRockDiscussion';
import { todoTargetLabel, type TodoRockLinkInfo } from '@/utils/rockTodos';

const WHOLE_ROCK = '__rock';

interface TodoRockLinkProps {
  todoId: string;
  /** What the To-Do is linked to now, or undefined for a standalone To-Do. */
  link: TodoRockLinkInfo | undefined;
  /** Staff may link, move and unlink. Others see the Rock but cannot change it. */
  canManage: boolean;
}

/**
 * The To-Do's side of the link: which Rock (and milestone) it is for, with a small popover to point
 * it at one, move it, or make it standalone again. Unlinking never changes the To-Do.
 */
export function TodoRockLink({ todoId, link, canManage }: TodoRockLinkProps) {
  const [open, setOpen] = useState(false);
  const [rockId, setRockId] = useState<string>(link?.rockId ?? '');
  const [milestoneId, setMilestoneId] = useState<string>(link?.milestoneId ?? WHOLE_ROCK);
  const rocks = useLinkableRocks(open);
  const milestones = useRockMilestones(rockId || undefined, open && !!rockId);
  const save = useLinkTodoToRock();
  const unlink = useUnlinkTodo();

  const chip = link ? (
    <span
      className="inline-flex max-w-[18rem] items-center gap-1 truncate rounded bg-primary/10 px-1.5 py-0.5 align-bottom text-[10px] font-medium text-primary"
      title={`For the Rock: ${todoTargetLabel(link)}`}
    >
      <Target className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{todoTargetLabel(link)}</span>
    </span>
  ) : null;

  if (!canManage) return chip;

  const choose = (value: string) => {
    setRockId(value);
    setMilestoneId(WHOLE_ROCK);
  };

  return (
    // Rows of the To-Do list toggle when clicked; the link controls must not.
    <span className="ml-2 inline-flex items-center gap-1 align-bottom" onClick={event => event.stopPropagation()}>
      {chip}
      <Popover
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (next) {
            setRockId(link?.rockId ?? '');
            setMilestoneId(link?.milestoneId ?? WHOLE_ROCK);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={link ? 'Change the Rock this To-Do is for' : 'Link this To-Do to a Rock'}
            className="inline-flex items-center gap-0.5 rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Link2 className="h-3 w-3" aria-hidden />
            {link ? 'Change' : 'Link to a Rock'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2 p-3" align="start">
          <p className="text-xs font-semibold">{link ? 'This To-Do is for' : 'Link this To-Do to a Rock'}</p>
          <Select value={rockId} onValueChange={choose}>
            <SelectTrigger className="h-8 text-xs" aria-label="Rock">
              <SelectValue placeholder={rocks.isLoading ? 'Loading Rocks…' : 'Choose a Rock'} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {(rocks.data ?? []).map(rock => (
                <SelectItem key={rock.id} value={rock.id} className="text-xs">
                  {`Q${rock.quarter_number} ${rock.quarter_year} · ${rock.title}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rockId && (
            <Select value={milestoneId} onValueChange={setMilestoneId}>
              <SelectTrigger className="h-8 text-xs" aria-label="Milestone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={WHOLE_ROCK} className="text-xs">The whole Rock</SelectItem>
                {(milestones.data ?? []).map(milestone => (
                  <SelectItem key={milestone.id} value={milestone.id} className="text-xs">{milestone.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center justify-between gap-2">
            {link ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={unlink.isPending}
                onClick={async () => {
                  try {
                    await unlink.mutateAsync(todoId);
                    setOpen(false);
                  } catch {
                    // Already reported by the mutation.
                  }
                }}
              >
                Make it standalone
              </Button>
            ) : <span />}
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={!rockId || save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({ todoId, rockId, milestoneId: milestoneId === WHOLE_ROCK ? null : milestoneId });
                  setOpen(false);
                } catch {
                  // Already reported by the mutation.
                }
              }}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
