import { useState } from 'react';
import { RefreshCw, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MeetingsList } from '@/components/meetings/MeetingsList';
import { MeetingsFilters } from '@/components/meetings/MeetingsFilters';
import { MeetingDetailDrawer } from '@/components/meetings/MeetingDetailDrawer';
import { LinkEventToClientDialog } from '@/components/calendar/LinkEventToClientDialog';
import { useMeetings, Meeting } from '@/hooks/useMeetings';

export default function WorkMeetings() {
  const {
    meetings,
    isLoading,
    filter,
    setFilter,
    stats,
    syncMeetings,
    isSyncing,
    createTimeDraft,
    linkToClient,
  } = useMeetings();

  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [linkMeetingId, setLinkMeetingId] = useState<string | null>(null);

  const handleMeetingClick = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
  };

  const handleCreateTimeDraft = (meetingId: string) => {
    createTimeDraft(meetingId);
  };

  const handleLinkToClient = (meetingId: string) => {
    setLinkMeetingId(meetingId);
    setSelectedMeeting(null);
  };

  const handleConfirmLinkToClient = (clientId: number) => {
    if (linkMeetingId) {
      linkToClient({ meetingId: linkMeetingId, clientId });
      setLinkMeetingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Video className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meetings</h1>
            <p className="text-sm text-muted-foreground">
              View and manage your Teams meetings
            </p>
          </div>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMeetings()}
          disabled={isSyncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          Sync
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total meetings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{stats.upcoming}</div>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card className={stats.needsLinking > 0 ? 'border-amber-300' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${stats.needsLinking > 0 ? 'text-amber-600' : ''}`}>
              {stats.needsLinking}
            </div>
            <p className="text-xs text-muted-foreground">Needs linking</p>
          </CardContent>
        </Card>
        <Card className={stats.noTimeDraft > 0 ? 'border-amber-300' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${stats.noTimeDraft > 0 ? 'text-amber-600' : ''}`}>
              {stats.noTimeDraft}
            </div>
            <p className="text-xs text-muted-foreground">No time draft</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <MeetingsFilters
        filter={filter}
        onFilterChange={setFilter}
        stats={stats}
      />

      {/* Meetings List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : (
        <MeetingsList
          meetings={meetings}
          onMeetingClick={handleMeetingClick}
          onCreateTimeDraft={handleCreateTimeDraft}
          onLinkToClient={handleLinkToClient}
        />
      )}

      {/* Meeting detail drawer */}
      <MeetingDetailDrawer
        meeting={selectedMeeting}
        open={!!selectedMeeting}
        onOpenChange={(open) => !open && setSelectedMeeting(null)}
        onCreateTimeDraft={handleCreateTimeDraft}
        onLinkToClient={handleLinkToClient}
      />

      {/* Link to client dialog */}
      <LinkEventToClientDialog
        open={!!linkMeetingId}
        onOpenChange={(open) => !open && setLinkMeetingId(null)}
        onConfirm={handleConfirmLinkToClient}
      />
    </div>
  );
}
