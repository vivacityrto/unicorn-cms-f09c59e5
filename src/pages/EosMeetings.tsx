import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Calendar, Clock, Users, Play, FileText, Settings, AlertCircle, RefreshCw, Trash2, Zap, Target, LayoutTemplate, ChevronDown, History, Lock, CheckCircle, PlayCircle, Loader2 } from 'lucide-react';
import { useEosMeetings } from '@/hooks/useEos';
import { useMeetingSeries } from '@/hooks/useMeetingSeries';
import { useRBAC } from '@/hooks/useRBAC';
import { format, isPast, isToday } from 'date-fns';
import { MeetingScheduler } from '@/components/eos/MeetingScheduler';
import { AgendaTemplateLibrary } from '@/components/eos/AgendaTemplateLibrary';
import { ApplyTemplateDialog } from '@/components/eos/ApplyTemplateDialog';
import { DeleteMeetingDialog } from '@/components/eos/DeleteMeetingDialog';
import { PastMeetingSummary } from '@/components/eos/PastMeetingSummary';
import { MeetingChainNav } from '@/components/eos/MeetingChainNav';
import { DashboardLayout } from '@/components/DashboardLayout';
import type { MeetingType, EosMeeting } from '@/types/eos';
import type { MeetingInstance } from '@/hooks/useMeetingSeries';

export default function EosMeetings() {
  return (
    <DashboardLayout>
      <MeetingsContent />
    </DashboardLayout>
  );
}

function MeetingsContent() {
  const navigate = useNavigate();
  const { meetings, isLoading, error, refetch, deleteMeeting } = useEosMeetings();
  const { upcomingMeetings, pastMeetings, isLoadingUpcoming, isLoadingPast } = useMeetingSeries();
  const { canScheduleMeetings } = useRBAC();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [timelineTab, setTimelineTab] = useState<'upcoming' | 'in_progress' | 'completed'>('upcoming');
  const [typeTab, setTypeTab] = useState<'all' | MeetingType>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<{ id: string; title: string } | null>(null);
  const [applyTemplateDialogOpen, setApplyTemplateDialogOpen] = useState(false);
  const [meetingForTemplate, setMeetingForTemplate] = useState<EosMeeting | null>(null);
  const [pastMeetingsOpen, setPastMeetingsOpen] = useState(false);
  const [selectedPastMeeting, setSelectedPastMeeting] = useState<MeetingInstance | null>(null);

  // Categorize meetings by lifecycle state
  const { upcomingList, inProgressList, completedList } = useMemo(() => {
    const upcoming: EosMeeting[] = [];
    const inProgress: EosMeeting[] = [];
    const completed: EosMeeting[] = [];

    (meetings || []).forEach((meeting) => {
      if (meeting.status === 'closed' || meeting.status === 'completed' || meeting.is_complete) {
        completed.push(meeting);
      } else if (meeting.status === 'in_progress') {
        inProgress.push(meeting);
      } else {
        upcoming.push(meeting);
      }
    });

    return {
      upcomingList: upcoming.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()),
      inProgressList: inProgress,
      completedList: completed.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()),
    };
  }, [meetings]);

  const handleApplyTemplateClick = (meeting: EosMeeting) => {
    setMeetingForTemplate(meeting);
    setApplyTemplateDialogOpen(true);
  };

  const handleDeleteClick = (id: string, title: string) => {
    setMeetingToDelete({ id, title });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (meetingToDelete) {
      deleteMeeting.mutate(meetingToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setMeetingToDelete(null);
        },
      });
    }
  };

  const getStatusBadge = (meeting: EosMeeting) => {
    if (meeting.status === 'closed' || meeting.status === 'completed' || meeting.is_complete) {
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          <Lock className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    }
    if (meeting.status === 'in_progress') {
      return (
        <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          In Progress
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <PlayCircle className="w-3 h-3 mr-1" />
        Scheduled
      </Badge>
    );
  };

  const getMeetingTypeColor = (type: MeetingType) => {
    switch (type) {
      case 'L10': return 'bg-primary/10 text-primary border-primary/20';
      case 'Same_Page': return 'bg-warning/10 text-warning border-warning/20';
      case 'Quarterly': return 'bg-secondary/30 text-secondary-foreground border-secondary/50';
      case 'Annual': return 'bg-accent/30 text-accent-foreground border-accent/50';
      default: return 'bg-muted text-muted-foreground border-muted';
    }
  };

  const filterByType = (list: EosMeeting[]) => {
    if (typeTab === 'all') return list;
    return list.filter(m => m.meeting_type === typeTab);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading meetings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Couldn't load meetings</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              There was an issue loading your meetings. This may be a permissions or configuration issue.
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="w-8 h-8" />
            EOS Meetings
          </h1>
          <p className="text-muted-foreground mt-2">
            Structured meetings that drive execution, visibility, and accountability.
          </p>
        </div>
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button 
                    variant="outline" 
                    onClick={() => setTemplateLibraryOpen(true)}
                    disabled={!canScheduleMeetings()}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Manage Templates
                  </Button>
                </span>
              </TooltipTrigger>
              {!canScheduleMeetings() && (
                <TooltipContent>
                  Managing templates requires Admin access.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button 
                    onClick={() => setSchedulerOpen(true)}
                    disabled={!canScheduleMeetings()}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Schedule Meeting
                  </Button>
                </span>
              </TooltipTrigger>
              {!canScheduleMeetings() && (
                <TooltipContent>
                  Scheduling meetings requires Admin access.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <MeetingScheduler
        open={schedulerOpen}
        onOpenChange={setSchedulerOpen}
        onScheduled={() => window.location.reload()}
      />

      <AgendaTemplateLibrary
        open={templateLibraryOpen}
        onOpenChange={setTemplateLibraryOpen}
      />

      <DeleteMeetingDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        meetingTitle={meetingToDelete?.title || ''}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMeeting.isPending}
      />

      {meetingForTemplate && (
        <ApplyTemplateDialog
          open={applyTemplateDialogOpen}
          onOpenChange={(open) => {
            setApplyTemplateDialogOpen(open);
            if (!open) setMeetingForTemplate(null);
          }}
          meetingId={meetingForTemplate.id}
          meetingType={meetingForTemplate.meeting_type}
          meetingTitle={meetingForTemplate.title}
          hasExistingSegments={true}
        />
      )}

      {selectedPastMeeting && (
        <PastMeetingSummary
          open={!!selectedPastMeeting}
          onOpenChange={(open) => !open && setSelectedPastMeeting(null)}
          meeting={selectedPastMeeting}
        />
      )}

      {/* Meeting Type Info Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-sm">Level 10 Meeting</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Weekly execution meeting to track scorecard results, review Rocks, surface risks and opportunities, and assign actions.
            </p>
            <div className="mt-2 text-xs text-muted-foreground/70">
              Default: Segue • Scorecard • Rock Review • Risks & Opps • To-Dos • IDS • Conclude
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-sm">Same Page Meeting</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Visionary and Integrator alignment meeting to ensure shared vision and synchronized execution.
            </p>
            <div className="mt-2 text-xs text-muted-foreground/70">
              Outputs: Decisions recorded • Action items assigned • Alignment confirmed
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-sm">Quarterly Meeting</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Strategic review to assess the last quarter and set the Superhero Flight Plan for the next.
            </p>
            <div className="mt-2 text-xs text-muted-foreground/70">
              Outputs: Confirmed quarterly goal • Approved Rocks • Updated scorecard targets
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-sm">Annual Strategic Planning</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Annual planning session to reset direction, priorities, and execution focus.
            </p>
            <div className="mt-2 text-xs text-muted-foreground/70">
              Outputs: V/TO updates • 12 Month Mission Objectives • Quarterly planning cadence
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Meeting Timeline Tabs */}
      <Tabs value={timelineTab} onValueChange={(v) => setTimelineTab(v as typeof timelineTab)} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="upcoming" className="gap-2">
              <PlayCircle className="w-4 h-4" />
              Upcoming ({upcomingList.length})
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="gap-2">
              <Loader2 className="w-4 h-4" />
              In Progress ({inProgressList.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed ({completedList.length})
            </TabsTrigger>
          </TabsList>

          {/* Type filter */}
          <Tabs value={typeTab} onValueChange={(v) => setTypeTab(v as typeof typeTab)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-7">All</TabsTrigger>
              <TabsTrigger value="L10" className="text-xs h-7">L10</TabsTrigger>
              <TabsTrigger value="Quarterly" className="text-xs h-7">Quarterly</TabsTrigger>
              <TabsTrigger value="Annual" className="text-xs h-7">Annual</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Upcoming Meetings */}
        <TabsContent value="upcoming" className="mt-4">
          <div className="grid gap-4">
            {filterByType(upcomingList).length > 0 ? (
              filterByType(upcomingList).map((meeting) => (
                <MeetingCard 
                  key={meeting.id} 
                  meeting={meeting} 
                  getStatusBadge={getStatusBadge}
                  getMeetingTypeColor={getMeetingTypeColor}
                  canScheduleMeetings={canScheduleMeetings}
                  onApplyTemplate={handleApplyTemplateClick}
                  onDelete={handleDeleteClick}
                  navigate={navigate}
                />
              ))
            ) : (
              <EmptyMeetings 
                canSchedule={canScheduleMeetings()} 
                onSchedule={() => setSchedulerOpen(true)}
                message="No upcoming meetings scheduled"
              />
            )}
          </div>
        </TabsContent>

        {/* In Progress Meetings */}
        <TabsContent value="in_progress" className="mt-4">
          <div className="grid gap-4">
            {filterByType(inProgressList).length > 0 ? (
              filterByType(inProgressList).map((meeting) => (
                <MeetingCard 
                  key={meeting.id} 
                  meeting={meeting} 
                  getStatusBadge={getStatusBadge}
                  getMeetingTypeColor={getMeetingTypeColor}
                  canScheduleMeetings={canScheduleMeetings}
                  onApplyTemplate={handleApplyTemplateClick}
                  onDelete={handleDeleteClick}
                  navigate={navigate}
                  showResumeAction
                />
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Loader2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No meetings in progress</h3>
                  <p className="text-muted-foreground">
                    Start an upcoming meeting to see it here.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Completed Meetings */}
        <TabsContent value="completed" className="mt-4">
          <div className="grid gap-4">
            {filterByType(completedList).length > 0 ? (
              filterByType(completedList).map((meeting) => (
                <Card key={meeting.id} className="opacity-90 hover:opacity-100 transition-opacity">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{meeting.title}</CardTitle>
                          <Badge variant="secondary" className="bg-muted">
                            <Lock className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                          <Badge className={getMeetingTypeColor(meeting.meeting_type)}>
                            {meeting.meeting_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(meeting.scheduled_date), 'EEEE, MMMM d, yyyy')}
                          </span>
                          {meeting.quorum_status && meeting.quorum_status !== 'pending' && (
                            <Badge variant={meeting.quorum_status === 'met' ? 'outline' : 'destructive'} className="text-xs">
                              Quorum {meeting.quorum_status === 'met' ? 'Met' : 'Not Met'}
                            </Badge>
                          )}
                        </div>
                        {/* Meeting chain navigation */}
                        {(meeting.previous_meeting_id || meeting.next_meeting_id) && (
                          <div className="mt-2">
                            <MeetingChainNav
                              meetingId={meeting.id}
                              previousMeetingId={meeting.previous_meeting_id}
                              nextMeetingId={meeting.next_meeting_id}
                              meetingType={meeting.meeting_type}
                              isCompleted
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/eos/meetings/${meeting.id}/summary`)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Summary
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No completed meetings</h3>
                  <p className="text-muted-foreground">
                    Completed meetings will appear here with their summaries.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Extracted MeetingCard component for reuse
interface MeetingCardProps {
  meeting: EosMeeting;
  getStatusBadge: (meeting: EosMeeting) => React.ReactNode;
  getMeetingTypeColor: (type: MeetingType) => string;
  canScheduleMeetings: () => boolean;
  onApplyTemplate: (meeting: EosMeeting) => void;
  onDelete: (id: string, title: string) => void;
  navigate: (path: string) => void;
  showResumeAction?: boolean;
}

function MeetingCard({ 
  meeting, 
  getStatusBadge, 
  getMeetingTypeColor, 
  canScheduleMeetings,
  onApplyTemplate,
  onDelete,
  navigate,
  showResumeAction = false,
}: MeetingCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{meeting.title}</CardTitle>
              {getStatusBadge(meeting)}
              <Badge className={getMeetingTypeColor(meeting.meeting_type)}>
                {meeting.meeting_type}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(new Date(meeting.scheduled_date), 'EEEE, MMMM d, yyyy')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {meeting.duration_minutes || 90} minutes
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {meeting.location}
                </span>
              )}
            </div>
            {meeting.notes && (
              <p className="text-sm text-muted-foreground mt-3">{meeting.notes}</p>
            )}
            {/* Meeting chain navigation */}
            {(meeting.previous_meeting_id || meeting.next_meeting_id) && (
              <div className="mt-2">
                <MeetingChainNav
                  meetingId={meeting.id}
                  previousMeetingId={meeting.previous_meeting_id}
                  nextMeetingId={meeting.next_meeting_id}
                  meetingType={meeting.meeting_type}
                />
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => navigate(`/eos/meetings/${meeting.id}/live`)}
          >
            <Play className="w-4 h-4 mr-2" />
            {showResumeAction ? 'Resume Meeting' : 'Start Meeting'}
          </Button>
          {canScheduleMeetings() && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onApplyTemplate(meeting)}
                title="Apply Agenda Template"
              >
                <LayoutTemplate className="w-4 h-4 mr-2" />
                Apply Template
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(meeting.id, meeting.title)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Empty state component
interface EmptyMeetingsProps {
  canSchedule: boolean;
  onSchedule: () => void;
  message: string;
}

function EmptyMeetings({ canSchedule, onSchedule, message }: EmptyMeetingsProps) {
  return (
    <Card>
      <CardContent className="p-12 text-center">
        <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{message}</h3>
        <p className="text-muted-foreground mb-4">
          {canSchedule
            ? "Schedule your first EOS Meeting to get started"
            : "No EOS meetings have been scheduled yet."}
        </p>
        {canSchedule && (
          <Button onClick={onSchedule}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule First Meeting
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
