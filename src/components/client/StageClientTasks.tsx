import { useClientTaskInstances } from '@/hooks/useClientTaskInstances';
import { useTaskStatusOptions, getStatusIcon, getStatusColor } from '@/hooks/useTaskStatusOptions';
import { TaskDescriptionButton } from './TaskDescriptionDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StageClientTasksProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
}

export function StageClientTasks({ stageInstanceId, tenantId, packageId }: StageClientTasksProps) {
  const { 
    tasks, 
    loading, 
    updating, 
    updateTaskStatus,
    completedCount,
    totalCount 
  } = useClientTaskInstances({ stageInstanceId, tenantId, packageId });

  const { statuses } = useTaskStatusOptions();

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2].map(i => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No client tasks configured for this stage.
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-1.5 flex items-center justify-end">
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
                </div>
                {/* Status metadata line */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
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
                </div>
              </div>

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
