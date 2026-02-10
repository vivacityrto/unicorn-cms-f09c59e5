import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientTimeline, TimelineEvent, PinnedNote } from '@/hooks/useClientManagementData';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TimelineEventCard, TimelineEventCardSkeleton } from './TimelineEventCard';
import {
  Activity, FileText, Mail, CheckSquare, StickyNote,
  Clock, Loader2, RefreshCw, Calendar, Timer, Search,
  Plus, X, ChevronDown, ChevronUp, Pin, PinOff, Link2,
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';

// =============================================
// Filter chips
// =============================================

const FILTER_OPTIONS = [
  { value: 'all', label: 'All', icon: Activity },
  { value: 'meetings', label: 'Meetings', icon: Calendar },
  { value: 'emails', label: 'Emails', icon: Mail },
  { value: 'docs', label: 'Documents', icon: FileText },
  { value: 'tasks', label: 'Tasks', icon: CheckSquare },
  { value: 'notes', label: 'Notes', icon: StickyNote },
  { value: 'microsoft', label: 'Microsoft', icon: Link2 },
];

// =============================================
// Date grouping helpers
// =============================================

interface DateGroup {
  label: string;
  events: TimelineEvent[];
}

function groupEventsByDate(events: TimelineEvent[]): DateGroup[] {
  const groups: Map<string, TimelineEvent[]> = new Map();

  for (const event of events) {
    const d = new Date(event.occurred_at || event.created_at);
    let label: string;
    if (isToday(d)) label = 'Today';
    else if (isYesterday(d)) label = 'Yesterday';
    else if (isThisWeek(d)) label = 'This week';
    else label = 'Older';

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(event);
  }

  // Keep insertion order (events arrive sorted desc)
  const ordered: DateGroup[] = [];
  for (const label of ['Today', 'Yesterday', 'This week', 'Older']) {
    const items = groups.get(label);
    if (items && items.length > 0) ordered.push({ label, events: items });
  }
  return ordered;
}

// =============================================
// Props
// =============================================

interface ClientTimelineTabProps {
  tenantId: number;
  clientId: string;
  clientName?: string;
}

export function ClientTimelineTab({ tenantId, clientId, clientName }: ClientTimelineTabProps) {
  const navigate = useNavigate();
  const { isSuperAdmin, profile } = useAuth();
  const isVivacityTeam = isSuperAdmin() ||
    profile?.unicorn_role === 'Team Leader' ||
    profile?.unicorn_role === 'Team Member';

  const {
    events,
    pinnedNotes,
    loading,
    hasMore,
    filter,
    setFilter,
    search,
    setSearch,
    refresh,
    loadMore,
    addQuickNote,
    toggleNotePin,
  } = useClientTimeline(tenantId, clientId);

  const [showAddNote, setShowAddNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [expandedPinnedNotes, setExpandedPinnedNotes] = useState<Set<string>>(new Set());

  const dateGroups = useMemo(() => groupEventsByDate(events), [events]);

  // =============================================
  // Note helpers
  // =============================================

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

  const togglePinnedExpand = (noteId: string) => {
    setExpandedPinnedNotes(prev => {
      const next = new Set(prev);
      next.has(noteId) ? next.delete(noteId) : next.add(noteId);
      return next;
    });
  };

  const getNoteIdFromEvent = (event: TimelineEvent): string | null => {
    if (event.entity_type === 'note' && event.entity_id) return event.entity_id;
    return ((event.metadata as Record<string, unknown>)?.note_id as string) || null;
  };

  const isNotePinned = (noteId: string): boolean => pinnedNotes.some(n => n.id === noteId);

  // =============================================
  // Skeleton loading state
  // =============================================

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
            {[1, 2, 3, 4].map(i => (
              <TimelineEventCardSkeleton key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // =============================================
  // Render
  // =============================================

  return (
    <div className="space-y-4">
      {/* ===== Pinned Notes ===== */}
      {pinnedNotes.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Pin className="h-4 w-4 text-amber-600" />
              Pinned Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pinnedNotes.map(note => {
              const isExpanded = expandedPinnedNotes.has(note.id);
              return (
                <div
                  key={note.id}
                  className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{note.title || 'Untitled note'}</p>
                      <p className={`text-sm text-muted-foreground mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {note.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {note.content.length > 100 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePinnedExpand(note.id)}>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-amber-600 hover:text-amber-700"
                        onClick={() => toggleNotePin(note.id, false)}
                        title="Unpin note"
                      >
                        <PinOff className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                    </span>
                    {note.creator && (
                      <span className="flex items-center gap-1">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={note.creator.avatar_url || undefined} />
                          <AvatarFallback className="text-[8px]">
                            {note.creator.first_name?.[0]}{note.creator.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {note.creator.first_name} {note.creator.last_name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ===== Main Timeline ===== */}
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
                <Button size="sm" onClick={handleAddNote} disabled={!noteContent.trim() || addingNote}>
                  {addingNote && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Note
                </Button>
              </div>
            </div>
          )}

          {/* Filter chips */}
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS
                .filter(opt => opt.value !== 'microsoft' || isVivacityTeam)
                .map(opt => {
                  const FilterIcon = opt.icon;
                  return (
                    <Button
                      key={opt.value}
                      variant={filter === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilter(opt.value)}
                      className="h-7 text-xs"
                    >
                      <FilterIcon className="h-3 w-3 mr-1" />
                      {opt.label}
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
              <p className="font-medium">No activity yet</p>
              <p className="text-sm mt-1">Events will appear as work is completed.</p>
              {isVivacityTeam && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setShowAddNote(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add note
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

                {dateGroups.map(group => (
                  <div key={group.label}>
                    {/* Sticky date header */}
                    <div className="sticky top-0 z-20 bg-card py-1.5 mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-14">
                        {group.label}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {group.events.map(event => {
                        const noteId = getNoteIdFromEvent(event);
                        const pinned = noteId ? isNotePinned(noteId) : false;
                        return (
                          <TimelineEventCard
                            key={event.id}
                            event={event}
                            isVivacityTeam={isVivacityTeam}
                            noteId={noteId}
                            isPinned={pinned}
                            onTogglePin={toggleNotePin}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadMore(events.length)}
                      disabled={loading}
                    >
                      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
