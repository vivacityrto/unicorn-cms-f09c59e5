import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Calendar, Clock, Users, Play, FileText, Settings, AlertCircle, RefreshCw, Trash2, Zap, Target, LayoutTemplate } from 'lucide-react';
import { useEosMeetings } from '@/hooks/useEos';
import { useRBAC } from '@/hooks/useRBAC';
import { format } from 'date-fns';
import { MeetingScheduler } from '@/components/eos/MeetingScheduler';
import { AgendaTemplateLibrary } from '@/components/eos/AgendaTemplateLibrary';
import { ApplyTemplateDialog } from '@/components/eos/ApplyTemplateDialog';
import { DeleteMeetingDialog } from '@/components/eos/DeleteMeetingDialog';
import { DashboardLayout } from '@/components/DashboardLayout';
import type { MeetingType, EosMeeting } from '@/types/eos';

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
  const { canScheduleMeetings } = useRBAC();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | MeetingType>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<{ id: string; title: string } | null>(null);
  const [applyTemplateDialogOpen, setApplyTemplateDialogOpen] = useState(false);
  const [meetingForTemplate, setMeetingForTemplate] = useState<EosMeeting | null>(null);

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

  const getCompletionBadge = (isComplete?: boolean) => {
    if (isComplete) {
      return <Badge variant="secondary">Completed</Badge>;
    }
    return <Badge variant="outline">Upcoming</Badge>;
  };

  const getMeetingTypeColor = (type: MeetingType) => {
    switch (type) {
      case 'L10': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Quarterly': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'Annual': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const filteredMeetings = meetings?.filter(m => 
    activeTab === 'all' || m.meeting_type === activeTab
  ) || [];

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
        {canScheduleMeetings() && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTemplateLibraryOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Manage Templates
            </Button>
            <Button onClick={() => setSchedulerOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Meeting
            </Button>
          </div>
        )}
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

      {/* Meeting Type Info Cards */}
      <div className="grid md:grid-cols-3 gap-4">
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

      {/* Meetings List with Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">All Meetings</TabsTrigger>
          <TabsTrigger value="L10">Level 10</TabsTrigger>
          <TabsTrigger value="Quarterly">Quarterly</TabsTrigger>
          <TabsTrigger value="Annual">Annual</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="grid gap-4">
            {filteredMeetings && filteredMeetings.length > 0 ? (
              filteredMeetings.map((meeting) => (
                <Card key={meeting.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{meeting.title}</CardTitle>
                          {getCompletionBadge(meeting.is_complete)}
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
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {meeting.is_complete ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/eos/meetings/${meeting.id}/live`)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Summary
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/eos/meetings/${meeting.id}/live`)}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Meeting
                    </Button>
                  )}
                  {canScheduleMeetings() && !meeting.is_complete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyTemplateClick(meeting)}
                      title="Apply Agenda Template"
                    >
                      <LayoutTemplate className="w-4 h-4 mr-2" />
                      Apply Template
                    </Button>
                  )}
                  {canScheduleMeetings() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(meeting.id, meeting.title)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No meetings scheduled</h3>
              <p className="text-muted-foreground mb-4">
                {canScheduleMeetings() 
                  ? "Schedule your first EOS Meeting to get started"
                  : "No EOS meetings have been scheduled yet."}
              </p>
              {canScheduleMeetings() && (
                <Button onClick={() => setSchedulerOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule First Meeting
                </Button>
              )}
            </CardContent>
          </Card>
        )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
