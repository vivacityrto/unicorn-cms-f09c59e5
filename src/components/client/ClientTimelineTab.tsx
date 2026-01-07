import { useState } from 'react';
import { useClientTimeline, TimelineEvent } from '@/hooks/useClientManagementData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Activity, FileText, Mail, CheckSquare, StickyNote, 
  Package, Layers, Clock, User, Filter, Loader2, RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ClientTimelineTabProps {
  tenantId: number;
  clientId: string;
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  note: StickyNote,
  action_item: CheckSquare,
  document: FileText,
  email: Mail,
  package: Package,
  stage: Layers,
  task: CheckSquare
};

const EVENT_COLORS: Record<string, string> = {
  note_created: 'bg-blue-100 text-blue-700',
  note_updated: 'bg-blue-50 text-blue-600',
  action_item_created: 'bg-purple-100 text-purple-700',
  action_item_completed: 'bg-green-100 text-green-700',
  action_item_updated: 'bg-purple-50 text-purple-600',
  document_released: 'bg-amber-100 text-amber-700',
  email_sent: 'bg-cyan-100 text-cyan-700',
  stage_started: 'bg-indigo-100 text-indigo-700',
  stage_completed: 'bg-green-100 text-green-700',
  package_added: 'bg-orange-100 text-orange-700',
  task_completed: 'bg-green-100 text-green-700',
  risk_flagged: 'bg-red-100 text-red-700'
};

export function ClientTimelineTab({ tenantId, clientId }: ClientTimelineTabProps) {
  const [filter, setFilter] = useState('all');
  const { events, loading, hasMore, refresh, loadMore } = useClientTimeline(tenantId, clientId);

  const getEventIcon = (event: TimelineEvent) => {
    const Icon = EVENT_ICONS[event.entity_type || ''] || Activity;
    return Icon;
  };

  const getEventColor = (eventType: string) => {
    return EVENT_COLORS[eventType] || 'bg-muted text-muted-foreground';
  };

  if (loading && events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Timeline
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[140px] h-8">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="actions">Action Items</SelectItem>
                <SelectItem value="docs">Documents</SelectItem>
                <SelectItem value="emails">Emails</SelectItem>
                <SelectItem value="tasks">Tasks</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={refresh} className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No activity yet</p>
            <p className="text-sm mt-1">Events will appear here as you work with this client</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
              
              <div className="space-y-4">
                {events.map((event, index) => {
                  const Icon = getEventIcon(event);
                  const colorClass = getEventColor(event.event_type);
                  
                  return (
                    <div key={event.id} className="flex gap-4 relative">
                      {/* Icon */}
                      <div className={`relative z-10 flex items-center justify-center h-10 w-10 rounded-full border-2 border-background ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{event.title}</p>
                            {event.body && (
                              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                                {event.body}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {event.event_type.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Meta */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                          </span>
                          {event.creator && (
                            <span className="flex items-center gap-1">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={event.creator.avatar_url || undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {event.creator.first_name?.[0]}{event.creator.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              {event.creator.first_name} {event.creator.last_name}
                            </span>
                          )}
                          {event.source === 'system' && (
                            <Badge variant="secondary" className="text-[10px] h-4">
                              System
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => loadMore(events.length)}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
