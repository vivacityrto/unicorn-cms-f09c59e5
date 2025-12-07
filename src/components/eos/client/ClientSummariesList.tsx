import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { format } from 'date-fns';
import type { UserProfile } from '@/types/eos';

interface MeetingSummary {
  id: string;
  meeting_id: string;
  created_at: string;
  meeting_title: string;
  meeting_date: string;
  todos: any;
  issues: any;
}

export function ClientSummariesList() {
  const { profile } = useAuth();
  const clientId = (profile as UserProfile)?.client_id;

  const { data: summaries, isLoading } = useQuery({
    queryKey: ['client-summaries', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase.rpc('list_meeting_summaries_for_client', {
        p_client_id: clientId,
        p_limit: 20,
        p_offset: 0,
      });
      
      if (error) throw error;
      return data as MeetingSummary[];
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return <TableSkeleton rows={3} />;
  }

  if (!summaries || summaries.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No meeting summaries yet"
        description="Summaries from completed meetings will appear here"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {summaries.map((summary) => {
        const todosList = Array.isArray(summary.todos) ? summary.todos : [];
        const issuesList = Array.isArray(summary.issues) ? summary.issues : [];
        const completedTodos = todosList.filter((t: any) => t.status === 'Complete').length;
        const solvedIssues = issuesList.filter((i: any) => i.status === 'Solved').length;

        return (
          <Card key={summary.id} className="hover:shadow-card-hover transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    {summary.meeting_title}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(summary.meeting_date), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{completedTodos} / {todosList.length} To-Dos</span>
                  </div>
                  {todosList.slice(0, 3).map((todo: any, idx: number) => (
                    <p key={idx} className="text-xs text-muted-foreground pl-6">
                      • {todo.title}
                    </p>
                  ))}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{solvedIssues} / {issuesList.length} Issues Solved</span>
                  </div>
                  {issuesList.slice(0, 3).map((issue: any, idx: number) => (
                    <p key={idx} className="text-xs text-muted-foreground pl-6">
                      • {issue.title}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
