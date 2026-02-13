import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { 
  Clock, MapPin, Users, Building2, Timer, Link as LinkIcon, 
  ExternalLink, Video, FileText, Plus, Check, Loader2, Save, Paperclip, Sparkles
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Meeting, MeetingParticipant, MeetingNote, MeetingActionItem, useMeetings } from '@/hooks/useMeetings';
import { useMeetingArtifacts } from '@/hooks/useMeetingArtifacts';
import { MeetingArtifactsList } from '@/components/meetings/MeetingArtifactsList';
import { MeetingMinutesPanel } from '@/components/meetings/MeetingMinutesPanel';
import { MeetingAiSummaryPanel } from '@/components/meetings/MeetingAiSummaryPanel';
import { useRBAC } from '@/hooks/useRBAC';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface MeetingDetailDrawerProps {
  meeting: Meeting | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTimeDraft?: (meetingId: string) => void;
  onLinkToClient?: (meetingId: string) => void;
}

export function MeetingDetailDrawer({
  meeting,
  open,
  onOpenChange,
  onCreateTimeDraft,
  onLinkToClient,
}: MeetingDetailDrawerProps) {
  const { 
    fetchParticipants, 
    fetchNotes, 
    fetchActionItems, 
    addNote, 
    updateNote,
    addActionItem,
    updateActionItem 
  } = useMeetings();

  const { isVivacityTeam } = useRBAC();

  const {
    artifacts,
    isLoading: loadingArtifacts,
    isSyncing,
    syncArtifacts,
    lastSyncResult,
    shareArtifact,
    isSharingArtifact,
  } = useMeetingArtifacts(open ? meeting?.id ?? null : null);

  const [activeTab, setActiveTab] = useState('details');
  const [newNote, setNewNote] = useState('');
  const [newActionItem, setNewActionItem] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  
  // Fetch participants
  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ['meeting-participants', meeting?.id],
    queryFn: () => meeting?.id ? fetchParticipants(meeting.id) : Promise.resolve([]),
    enabled: !!meeting?.id && open,
  });

  // Fetch notes
  const { data: notes = [], isLoading: loadingNotes, refetch: refetchNotes } = useQuery({
    queryKey: ['meeting-notes', meeting?.id],
    queryFn: () => meeting?.id ? fetchNotes(meeting.id) : Promise.resolve([]),
    enabled: !!meeting?.id && open,
  });

  // Fetch action items
  const { data: actionItems = [], isLoading: loadingActionItems, refetch: refetchActionItems } = useQuery({
    queryKey: ['meeting-action-items', meeting?.id],
    queryFn: () => meeting?.id ? fetchActionItems(meeting.id) : Promise.resolve([]),
    enabled: !!meeting?.id && open,
  });

  if (!meeting) return null;

  const isBusyOnly = meeting.access_scope === 'busy_only';
  const isOwner = meeting.access_scope === 'owner';
  const startTime = new Date(meeting.starts_at);
  const endTime = new Date(meeting.ends_at);
  const durationMinutes = differenceInMinutes(endTime, startTime);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationLabel = hours > 0 
    ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`
    : `${minutes}m`;

  // Vivacity team sees artifacts tab; clients do not
  const showArtifactsTab = isVivacityTeam && isOwner;
  // Vivacity team sees minutes tab; clients do not see it at all
  const showMinutesTab = isVivacityTeam && isOwner;
  // Vivacity team sees AI summary tab; internal only
  const showAiSummaryTab = isVivacityTeam && isOwner;

  const handleAddNote = async () => {
    if (!meeting.id || !newNote.trim()) return;
    setIsSavingNote(true);
    try {
      await addNote({ meetingId: meeting.id, notes: newNote.trim() });
      setNewNote('');
      refetchNotes();
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleAddActionItem = async () => {
    if (!meeting.id || !newActionItem.trim()) return;
    await addActionItem({ meetingId: meeting.id, description: newActionItem.trim() });
    setNewActionItem('');
    refetchActionItems();
  };

  const handleToggleActionItem = async (item: MeetingActionItem) => {
    const newStatus = item.status === 'completed' ? 'open' : 'completed';
    await updateActionItem({ itemId: item.id, status: newStatus });
    refetchActionItems();
  };

  const handleShareToggle = (artifactId: string, share: boolean) => {
    shareArtifact({ artifactId, share });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-6 pb-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              meeting.is_online ? 'bg-primary/10' : 'bg-muted'
            )}>
              {meeting.is_online ? (
                <Video className="h-5 w-5 text-primary" />
              ) : (
                <MapPin className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold break-words">
                {meeting.title}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {meeting.client_id && (
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    Client linked
                  </Badge>
                )}
                {meeting.status === 'completed' && (
                  <Badge variant="outline" className="text-green-600">
                    Completed
                  </Badge>
                )}
                {meeting.status === 'cancelled' && (
                  <Badge variant="outline" className="text-destructive">
                    Cancelled
                  </Badge>
                )}
                {isBusyOnly && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Busy time
                  </Badge>
                )}
                {meeting.time_draft_created && (
                  <Badge variant="outline" className="text-primary gap-1">
                    <Timer className="h-3 w-3" />
                    Time logged
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start px-6 bg-transparent border-b rounded-none">
            <TabsTrigger value="details">Details</TabsTrigger>
            {isOwner && (
              <>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
                {showArtifactsTab && (
                  <TabsTrigger value="artifacts" className="gap-1">
                    <Paperclip className="h-3 w-3" />
                    Artifacts
                    {artifacts.length > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                        {artifacts.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {showMinutesTab && (
                  <TabsTrigger value="minutes" className="gap-1">
                    <FileText className="h-3 w-3" />
                    Minutes
                  </TabsTrigger>
                )}
                {showAiSummaryTab && (
                  <TabsTrigger value="ai-summary" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI Summary
                  </TabsTrigger>
                )}
              </>
            )}
          </TabsList>

          <ScrollArea className="h-[calc(100vh-200px)]">
            <TabsContent value="details" className="p-6 pt-4 space-y-4 mt-0">
              {/* Time */}
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">
                    {format(startTime, 'EEEE, MMMM d, yyyy')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')} ({durationLabel})
                  </div>
                </div>
              </div>

              {/* Location */}
              {meeting.location && !isBusyOnly && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-sm">{meeting.location}</div>
                </div>
              )}

              {/* Meeting URL */}
              {meeting.external_meeting_url && !isBusyOnly && (
                <div className="flex items-start gap-3">
                  <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <a
                    href={meeting.external_meeting_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Join meeting
                  </a>
                </div>
              )}

              {/* Participants */}
              {!isBusyOnly && (
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium mb-2">
                      {loadingParticipants ? 'Loading...' : `${participants.length} participant${participants.length !== 1 ? 's' : ''}`}
                    </div>
                    {!loadingParticipants && participants.length > 0 && (
                      <div className="text-sm text-muted-foreground space-y-1">
                        {participants.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              p.participant_type === 'organizer' && 'bg-primary/10 text-primary',
                              p.participant_type === 'optional' && 'bg-muted text-muted-foreground'
                            )}>
                              {p.participant_type === 'organizer' && 'Organizer'}
                              {p.participant_type === 'optional' && 'Optional'}
                            </span>
                            <span>{p.participant_name || p.participant_email}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions for owner */}
              {isOwner && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {!meeting.time_draft_created && meeting.status === 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          onCreateTimeDraft?.(meeting.id);
                        }}
                      >
                        <Timer className="h-4 w-4" />
                        Create time draft
                      </Button>
                    )}
                    {!meeting.client_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          onLinkToClient?.(meeting.id);
                        }}
                      >
                        <LinkIcon className="h-4 w-4" />
                        Link to client
                      </Button>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="notes" className="p-6 pt-4 space-y-4 mt-0">
              {/* Add note */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Add meeting notes..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                />
                <Button 
                  size="sm" 
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || isSavingNote}
                >
                  {isSavingNote ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save note
                </Button>
              </div>

              <Separator />

              {/* Notes list */}
              {loadingNotes ? (
                <div className="text-sm text-muted-foreground">Loading notes...</div>
              ) : notes.length === 0 ? (
                <div className="text-sm text-muted-foreground">No notes yet</div>
              ) : (
                <div className="space-y-4">
                  {notes.map((note) => (
                    <div key={note.id} className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(note.created_at), 'MMM d, yyyy HH:mm')}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{note.notes}</div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="p-6 pt-4 space-y-4 mt-0">
              {/* Add action item */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add action item..."
                  value={newActionItem}
                  onChange={(e) => setNewActionItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddActionItem()}
                />
                <Button 
                  size="icon" 
                  onClick={handleAddActionItem}
                  disabled={!newActionItem.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <Separator />

              {/* Action items list */}
              {loadingActionItems ? (
                <div className="text-sm text-muted-foreground">Loading action items...</div>
              ) : actionItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No action items yet</div>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={cn(
                        'flex items-start gap-3 p-2 rounded-md',
                        item.status === 'completed' && 'bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={item.status === 'completed'}
                        onCheckedChange={() => handleToggleActionItem(item)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          'text-sm',
                          item.status === 'completed' && 'line-through text-muted-foreground'
                        )}>
                          {item.description}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {showArtifactsTab && (
              <TabsContent value="artifacts" className="p-6 pt-4 mt-0">
                <MeetingArtifactsList
                  artifacts={artifacts}
                  isLoading={loadingArtifacts}
                  isSyncing={isSyncing}
                  lastSyncResult={lastSyncResult}
                  onSync={() => meeting?.id && syncArtifacts(meeting.id)}
                  onShareToggle={handleShareToggle}
                  isSharingArtifact={isSharingArtifact}
                  meetingMsSyncStatus={(meeting as any)?.ms_sync_status}
                  meetingMsSyncError={(meeting as any)?.ms_sync_error}
                  meetingMsLastSyncedAt={(meeting as any)?.ms_last_synced_at}
                />
              </TabsContent>
            )}

            {showMinutesTab && (
              <TabsContent value="minutes" className="p-6 pt-4 mt-0">
                <MeetingMinutesPanel
                  meetingId={meeting.id}
                  isVivacityTeam={isVivacityTeam}
                />
              </TabsContent>
            )}

            {showAiSummaryTab && (
              <TabsContent value="ai-summary" className="p-6 pt-4 mt-0">
                <MeetingAiSummaryPanel
                  meetingId={meeting.id}
                  tenantId={meeting.tenant_id}
                />
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
