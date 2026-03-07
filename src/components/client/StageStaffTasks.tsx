import { useState } from 'react';
import { useStaffTaskInstances } from '@/hooks/useStaffTaskInstances';
import { useTaskStatusOptions, getStatusIcon, getStatusColor } from '@/hooks/useTaskStatusOptions';
import { useStageEmails } from '@/hooks/useStageEmails';
import { TaskDescriptionButton } from './TaskDescriptionDialog';
import { TaskNotesPopover } from './TaskNotesPopover';
import { StaffTaskActionMenu } from './StaffTaskActionMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Calendar, CheckCircle2, StickyNote, Repeat, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { parseTaskType, getTaskTypeBadgeLabel, getTaskTypeBadgeClasses } from '@/utils/staffTaskType';

type TaskFilter = 'active' | 'incomplete' | 'incomplete_core' | 'all';

interface StageStaffTasksProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
  packageInstanceId?: number;
  stageStatusId?: number;
  stageName?: string;
}

export function StageStaffTasks({ stageInstanceId, tenantId, packageId, packageInstanceId, stageStatusId, stageName }: StageStaffTasksProps) {
  const [filter, setFilter] = useState<TaskFilter>('active');
  const { 
    tasks, 
    loading, 
    updating, 
    updateTaskStatus,
    updateTaskCore,
    refetch,
    completedCount,
    totalCount 
  } = useStaffTaskInstances({ stageInstanceId, tenantId, packageId });

  const { statuses } = useTaskStatusOptions();
  const { emails: stageEmails } = useStageEmails({ stageInstanceId });

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return task.status_id !== 3; // exclude N/A
    if (filter === 'incomplete') return task.status_id !== 3 && task.status_id !== 2 && task.status_id !== 4; // exclude N/A, Completed, Core Complete
    if (filter === 'incomplete_core') return task.status_id !== 3 && task.status_id !== 2 && task.status_id !== 4 && task.is_core; // incomplete core tasks only
    return true; // 'all'
  });

  if (loading) {
    return (
      <div className="space-y-2 p-4 border-t bg-muted/30">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-4 border-t bg-muted/30 text-center text-muted-foreground text-sm">
        No staff tasks configured for this stage.
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/30">
      <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Staff Tasks</span>
          <Select value={filter} onValueChange={(v) => setFilter(v as TaskFilter)}>
            <SelectTrigger className="w-[150px] h-7 text-xs px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="incomplete_core">Incomplete Core</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="text-xs">
          {completedCount}/{totalCount} complete
        </Badge>
      </div>
      <div className="divide-y">
        {filteredTasks.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No tasks match the current filter.
          </div>
        ) : filteredTasks.map((task) => {
          const StatusIcon = getStatusIcon(task.status_id);
          const statusColor = getStatusColor(task.status_id);
          const isUpdating = updating === task.id;
          const { type: taskType, cleanName } = parseTaskType(task.task_name);
          const typeBadgeLabel = getTaskTypeBadgeLabel(taskType);
          const typeBadgeClasses = getTaskTypeBadgeClasses(taskType);

          return (
            <div 
              key={task.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5",
                task.status_id === 2 && "bg-accent/50",
                task.status_id === 3 && "opacity-60"
              )}
            >
              <StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />
              
              {typeBadgeLabel && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0 font-semibold", typeBadgeClasses)}>
                  {typeBadgeLabel}
                </Badge>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className={cn(
                    "text-sm truncate",
                    task.status_id === 2 && "line-through text-muted-foreground"
                  )}>
                    {cleanName}
                  </p>
                  <TaskDescriptionButton taskName={cleanName} description={task.task_description} />
                  {task.notes && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <StickyNote className="h-3 w-3 text-primary shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Has notes</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {/* Status metadata line */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 font-normal",
                      task.is_recurring 
                        ? "border-violet-200 bg-violet-50 text-violet-700" 
                        : "border-sky-200 bg-sky-50 text-sky-700"
                    )}
                  >
                    {task.is_recurring ? (
                      <><Repeat className="h-2.5 w-2.5 mr-0.5" />Recurring</>
                    ) : (
                      <><CircleDot className="h-2.5 w-2.5 mr-0.5" />Once-off</>
                    )}
                  </Badge>
                  {task.status_id === 2 && task.completion_date && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed {format(new Date(task.completion_date), 'dd MMM yyyy')}
                    </span>
                  )}
                  {task.due_date && task.status_id !== 2 && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Due {format(new Date(task.due_date), 'dd MMM yyyy')}
                    </span>
                  )}
                  {task.updated_at && task.assignee_name && (
                    <span>
                      Updated {format(new Date(task.updated_at), 'dd MMM yyyy')} by {task.assignee_name}
                    </span>
                  )}
                  {task.updated_at && !task.assignee_name && (
                    <span>
                      Updated {format(new Date(task.updated_at), 'dd MMM yyyy')}
                    </span>
                  )}
                </div>
              </div>


              <TaskNotesPopover
                taskId={task.id}
                notes={task.notes}
                tenantId={tenantId}
                packageId={packageId}
                packageInstanceId={packageInstanceId}
                stageInstanceId={stageInstanceId}
                stageName={stageName}
                taskName={cleanName}
                onSaved={refetch}
              />

              <StaffTaskActionMenu
                taskName={task.task_name}
                taskId={task.id}
                tenantId={tenantId}
                packageId={packageId}
                stageInstanceId={stageInstanceId}
                statusId={task.status_id}
                stageStatusId={stageStatusId}
                stageEmails={stageEmails}
                onMarkComplete={() => updateTaskStatus(task.id, 2)}
              />

              <Select
                value={task.status_id.toString()}
                onValueChange={(value) => updateTaskStatus(task.id, parseInt(value))}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((option) => {
                    const Icon = getStatusIcon(option.code);
                    const color = getStatusColor(option.code);
                    return (
                      <SelectItem key={option.code} value={option.code.toString()}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-3 w-3", color)} />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Core Task Radio - right of status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div onClick={() => updateTaskCore(task.id, !task.is_core)} className="cursor-pointer">
                    <RadioGroup value={task.is_core ? 'core' : 'not-core'}>
                      <RadioGroupItem value="core" className="h-4 w-4 shrink-0" />
                    </RadioGroup>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Core Task
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
