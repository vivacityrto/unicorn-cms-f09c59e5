import { ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate, safeExternalUrl } from '@/utils/rockPanelFormat';
import {
  sortMilestoneTasks,
  summarizeMilestoneTasks,
  TASK_STATUS_LABEL,
  type MilestoneTaskLink,
} from '@/utils/rockMilestoneTasks';
import type { RockMilestoneStatus } from '@/types/eos';

/** GitHub tasks linked to a milestone by the rock-task-sync webhook. */
export function MilestoneTasks({
  tasks,
  milestoneStatus,
  className,
}: {
  tasks: MilestoneTaskLink[];
  milestoneStatus: RockMilestoneStatus;
  className?: string;
}) {
  if (tasks.length === 0) return null;
  const summary = summarizeMilestoneTasks(tasks, milestoneStatus);
  return (
    <div className={cn('space-y-1.5 rounded-md border bg-muted/30 p-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Tasks · {summary.closed} of {summary.total} closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          {summary.blocked > 0 && (
            <Badge variant="outline" className="border-transparent bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {summary.blocked} blocked
            </Badge>
          )}
          {summary.readyForReview && (
            <Badge variant="outline" className="border-transparent bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Ready for review
            </Badge>
          )}
        </span>
      </div>
      <ul className="space-y-1">
        {sortMilestoneTasks(tasks).map(task => {
          const href = safeExternalUrl(task.external_url);
          const closed = task.task_state === 'closed';
          const due = formatDate(task.due_date, 'd MMM');
          return (
            <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
              <span className="min-w-0 flex-1 basis-48 break-words">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn('rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', closed && 'text-muted-foreground line-through')}
                  >
                    {task.title}
                  </a>
                ) : (
                  <span className={cn(closed && 'text-muted-foreground line-through')}>{task.title}</span>
                )}
              </span>
              <span className="inline-flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <span className={cn(task.task_status === 'blocked' && !closed && 'font-medium text-destructive')}>
                  {TASK_STATUS_LABEL[task.task_status] ?? task.task_status}
                </span>
                {task.assignees.length > 0 && <span>{task.assignees.join(', ')}</span>}
                {due && !closed && <span>Due {due}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {summary.readyForReview && (
        <p className="text-xs text-muted-foreground">
          Every linked task is closed. Review the evidence, then mark this milestone complete in Unicorn.
        </p>
      )}
    </div>
  );
}
