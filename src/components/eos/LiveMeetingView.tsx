import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMeetingRealtime } from '@/hooks/useMeetingRealtime';
import { useEosMeetingSegments } from '@/hooks/useEosMeetingSegments';
import { useEosHeadlines } from '@/hooks/useEosHeadlines';
import { useMeetingIssues } from '@/hooks/useMeetingIssues';
import { useMeetingTodos } from '@/hooks/useMeetingTodos';
import { useMeetingOutcomes } from '@/hooks/useMeetingOutcomes';
import { useMeetingAttendance } from '@/hooks/useMeetingAttendance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Play, SkipForward, SkipBack, CheckCircle, Clock, Users, X, Target, 
  TrendingUp, AlertCircle, ListTodo, MessageSquare, Sparkles,
  ArrowRight, Timer, PlayCircle, Star
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useEosRocks, useEosScorecardMetrics } from '@/hooks/useEos';
import { RockProgressControl } from '@/components/eos/RockProgressControl';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { ScorecardEntryGrid } from '@/components/eos/ScorecardEntryGrid';
import { IssuesQueue } from '@/components/eos/IssuesQueue';
import { IDSDialog } from '@/components/eos/IDSDialog';
import { TodoInlineForm } from '@/components/eos/TodoInlineForm';
import { CreateIssueDialog } from '@/components/eos/CreateIssueDialog';
import { MeetingCloseValidationDialog } from '@/components/eos/MeetingCloseValidationDialog';
import { AttendancePanel } from '@/components/eos/AttendancePanel';
import { FacilitatorSelectDialog } from '@/components/eos/FacilitatorSelectDialog';
import { OnlineUsersIndicator } from '@/components/eos/OnlineUsersIndicator';
import type { EosMeetingSegment, MeetingType } from '@/types/eos';

export const LiveMeetingView = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [newHeadline, setNewHeadline] = useState('');
  const [isGoodNews, setIsGoodNews] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [idsDialogOpen, setIdsDialogOpen] = useState(false);
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [facilitatorDialogOpen, setFacilitatorDialogOpen] = useState(false);
  const [segmentNotes, setSegmentNotes] = useState<Record<string, string>>({});
  const [isNavigating, setIsNavigating] = useState(false);

  // Fetch meeting details first (needed for tenant_id)
  const { data: meeting, isLoading: meetingLoading } = useQuery({
    queryKey: ['eos-meeting', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('*')
        .eq('id', meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
  });

  // Use custom hooks
  const { segments, isLoading: segmentsLoading, advanceSegment, goToPreviousSegment } = useEosMeetingSegments(meetingId);
  const { headlines, createHeadline, deleteHeadline } = useEosHeadlines(meetingId);
  const { issues } = useMeetingIssues(meetingId, meeting?.tenant_id);
  const { todos, createTodo, updateTodo } = useMeetingTodos(meetingId);
  const { saveRating, getUserRating } = useMeetingOutcomes(meetingId);
  const { rocks } = useEosRocks();
  const { metrics } = useEosScorecardMetrics();

  // Fetch participants with explicit FK join
  const { data: participants } = useQuery({
    queryKey: ['eos-meeting-participants', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_participants')
        .select('*, users!eos_meeting_participants_user_id_users_fkey(first_name, last_name)')
        .eq('meeting_id', meetingId!);
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
  });

  // Get user name for presence tracking
  const userName = profile 
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';

  // Real-time sync with user identity
  const { onlineUsers } = useMeetingRealtime({
    meetingId: meetingId!,
    userId: profile?.user_uuid,
    userName,
    avatarUrl: profile?.avatar_url || undefined,
    onSegmentChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
    },
    onHeadlineChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-headlines', meetingId] });
    },
  });

  // Attendance hook for auto-attendance
  const { 
    attendees, 
    addGuestSilent, 
    updateAttendanceSilent 
  } = useMeetingAttendance(meetingId);

  // Track if we've already auto-added the user this session
  const hasAutoAttended = useRef(false);

  // Computed segment states
  const currentSegment = useMemo(() => 
    segments?.find(s => s.started_at && !s.completed_at), 
    [segments]
  );
  
  const completedSegments = useMemo(() => 
    segments?.filter(s => s.completed_at) || [], 
    [segments]
  );
  
  const pendingSegments = useMemo(() => 
    segments?.filter(s => !s.started_at && !s.completed_at) || [], 
    [segments]
  );

  const meetingStarted = useMemo(() => 
    segments?.some(s => s.started_at), 
    [segments]
  );

  const allSegmentsComplete = useMemo(() => 
    segments?.length ? segments.every(s => s.completed_at) : false, 
    [segments]
  );

  // Auto-add current user as attendee when they join a live meeting
  useEffect(() => {
    if (!profile?.user_uuid || !meetingId || !meetingStarted || hasAutoAttended.current) return;
    
    const isAttendee = attendees?.some(a => a.user_id === profile.user_uuid);
    const isPresent = attendees?.some(
      a => a.user_id === profile.user_uuid && 
      (a.attendance_status === 'attended' || a.attendance_status === 'late')
    );
    
    // Auto-add and mark present
    if (!isAttendee) {
      hasAutoAttended.current = true;
      addGuestSilent.mutate({ userId: profile.user_uuid, notes: 'Auto-joined' });
    } else if (!isPresent) {
      hasAutoAttended.current = true;
      updateAttendanceSilent.mutate({ 
        userId: profile.user_uuid, 
        status: 'attended' 
      });
    }
  }, [profile?.user_uuid, attendees, meetingStarted, meetingId]);

  const isFacilitator = participants?.some(
    p => p.user_id === profile?.user_uuid && p.role === 'Leader'
  ) ?? true; // Default to true if no participants set yet

  // Start first segment mutation
  const startFirstSegment = useMutation({
    mutationFn: async () => {
      if (!segments?.length) throw new Error('No segments available');
      const firstSegment = segments.find(s => !s.started_at);
      if (!firstSegment) throw new Error('No pending segments');
      
      const now = new Date().toISOString();
      
      // Start the first segment
      const { error } = await supabase
        .from('eos_meeting_segments')
        .update({ started_at: now })
        .eq('id', firstSegment.id);
      
      if (error) throw error;

      // Update meeting to in_progress with started_at timestamp
      const { error: meetingError } = await supabase
        .from('eos_meetings')
        .update({ 
          status: 'in_progress',
          started_at: now,
          is_complete: false 
        })
        .eq('id', meetingId);

      if (meetingError) throw meetingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meeting', meetingId] });
      toast({ title: 'Meeting started' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error starting meeting', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddHeadline = async () => {
    if (!newHeadline.trim()) return;
    await createHeadline.mutateAsync({
      meeting_id: meetingId!,
      headline: newHeadline,
      is_good_news: isGoodNews,
    });
    setNewHeadline('');
  };

  const handleEndMeeting = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_meeting_summary', {
        p_meeting_id: meetingId!,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Meeting ended', description: 'Summary generated successfully' });
      navigate(`/eos/meetings/${meetingId}/summary`);
    },
    onError: (error: Error) => {
      toast({ title: 'Error ending meeting', description: error.message, variant: 'destructive' });
    },
  });

  const handleSelectIssue = (issue: any) => {
    setSelectedIssue(issue);
    setIdsDialogOpen(true);
  };

  // Throttled segment navigation handlers to prevent double-clicks
  const handleAdvanceSegment = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
      await advanceSegment.mutateAsync();
    } finally {
      // Keep disabled briefly to prevent double-clicks during re-render
      setTimeout(() => setIsNavigating(false), 500);
    }
  };

  const handlePreviousSegment = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
      await goToPreviousSegment.mutateAsync();
    } finally {
      setTimeout(() => setIsNavigating(false), 500);
    }
  };

  const handleToggleTodo = async (todo: any) => {
    const newStatus = todo.status === 'Complete' ? 'Open' : 'Complete';
    await updateTodo.mutateAsync({ 
      id: todo.id, 
      status: newStatus,
      completed_at: newStatus === 'Complete' ? new Date().toISOString() : null
    });
  };

  // Segment content helper
  const getSegmentType = (segmentName: string): string => {
    const name = segmentName.toLowerCase();
    if (name.includes('segue') || name.includes('check-in')) return 'segue';
    if (name.includes('scorecard')) return 'scorecard';
    if (name.includes('rock')) return 'rocks';
    if (name.includes('headline')) return 'headlines';
    if (name.includes('to-do') || name.includes('todo')) return 'todos';
    if (name.includes('ids') || name.includes('issue') || name.includes('tackle')) return 'ids';
    if (name.includes('conclude') || name.includes('next step') || name.includes('decisions')) return 'conclude';
    return 'general';
  };

  // Render segment content based on type
  const renderSegmentContent = (segment: EosMeetingSegment) => {
    const type = getSegmentType(segment.segment_name);

    switch (type) {
      case 'segue':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Personal & Professional Check-in
            </h3>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Share one personal and one professional best from the week. Rate the week 1-10.
              </p>
              <Textarea 
                placeholder="Meeting notes for this segment..."
                value={segmentNotes[segment.id] || segment.notes || ''}
                onChange={(e) => setSegmentNotes(prev => ({ ...prev, [segment.id]: e.target.value }))}
                rows={4}
              />
            </div>
          </Card>
        );

      case 'scorecard':
        return (
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Scorecard Review
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                Review weekly metrics. Flag any numbers off track.
              </p>
            </Card>
            {metrics?.slice(0, 5).map((metric) => (
              <ScorecardEntryGrid key={metric.id} metric={metric} />
            ))}
            {(!metrics || metrics.length === 0) && (
              <Card className="p-6">
                <p className="text-muted-foreground text-sm text-center">
                  No scorecard metrics configured. Add metrics in the Scorecard section.
                </p>
              </Card>
            )}
          </div>
        );

      case 'rocks':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Rock Review
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Quick status update only - On Track or Off Track. No discussion.
            </p>
            <div className="space-y-3">
              {rocks?.filter(r => r.status !== 'complete').map((rock) => (
                <Card key={rock.id} className="p-4 bg-muted/20">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium">{rock.title}</p>
                          <ClientBadge clientId={rock.client_id} />
                        </div>
                        {rock.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{rock.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs text-muted-foreground">
                        Due: {rock.due_date ? new Date(rock.due_date).toLocaleDateString() : 'Not set'}
                      </p>
                      <RockProgressControl rock={rock} compact />
                    </div>
                  </div>
                </Card>
              ))}
              {(!rocks || rocks.filter(r => r.status !== 'complete').length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No active rocks for this quarter
                </p>
              )}
            </div>
          </Card>
        );

      case 'headlines':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Headlines ({headlines?.length || 0})
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Share good news and FYIs. Customer/Employee Headlines.
            </p>
            
            {/* Add new headline */}
            <div className="space-y-2 mb-4">
              <Input
                placeholder="Share a headline..."
                value={newHeadline}
                onChange={(e) => setNewHeadline(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddHeadline()}
              />
              <div className="flex gap-2">
                <Button
                  variant={isGoodNews ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsGoodNews(true)}
                >
                  Good News
                </Button>
                <Button
                  variant={!isGoodNews ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsGoodNews(false)}
                >
                  FYI
                </Button>
                <Button
                  onClick={handleAddHeadline}
                  disabled={!newHeadline.trim() || createHeadline.isPending}
                  size="sm"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Headlines list */}
            <div className="space-y-2">
              {headlines?.map((headline) => (
                <div
                  key={headline.id}
                  className="flex items-start gap-2 p-3 rounded bg-muted/50"
                >
                  <Badge variant={headline.is_good_news ? 'default' : 'secondary'} className="shrink-0">
                    {headline.is_good_news ? '✓ Good' : 'FYI'}
                  </Badge>
                  <p className="flex-1 text-sm">{headline.headline}</p>
                  {headline.user_id === profile?.user_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteHeadline.mutate(headline.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {(!headlines || headlines.length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No headlines yet. Add the first one!
                </p>
              )}
            </div>
          </Card>
        );

      case 'todos':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" />
              To-Do List ({todos?.length || 0})
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Review last week's to-dos. Did you do it? Yes or No.
            </p>
            
            <div className="space-y-2 mb-4">
              {todos?.map((todo) => (
                <div 
                  key={todo.id} 
                  className={`p-3 rounded flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    todo.status === 'Complete' 
                      ? 'bg-green-500/10 border border-green-500/20' 
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                  onClick={() => handleToggleTodo(todo)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      todo.status === 'Complete' 
                        ? 'bg-green-500 border-green-500' 
                        : 'border-muted-foreground'
                    }`}>
                      {todo.status === 'Complete' && <CheckCircle className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium text-sm ${todo.status === 'Complete' ? 'line-through opacity-70' : ''}`}>
                        {todo.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due: {todo.due_date ? new Date(todo.due_date).toLocaleDateString() : 'Not set'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={todo.status === 'Complete' ? 'default' : 'secondary'}>
                    {todo.status === 'Complete' ? 'Done' : 'Open'}
                  </Badge>
                </div>
              ))}
              {(!todos || todos.length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No to-dos from last week
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Add new To-Do:</p>
              <TodoInlineForm
                meetingId={meetingId!}
                onTodoCreated={async (todo) => {
                  await createTodo.mutateAsync(todo);
                }}
              />
            </div>
          </Card>
        );

      case 'ids':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              IDS - Identify, Discuss, Solve
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Work through issues one at a time. Identify the real issue, Discuss, then Solve.
            </p>
            <IssuesQueue
              issues={issues || []}
              onSelectIssue={handleSelectIssue}
              onCreateIssue={() => setCreateIssueOpen(true)}
              isFacilitator={isFacilitator}
              currentMeetingId={meetingId}
            />
          </Card>
        );

      case 'conclude':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Conclude
            </h3>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-sm mb-2">Recap To-Dos Created:</p>
                <div className="space-y-1">
                  {todos?.filter(t => t.status !== 'Complete').slice(0, 5).map((todo) => (
                    <div key={todo.id} className="text-sm text-muted-foreground flex items-center gap-2">
                      <ArrowRight className="h-3 w-3" />
                      {todo.title}
                    </div>
                  ))}
                  {(!todos || todos.filter(t => t.status !== 'Complete').length === 0) && (
                    <p className="text-sm text-muted-foreground">No open to-dos</p>
                  )}
                </div>
              </div>
              <div>
                <p className="font-medium text-sm mb-2">Cascading Messages:</p>
                <Textarea 
                  placeholder="Key messages to cascade to the organization..."
                  rows={3}
                />
              </div>
            </div>
          </Card>
        );

      default:
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{segment.segment_name}</h3>
            <Textarea 
              placeholder="Notes for this segment..."
              value={segmentNotes[segment.id] || segment.notes || ''}
              onChange={(e) => setSegmentNotes(prev => ({ ...prev, [segment.id]: e.target.value }))}
              rows={4}
            />
          </Card>
        );
    }
  };

  // Loading state
  if (meetingLoading || segmentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Loading meeting...</p>
        </div>
      </div>
    );
  }

  // No meeting found
  if (!meeting) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-bold mb-2">Meeting Not Found</h2>
          <p className="text-muted-foreground mb-4">This meeting doesn't exist or you don't have access.</p>
          <Button onClick={() => navigate('/eos/meetings')}>Back to Meetings</Button>
        </div>
      </div>
    );
  }

  // No segments - prompt to add them
  if (!segments || segments.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-warning" />
          <h2 className="text-xl font-bold mb-2">No Agenda Loaded</h2>
          <p className="text-muted-foreground mb-4">
            This meeting doesn't have an agenda. The EOS agenda segments need to be configured.
          </p>
          <Button onClick={() => navigate('/eos/meetings')}>Back to Meetings</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{meeting.title}</h1>
            <p className="text-muted-foreground text-sm">
              {new Date(meeting.scheduled_date).toLocaleString()} • {meeting.meeting_type} Meeting
            </p>
          </div>
          <div className="flex items-center gap-4">
            <OnlineUsersIndicator onlineUsers={onlineUsers} attendees={attendees} />
            
            {!meetingStarted && isFacilitator && (
              <Button 
                onClick={() => setFacilitatorDialogOpen(true)} 
                size="sm"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Start Meeting
              </Button>
            )}
            
            {meetingStarted && isFacilitator && completedSegments.length > 0 && (
              <Button 
                onClick={handlePreviousSegment} 
                size="sm" 
                variant="outline"
                disabled={isNavigating || goToPreviousSegment.isPending}
              >
                <SkipBack className="h-4 w-4 mr-2" />
                Previous
              </Button>
            )}
            
            {meetingStarted && isFacilitator && currentSegment && (
              <Button 
                onClick={handleAdvanceSegment} 
                size="sm" 
                variant="outline"
                disabled={isNavigating || advanceSegment.isPending}
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Next Segment
              </Button>
            )}
            
            {meetingStarted && isFacilitator && (
              <Button
                onClick={() => setCloseDialogOpen(true)}
                size="sm"
                variant={allSegmentsComplete ? 'default' : 'outline'}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                End Meeting
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agenda Sidebar */}
        <div className="w-72 border-r bg-muted/20 overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-4">
            {/* Attendance Panel */}
            <AttendancePanel 
              meetingId={meetingId!} 
              meetingType={meeting?.meeting_type || 'L10'}
              meetingStatus={meeting?.status || 'scheduled'}
              isLive={meetingStarted}
              canEdit={isFacilitator}
              onlineUsers={onlineUsers}
            />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Agenda</h2>
              <Badge variant="outline" className="text-xs">
                {completedSegments.length}/{segments.length}
              </Badge>
            </div>
            
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(completedSegments.length / segments.length) * 100}%` }}
              />
            </div>

            <div className="space-y-2">
              {segments.map((segment, idx) => {
                const isActive = segment.id === currentSegment?.id;
                const isComplete = !!segment.completed_at;
                const isPending = !segment.started_at && !segment.completed_at;
                
                return (
                  <Card
                    key={segment.id}
                    className={`p-3 transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                        : isComplete
                        ? 'bg-muted/50 opacity-75'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5 ${
                        isComplete ? 'bg-primary text-primary-foreground' :
                        isActive ? 'bg-primary-foreground text-primary' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {isComplete ? <CheckCircle className="h-3 w-3" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${isComplete ? 'line-through' : ''}`}>
                          {segment.segment_name}
                        </p>
                        <div className="flex items-center gap-1 text-xs opacity-80">
                          <Timer className="h-3 w-3" />
                          {segment.duration_minutes} min
                        </div>
                      </div>
                      {isActive && (
                        <Badge variant="secondary" className="shrink-0 text-xs bg-primary-foreground text-primary">
                          Now
                        </Badge>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Not started state */}
            {!meetingStarted && (
              <Card className="p-8 text-center">
                <PlayCircle className="h-16 w-16 mx-auto mb-4 text-primary" />
                <h2 className="text-xl font-bold mb-2">Ready to Start</h2>
                <p className="text-muted-foreground mb-6">
                  This {meeting.meeting_type} meeting has {segments.length} agenda segments 
                  ({segments.reduce((sum, s) => sum + s.duration_minutes, 0)} minutes total).
                </p>
                {isFacilitator ? (
                  <Button 
                    size="lg"
                    onClick={() => setFacilitatorDialogOpen(true)}
                  >
                    <Play className="h-5 w-5 mr-2" />
                    Start Meeting
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Waiting for the facilitator to start the meeting...
                  </p>
                )}
              </Card>
            )}

            {/* Current Segment Header */}
            {currentSegment && (
              <Card className="p-6 bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="outline" className="mb-2">Current Segment</Badge>
                    <h2 className="text-2xl font-bold">{currentSegment.segment_name}</h2>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-lg font-mono">{currentSegment.duration_minutes}:00</span>
                    </div>
                    <p className="text-xs text-muted-foreground">minutes allocated</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Current Segment Content */}
            {currentSegment && renderSegmentContent(currentSegment)}

            {/* All segments complete */}
            {allSegmentsComplete && (
              <Card className="p-8 text-center bg-primary/5 border-primary/20">
                <CheckCircle className="h-16 w-16 mx-auto mb-4 text-primary" />
                <h2 className="text-xl font-bold mb-2">All Segments Complete!</h2>
                <p className="text-muted-foreground mb-6">
                  Great meeting! Click "End Meeting" to complete the meeting close checklist.
                </p>
                {isFacilitator && (
                  <Button 
                    size="lg"
                    onClick={() => setCloseDialogOpen(true)}
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    End Meeting & Complete Checklist
                  </Button>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* Right: Issues Panel */}
        <div className="w-80 border-l bg-card overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Issues Queue ({issues?.length || 0})
            </h3>
            <IssuesQueue
              issues={issues || []}
              onSelectIssue={handleSelectIssue}
              onCreateIssue={() => setCreateIssueOpen(true)}
              isFacilitator={isFacilitator}
              currentMeetingId={meetingId}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <IDSDialog
        open={idsDialogOpen}
        onOpenChange={setIdsDialogOpen}
        issue={selectedIssue}
        isFacilitator={isFacilitator}
        meetingId={meetingId}
      />

      <CreateIssueDialog
        open={createIssueOpen}
        onOpenChange={setCreateIssueOpen}
        meetingId={meetingId}
        meetingSegmentId={currentSegment?.id}
        context="meeting_ids"
      />

      <MeetingCloseValidationDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        meetingId={meetingId!}
        meetingType={(meeting?.meeting_type as MeetingType) || 'L10'}
        todosCount={todos?.length || 0}
        issuesDiscussed={meeting?.issues_discussed?.length || 0}
      />

      <FacilitatorSelectDialog
        open={facilitatorDialogOpen}
        onOpenChange={setFacilitatorDialogOpen}
        meetingId={meetingId!}
        onStartMeeting={() => startFirstSegment.mutate()}
        isStarting={startFirstSegment.isPending}
      />
    </div>
  );
};
