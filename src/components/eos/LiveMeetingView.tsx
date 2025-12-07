import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMeetingRealtime } from '@/hooks/useMeetingRealtime';
import { useEosMeetingSegments } from '@/hooks/useEosMeetingSegments';
import { useEosHeadlines } from '@/hooks/useEosHeadlines';
import { useMeetingIssues } from '@/hooks/useMeetingIssues';
import { useMeetingTodos } from '@/hooks/useMeetingTodos';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Play, SkipForward, CheckCircle, Clock, Users, X, Target, TrendingUp, AlertCircle, ListTodo } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useEosRocks } from '@/hooks/useEos';
import { useEosScorecardMetrics } from '@/hooks/useEos';
import { RockProgressControl } from '@/components/eos/RockProgressControl';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { ScorecardEntryGrid } from '@/components/eos/ScorecardEntryGrid';
import { IssuesQueue } from '@/components/eos/IssuesQueue';
import { IDSDialog } from '@/components/eos/IDSDialog';
import { TodoInlineForm } from '@/components/eos/TodoInlineForm';
import { CreateIssueDialog } from '@/components/eos/CreateIssueDialog';

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

  // Use custom hooks
  const { segments, advanceSegment } = useEosMeetingSegments(meetingId);
  const { headlines, createHeadline, deleteHeadline } = useEosHeadlines(meetingId);
  const { issues } = useMeetingIssues(meetingId);
  const { todos, createTodo } = useMeetingTodos(meetingId);
  const { rocks } = useEosRocks();
  const { metrics } = useEosScorecardMetrics();

  // Fetch meeting details
  const { data: meeting } = useQuery({
    queryKey: ['eos-meeting', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('*')
        .eq('id', meetingId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
  });

  // Fetch participants
  const { data: participants } = useQuery({
    queryKey: ['eos-meeting-participants', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_participants')
        .select('*, users(first_name, last_name)')
        .eq('meeting_id', meetingId!);
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
  });

  // Real-time sync
  const { onlineUsers } = useMeetingRealtime({
    meetingId: meetingId!,
    onSegmentChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
    },
    onHeadlineChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-headlines', meetingId] });
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

  const currentSegment = segments?.find(s => s.started_at && !s.completed_at);
  const isFacilitator = participants?.some(
    p => p.user_id === profile?.user_uuid && p.role === 'Leader'
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{meeting?.title}</h1>
            <p className="text-muted-foreground text-sm">
              {new Date(meeting?.scheduled_date || '').toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="text-sm">{onlineUsers.length} online</span>
            </div>
            {isFacilitator && currentSegment && (
              <>
                <Button onClick={() => advanceSegment.mutate()} size="sm" variant="outline">
                  <SkipForward className="h-4 w-4 mr-2" />
                  Next Segment
                </Button>
                <Button
                  onClick={() => handleEndMeeting.mutate()}
                  size="sm"
                  disabled={handleEndMeeting.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  End Meeting
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agenda */}
        <div className="w-64 border-r bg-muted/20 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h2 className="font-semibold mb-4">Agenda</h2>
            <div className="space-y-2">
              {segments?.map((segment, idx) => (
                <Card
                  key={segment.id}
                  className={`p-3 ${
                    segment.id === currentSegment?.id
                      ? 'bg-primary text-primary-foreground'
                      : segment.completed_at
                      ? 'bg-muted'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{segment.segment_name}</span>
                    {segment.completed_at && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {segment.id === currentSegment?.id && (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <span className="text-xs opacity-80">{segment.duration_minutes} min</span>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Current Segment */}
            {currentSegment && (
              <Card className="p-6">
                <h2 className="text-2xl font-bold mb-2">{currentSegment.segment_name}</h2>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{currentSegment.duration_minutes} minutes allocated</span>
                </div>
              </Card>
            )}

            {/* Scorecard Section */}
            {currentSegment?.segment_name.toLowerCase().includes('scorecard') && (
              <div className="space-y-4">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Scorecard Review
                  </h3>
                </Card>
                {metrics?.slice(0, 3).map((metric) => (
                  <ScorecardEntryGrid key={metric.id} metric={metric} />
                ))}
                {(!metrics || metrics.length === 0) && (
                  <Card className="p-6">
                    <p className="text-muted-foreground text-sm text-center">
                      No metrics configured yet
                    </p>
                  </Card>
                )}
              </div>
            )}

            {/* Rock Review Section */}
            {currentSegment?.segment_name.toLowerCase().includes('rock') && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Rock Review
                </h3>
                <div className="space-y-3">
                  {rocks?.filter(r => r.status !== 'complete').slice(0, 5).map((rock) => (
                    <Card key={rock.id} className="p-4 bg-muted/20">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="font-medium">{rock.title}</p>
                              <ClientBadge clientId={rock.client_id} />
                            </div>
                            {rock.description && (
                              <p className="text-sm text-muted-foreground">{rock.description}</p>
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
                      No active rocks
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* IDS (Issues) Section */}
            {currentSegment?.segment_name.toLowerCase().includes('ids') || currentSegment?.segment_name.toLowerCase().includes('issue') && (
              <Card className="p-6">
                <IssuesQueue
                  issues={issues || []}
                  onSelectIssue={handleSelectIssue}
                  onCreateIssue={() => setCreateIssueOpen(true)}
                  isFacilitator={isFacilitator || false}
                />
              </Card>
            )}

            {/* To-Dos Section */}
            {currentSegment?.segment_name.toLowerCase().includes('todo') && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  To-Dos ({todos?.length || 0})
                </h3>
                
                <div className="space-y-3 mb-4">
                  {todos?.map((todo) => (
                    <div key={todo.id} className="p-3 bg-muted/50 rounded flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{todo.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Due: {todo.due_date ? new Date(todo.due_date).toLocaleDateString() : 'Not set'}
                        </p>
                      </div>
                      <Badge variant={todo.status === 'complete' ? 'default' : 'secondary'}>
                        {todo.status}
                      </Badge>
                    </div>
                  ))}
                  {(!todos || todos.length === 0) && (
                    <p className="text-muted-foreground text-sm text-center py-4">
                      No to-dos yet
                    </p>
                  )}
                </div>

                <TodoInlineForm
                  meetingId={meetingId!}
                  onTodoCreated={async (todo) => {
                    await createTodo.mutateAsync(todo);
                  }}
                />
              </Card>
            )}

            {/* Headlines Section */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Headlines</h3>
              
              {/* Add new headline */}
              <div className="space-y-2 mb-4">
                <Input
                  placeholder="Share a headline..."
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
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
                    className="flex items-start gap-2 p-2 rounded bg-muted/50"
                  >
                    <Badge variant={headline.is_good_news ? 'default' : 'secondary'}>
                      {headline.is_good_news ? '✓' : 'i'}
                    </Badge>
                    <p className="flex-1">{headline.headline}</p>
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
                    No headlines yet
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Right: Issues Panel (always visible during meeting) */}
        <div className="w-80 border-l bg-card overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <IssuesQueue
              issues={issues || []}
              onSelectIssue={handleSelectIssue}
              onCreateIssue={() => setCreateIssueOpen(true)}
              isFacilitator={isFacilitator || false}
            />
          </div>
        </div>
      </div>

      {/* IDS Dialog */}
      <IDSDialog
        open={idsDialogOpen}
        onOpenChange={setIdsDialogOpen}
        issue={selectedIssue}
        isFacilitator={isFacilitator || false}
      />

      {/* Create Issue Dialog */}
      <CreateIssueDialog
        open={createIssueOpen}
        onOpenChange={setCreateIssueOpen}
        meetingId={meetingId}
      />
    </div>
  );
};
