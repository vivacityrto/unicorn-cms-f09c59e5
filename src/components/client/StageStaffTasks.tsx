import { useStaffTaskInstances } from '@/hooks/useStaffTaskInstances';
import { useTaskStatusOptions, getStatusIcon, getStatusColor } from '@/hooks/useTaskStatusOptions';
import { TaskDescriptionButton } from './TaskDescriptionDialog';
import { TaskNotesPopover } from './TaskNotesPopover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StageStaffTasksProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
}

export function StageStaffTasks({ stageInstanceId, tenantId, packageId }: StageStaffTasksProps) {
  const { 
    tasks, 
    loading, 
    updating, 
    updateTaskStatus,
    refetch,
    completedCount,
    totalCount 
  } = useStaffTaskInstances({ stageInstanceId, tenantId, packageId });

  const { statuses } = useTaskStatusOptions();

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
        <span className="text-sm font-medium">Staff Tasks</span>
        <Badge variant="outline" className="text-xs">
          {completedCount}/{totalCount} complete
        </Badge>
      </div>
      <div className="divide-y">
        {tasks.map((task) => {
          const StatusIcon = getStatusIcon(task.status_id);
          const statusColor = getStatusColor(task.status_id);
          const isUpdating = updating === task.id;

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
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className={cn(
                    "text-sm truncate",
                    task.status_id === 2 && "line-through text-muted-foreground"
                  )}>
                    {task.task_name}
                  </p>
                  <TaskDescriptionButton taskName={task.task_name} description={task.task_description} />
                  {!task.is_core && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">
                      Non-core
                    </Badge>
                  )}
                </div>
                {/* Status metadata line */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
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

              {task.assignee_id && (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={task.assignee_avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {task.assignee_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                  </AvatarFallback>
                </Avatar>
              )}

              <TaskNotesPopover
                taskId={task.id}
                notes={task.notes}
                tenantId={tenantId}
                packageId={packageId}
                stageInstanceId={stageInstanceId}
                onSaved={refetch}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
