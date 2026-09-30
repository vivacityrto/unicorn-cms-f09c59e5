import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientTimeline, TimelineEvent } from '@/hooks/useClientManagementData';
import { usePinnedNotes, useSetNotePinned } from '@/hooks/usePinnedNotes';
import { PinnedNotesCard } from '@/components/notes/PinnedNotesCard';
import { useAuth } from '@/hooks/useAuth';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TimelineEventCard, TimelineEventCardSkeleton } from './TimelineEventCard';
import {
  Activity, FileText, Mail, CheckSquare, StickyNote,
  Clock, Loader2, RefreshCw, Calendar, Timer, Search,
  Plus, X, Link2, UserCog, LogIn, MessageSquare,
  GraduationCap, ListChecks, MousePointerClick, ArrowRightLeft, Receipt, Package, Shield,
} from 'lucide-react';
import { isToday, isYesterday, isThisWeek } from 'date-fns';

// =============================================
// Filter chips
// =============================================

export const FILTER_OPTIONS = [
  { value: 'all', label: 'All', icon: Activity },
  { value: 'meetings', label: 'Meetings', icon: Calendar },
  { value: 'time', label: 'Time', icon: Clock, staffOnly: true },
  { value: 'emails', label: 'Emails', icon: Mail },
  { value: 'docs', label: 'Documents', icon: FileText },
  { value: 'tasks', label: 'Tasks', icon: CheckSquare },
  { value: 'notes', label: 'Notes', icon: StickyNote },
  { value: 'accounts', label: 'Accounts', icon: UserCog },
  { value: 'messages', label: 'Messages', icon: MessageSquare },
  { value: 'logins', label: 'Logins', icon: LogIn, staffOnly: true },
  { value: 'academy', label: 'Academy', icon: GraduationCap, staffOnly: true },
  { value: 'stages', label: 'Stages', icon: ListChecks, staffOnly: true },
  { value: 'packages', label: 'Packages', icon: Package, staffOnly: true },
  { value: 'portal_activity', label: 'Portal Activity', icon: MousePointerClick, staffOnly: true },
  { value: 'tenant_status', label: 'Tenant Status', icon: ArrowRightLeft, staffOnly: true },
  { value: 'invoices', label: 'Invoices', icon: Receipt, staffOnly: true },
  { value: 'audits', label: 'Audits', icon: Shield, staffOnly: true },
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
  const isVivacityTeam = isVivacityStaffRole(profile?.unicorn_role);

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
    addQuickNote,
  } = useClientTimeline(tenantId, clientId);

  // Pin state is shared with the pinned-notes card, the Notes tab and the
  // package cards (one react-query cache), not tracked per-tab.
  const { data: pinnedNotes = [] } = usePinnedNotes(tenantId);
  const setNotePinned = useSetNotePinned(tenantId);
  // Pinning/unpinning writes a Timeline entry (DB trigger), so reload the feed once the change lands.
  const toggleNotePin = (noteId: string, pinned: boolean) =>
    setNotePinned.mutate({ noteId, pinned }, { onSuccess: () => refresh() });

  const [showAddNote, setShowAddNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

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

  const getNoteIdFromEvent = (event: TimelineEvent): string | null => {
    if ((event.entity_type === 'note' || event.entity_type === 'structured_note') && event.entity_id) {
      return event.entity_id;
    }
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
      {/* ===== Pinned Notes (shared with Overview) ===== */}
      <PinnedNotesCard tenantId={tenantId} onPinChanged={() => refresh()} />

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
                .filter(opt => (opt.value !== 'microsoft' && !opt.staffOnly) || isVivacityTeam)
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
                      onClick={() => loadMore()}
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
