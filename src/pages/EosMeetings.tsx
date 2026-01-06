import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Calendar, Clock, Users, Play, FileText, Settings, AlertCircle, RefreshCw } from 'lucide-react';
import { useEosMeetings } from '@/hooks/useEos';
import { format } from 'date-fns';
import { MeetingScheduler } from '@/components/eos/MeetingScheduler';
import { AgendaTemplateEditor } from '@/components/eos/AgendaTemplateEditor';
import { DashboardLayout } from '@/components/DashboardLayout';
import type { MeetingType } from '@/types/eos';

export default function EosMeetings() {
  return (
    <DashboardLayout>
      <MeetingsContent />
    </DashboardLayout>
  );
}

function MeetingsContent() {
  const navigate = useNavigate();
  const { meetings, isLoading, error, refetch } = useEosMeetings();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | MeetingType>('all');

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
            Level 10, Quarterly, and Annual strategic meetings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateEditorOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Manage Templates
          </Button>
          <Button onClick={() => setSchedulerOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Meeting
          </Button>
        </div>
      </div>

      <MeetingScheduler
        open={schedulerOpen}
        onOpenChange={setSchedulerOpen}
        onScheduled={() => window.location.reload()}
      />

      <AgendaTemplateEditor
        open={templateEditorOpen}
        onOpenChange={setTemplateEditorOpen}
      />

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-1 text-sm">Level 10 Meeting</h3>
            <p className="text-xs text-muted-foreground">
              90-minute weekly tactical meeting: Segue, Scorecard, Rocks, Headlines, To-Dos, IDS, Conclude.
            </p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-1 text-sm">Quarterly Meeting</h3>
            <p className="text-xs text-muted-foreground">
              Full-day strategic session to review progress, update V/TO, and set next quarter rocks.
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-1 text-sm">Annual Meeting</h3>
            <p className="text-xs text-muted-foreground">
              Two-day strategic planning for the year ahead, including organizational structure review.
            </p>
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
                Schedule your first EOS Meeting to get started
              </p>
              <Button onClick={() => setSchedulerOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Schedule First Meeting
              </Button>
            </CardContent>
          </Card>
        )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
