import { useState } from 'react';
import { MessageSquare, ListTodo, AlertTriangle, Clock, Bell, User, FileText, Filter } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MembershipActivity, MembershipTask } from '@/types/membership';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface MembershipActivityFeedProps {
  activities: MembershipActivity[];
  tasks: MembershipTask[];
  currentUserId: string | undefined;
  onCreateTask: () => void;
  onDraftEmail: () => void;
  onLogFollowUp: () => void;
}

export function MembershipActivityFeed({
  activities,
  tasks,
  currentUserId,
  onCreateTask,
  onDraftEmail,
  onLogFollowUp,
}: MembershipActivityFeedProps) {
  const [filter, setFilter] = useState<'all' | 'my' | 'mentions' | 'alerts'>('all');

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'consult_logged':
        return <Clock className="h-3.5 w-3.5 text-blue-500" />;
      case 'note_added':
        return <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />;
      case 'task_created':
      case 'task_completed':
        return <ListTodo className="h-3.5 w-3.5 text-purple-500" />;
      case 'system_alert':
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const filteredActivities = activities.filter(a => {
    if (filter === 'my') return a.user_id === currentUserId;
    if (filter === 'alerts') return a.activity_type === 'system_alert';
    // 'mentions' would need actual mention detection in content
    return true;
  });

  const overdueTasks = tasks.filter(t => 
    t.status === 'pending' && 
    t.due_date && 
    new Date(t.due_date) < new Date()
  );

  return (
    <div className="flex flex-col h-full bg-card border rounded-lg">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-foreground">Activity Feed</h3>
          <Badge variant="outline" className="text-xs">
            {activities.length} items
          </Badge>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {(['all', 'my', 'mentions', 'alerts'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'secondary' : 'ghost'}
              className="h-7 text-xs capitalize"
              onClick={() => setFilter(f)}
            >
              {f === 'my' ? 'My CSC' : f}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="activity" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-2">
          <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">
            Tasks
            {overdueTasks.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">
                {overdueTasks.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="flex-1 m-0">
          <ScrollArea className="h-[400px]">
            <div className="p-3 space-y-2">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No activity to display
                </div>
              ) : (
                filteredActivities.map((activity) => (
                  <div 
                    key={activity.id} 
                    className="flex gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="mt-0.5">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {activity.title}
                      </p>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 m-0">
          <ScrollArea className="h-[400px]">
            <div className="p-3 space-y-2">
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No pending tasks
                </div>
              ) : (
                tasks.map((task) => {
                  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                  return (
                    <div 
                      key={task.id}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        isOverdue ? 'bg-red-50 border-red-200' : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {task.title}
                          </p>
                          {task.due_date && (
                            <p className={cn(
                              'text-xs mt-0.5',
                              isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'
                            )}>
                              Due: {new Date(task.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            'text-[10px]',
                            task.priority === 'urgent' ? 'border-red-500 text-red-600' :
                            task.priority === 'high' ? 'border-amber-500 text-amber-600' :
                            'border-muted'
                          )}
                        >
                          {task.priority}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Quick Actions Footer */}
      <div className="p-3 border-t space-y-2">
        <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={onCreateTask}>
          <ListTodo className="h-4 w-4" />
          Create Task
        </Button>
        <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={onDraftEmail}>
          <FileText className="h-4 w-4" />
          Draft Email (no send)
        </Button>
        <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={onLogFollowUp}>
          <Clock className="h-4 w-4" />
          Log Follow-up
        </Button>
      </div>
    </div>
  );
}
