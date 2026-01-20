import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  Target, 
  AlertTriangle,
  FileText,
  ListTodo,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { MeetingInstance } from '@/hooks/useMeetingSeries';

interface PastMeetingSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingInstance;
}

export function PastMeetingSummary({ open, onOpenChange, meeting }: PastMeetingSummaryProps) {
  // Fetch related data for the meeting
  const { data: todos } = useQuery({
    queryKey: ['meeting-todos', meeting.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_todos')
        .select('*')
        .eq('meeting_id', meeting.id);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: headlines } = useQuery({
    queryKey: ['meeting-headlines', meeting.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_headlines')
        .select('*')
        .eq('meeting_id', meeting.id);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: segments } = useQuery({
    queryKey: ['meeting-segments', meeting.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_segments')
        .select('*')
        .eq('meeting_id', meeting.id)
        .order('sequence_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: ratings } = useQuery({
    queryKey: ['meeting-ratings', meeting.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_ratings')
        .select('*')
        .eq('meeting_id', meeting.id);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: minutesVersion } = useQuery({
    queryKey: ['meeting-minutes', meeting.id],
    queryFn: async () => {
      if (!meeting.current_minutes_version_id) return null;
      const { data, error } = await supabase
        .from('eos_meeting_minutes_versions')
        .select('*')
        .eq('id', meeting.current_minutes_version_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!meeting.current_minutes_version_id,
  });

  const averageRating = ratings?.length 
    ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
    : null;

  const getMeetingTypeColor = (type: string) => {
    switch (type) {
      case 'L10': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Quarterly': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'Annual': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Same_Page': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'closed':
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Meeting Summary
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Meeting Header */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold">{meeting.title}</h2>
                <Badge className={getMeetingTypeColor(meeting.meeting_type)}>
                  {meeting.meeting_type}
                </Badge>
                {getStatusBadge(meeting.status as string)}
              </div>

              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(meeting.scheduled_date), 'EEEE, MMMM d, yyyy')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {meeting.actual_duration_minutes || meeting.duration_minutes || 90} min
                  {meeting.actual_duration_minutes && meeting.duration_minutes && 
                    meeting.actual_duration_minutes !== meeting.duration_minutes && (
                      <span className="text-xs">
                        (planned: {meeting.duration_minutes} min)
                      </span>
                    )}
                </span>
                {meeting.location && (
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {meeting.location}
                  </span>
                )}
              </div>

              {averageRating && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Meeting Rating:</span>
                  <Badge variant="outline" className="text-lg font-bold">
                    {averageRating}/10
                  </Badge>
                  <span className="text-muted-foreground">
                    ({ratings?.length} {ratings?.length === 1 ? 'rating' : 'ratings'})
                  </span>
                </div>
              )}
            </div>

            <Separator />

            {/* Agenda Snapshot */}
            {(meeting.agenda_snapshot || segments) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Agenda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(meeting.agenda_snapshot as any[])?.map((segment: any, idx: number) => (
                      <div key={segment.id || idx} className="flex items-center justify-between text-sm py-1">
                        <span>{segment.segment_name}</span>
                        <span className="text-muted-foreground">{segment.duration_minutes} min</span>
                      </div>
                    )) || segments?.map((segment) => (
                      <div key={segment.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <span>{segment.segment_name}</span>
                          {segment.completed_at && (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          )}
                        </div>
                        <span className="text-muted-foreground">{segment.duration_minutes} min</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* To-Dos Created */}
            {todos && todos.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ListTodo className="w-4 h-4" />
                    To-Dos Created ({todos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {todos.map((todo) => (
                      <div key={todo.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          {todo.status === 'Complete' ? (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                          )}
                          <span className={todo.status === 'Complete' ? 'line-through text-muted-foreground' : ''}>
                            {todo.title}
                          </span>
                        </div>
                        {todo.due_date && (
                          <span className="text-xs text-muted-foreground">
                            Due: {format(new Date(todo.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Headlines */}
            {headlines && headlines.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Headlines Shared ({headlines.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {headlines.map((headline) => (
                      <div key={headline.id} className="flex items-start gap-2 text-sm py-1">
                        <span className={headline.is_good_news ? 'text-emerald-600' : 'text-amber-600'}>
                          {headline.is_good_news ? '👍' : '👎'}
                        </span>
                        <span>{headline.headline}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Issues Discussed */}
            {meeting.issues_discussed && meeting.issues_discussed.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Issues Discussed ({meeting.issues_discussed.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {meeting.issues_discussed.map((issueId, idx) => (
                      <div key={issueId} className="text-sm py-1">
                        Issue #{idx + 1}: {issueId}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Minutes Version Info */}
            {minutesVersion && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Minutes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Version</span>
                      <span className="font-medium">{minutesVersion.version_number}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <Badge variant={minutesVersion.is_locked ? 'secondary' : 'outline'}>
                        {minutesVersion.is_locked ? 'Locked' : minutesVersion.is_final ? 'Final' : 'Draft'}
                      </Badge>
                    </div>
                    {minutesVersion.change_summary && (
                      <div className="pt-2">
                        <span className="text-muted-foreground">Notes: </span>
                        {minutesVersion.change_summary}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {meeting.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{meeting.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
