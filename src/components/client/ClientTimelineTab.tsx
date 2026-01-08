import { useState } from 'react';
import { useClientTimeline, TimelineEvent } from '@/hooks/useClientManagementData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Activity, FileText, Mail, CheckSquare, StickyNote, 
  Clock, Loader2, RefreshCw, Calendar, Timer, Search,
  Plus, X, ChevronDown, ChevronUp, FileDown
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface ClientTimelineTabProps {
  tenantId: number;
  clientId: string;
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  meeting_synced: Calendar,
  time_posted: Timer,
  time_ignored: Timer,
  email_sent: Mail,
  document_uploaded: FileText,
  document_downloaded: FileDown,
  task_completed_team: CheckSquare,
  task_completed_client: CheckSquare,
  note_added: StickyNote
};

const EVENT_COLORS: Record<string, string> = {
  meeting_synced: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  time_posted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  time_ignored: 'bg-muted text-muted-foreground',
  email_sent: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  document_uploaded: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  document_downloaded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  task_completed_team: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  task_completed_client: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  note_added: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All', icon: Activity },
  { value: 'meetings', label: 'Meetings', icon: Calendar },
  { value: 'time', label: 'Time', icon: Timer },
  { value: 'tasks', label: 'Tasks', icon: CheckSquare },
  { value: 'emails', label: 'Emails', icon: Mail },
  { value: 'docs', label: 'Documents', icon: FileText },
  { value: 'notes', label: 'Notes', icon: StickyNote }
];

export function ClientTimelineTab({ tenantId, clientId }: ClientTimelineTabProps) {
  const { 
    events, 
    loading, 
    hasMore, 
    filter, 
    setFilter, 
    search, 
    setSearch, 
    refresh, 
    loadMore,
    addQuickNote 
  } = useClientTimeline(tenantId, clientId);
  
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    
    setAddingNote(true);
    const success = await addQuickNote(noteTitle.trim() || 'Quick note', noteContent.trim());
    if (success) {
      setNoteTitle('');
      setNoteContent('');
      setShowAddNote(false);
    }
    setAddingNote(false);
  };

  const toggleExpand = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const getEventIcon = (eventType: string) => {
    return EVENT_ICONS[eventType] || Activity;
  };

  const getEventColor = (eventType: string) => {
    return EVENT_COLORS[eventType] || 'bg-muted text-muted-foreground';
  };

  const formatEventLabel = (eventType: string) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
            <Button
              variant={showAddNote ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowAddNote(!showAddNote)}
            >
              {showAddNote ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              {showAddNote ? 'Cancel' : 'Add Note'}
            </Button>
            <Button variant="ghost" size="icon" onClick={refresh} className="h-8 w-8">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Quick Add Note */}
        {showAddNote && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/30 space-y-3">
            <Input
              placeholder="Note title (optional)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
            />
            <Textarea
              placeholder="Write your note..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button 
                size="sm" 
                onClick={handleAddNote}
                disabled={!noteContent.trim() || addingNote}
              >
                {addingNote && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Note
              </Button>
            </div>
          </div>
        )}
        
        {/* Filters */}
        <div className="mt-4 space-y-3">
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map(option => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  variant={filter === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(option.value)}
                  className="h-7 text-xs"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {option.label}
                </Button>
              );
            })}
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search timeline..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
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
          <ScrollArea className="h-[600px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
              
              <div className="space-y-4">
                {events.map((event) => {
                  const Icon = getEventIcon(event.event_type);
                  const colorClass = getEventColor(event.event_type);
                  const isExpanded = expandedEvents.has(event.id);
                  const hasDetails = event.body || Object.keys(event.metadata || {}).length > 0;
                  const occurredAt = event.occurred_at || event.created_at;
                  
                  return (
                    <div key={event.id} className="flex gap-4 relative">
                      {/* Icon */}
                      <div className={`relative z-10 flex items-center justify-center h-10 w-10 rounded-full border-2 border-background ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm">{event.title}</p>
                            {event.body && !isExpanded && (
                              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                                {event.body}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {formatEventLabel(event.event_type)}
                            </Badge>
                            {hasDetails && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleExpand(event.id)}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="mt-2 p-3 rounded-md bg-muted/50 space-y-2">
                            {event.body && (
                              <p className="text-sm whitespace-pre-wrap">{event.body}</p>
                            )}
                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                              <div className="text-xs space-y-1">
                                {Object.entries(event.metadata).map(([key, value]) => {
                                  if (value === null || value === undefined) return null;
                                  return (
                                    <div key={key} className="flex gap-2">
                                      <span className="text-muted-foreground capitalize">
                                        {key.replace(/_/g, ' ')}:
                                      </span>
                                      <span className="font-medium">
                                        {typeof value === 'object' 
                                          ? JSON.stringify(value)
                                          : String(value)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Meta */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1" title={format(new Date(occurredAt), 'PPpp')}>
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(occurredAt), { addSuffix: true })}
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