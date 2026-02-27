import { useStaffTaskInstances, STATUS_OPTIONS } from '@/hooks/useStaffTaskInstances';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  Ban,
  Loader2,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StageStaffTasksProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
}

const STATUS_ICONS = {
  0: Circle,
  1: Clock,
  2: CheckCircle2,
  3: Ban,
} as const;

const STATUS_COLORS = {
  0: 'text-muted-foreground',
  1: 'text-blue-600',
  2: 'text-green-600',
  3: 'text-muted-foreground',
} as const;

export function StageStaffTasks({ stageInstanceId, tenantId, packageId }: StageStaffTasksProps) {
  const { 
    tasks, 
    loading, 
    updating, 
    updateTaskStatus,
    completedCount,
    totalCount 
  } = useStaffTaskInstances({ stageInstanceId, tenantId, packageId });

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
          const StatusIcon = STATUS_ICONS[task.status_id as keyof typeof STATUS_ICONS] || Circle;
          const statusColor = STATUS_COLORS[task.status_id as keyof typeof STATUS_COLORS] || 'text-muted-foreground';
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
                <p className={cn(
                  "text-sm truncate",
                  task.status_id === 2 && "line-through text-muted-foreground"
                )}>
                  {task.task_name}
                </p>
                {task.due_date && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(task.due_date), 'dd MMM yyyy')}</span>
                  </div>
                )}
              </div>

              {task.assignee_id && (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={task.assignee_avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {task.assignee_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                  </AvatarFallback>
                </Avatar>
              )}

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
                  {STATUS_OPTIONS.map((option) => {
                    const Icon = STATUS_ICONS[option.value as keyof typeof STATUS_ICONS] || Circle;
                    const color = STATUS_COLORS[option.value as keyof typeof STATUS_COLORS] || 'text-muted-foreground';
                    return (
                      <SelectItem key={option.value} value={option.value.toString()}>
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
