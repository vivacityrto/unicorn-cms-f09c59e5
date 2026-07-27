import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Target, MessageSquare, Star, Users, Heart } from 'lucide-react';
import { format } from 'date-fns';
import type { EosMeetingSummary } from '@/types/eos';

interface MeetingSummaryCardProps {
  summary: EosMeetingSummary;
}

const ROCK_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  on_track: 'default',
  off_track: 'destructive',
  at_risk: 'destructive',
  not_started: 'secondary',
};

const ROCK_STATUS_LABEL: Record<string, string> = {
  on_track: 'On Track',
  off_track: 'Off Track',
  at_risk: 'At Risk',
  not_started: 'Not Started',
};

export function MeetingSummaryCard({ summary }: MeetingSummaryCardProps) {
  const todos = Array.isArray(summary.todos) ? summary.todos : [];
  const issues = Array.isArray(summary.issues) ? summary.issues : [];
  const headlines = Array.isArray(summary.headlines) ? summary.headlines : [];
  const rocks = Array.isArray(summary.rocks) ? summary.rocks : [];
  const cascades = Array.isArray(summary.cascades) ? summary.cascades : [];
  const attendance = Array.isArray(summary.attendance) ? summary.attendance : [];
  const segueShares = Array.isArray(summary.segue_shares) ? summary.segue_shares : [];

  const solvedIssues = issues.filter((i: any) => i.status === 'Solved');
  const unsolvedIssues = issues.filter((i: any) => i.status !== 'Solved');

  const attendedCount = attendance.filter((a: any) => a.attended).length;
  const attendancePct = attendance.length > 0 ? Math.round((attendedCount / attendance.length) * 100) : 0;
  const quorumMet = attendance.length === 0 || attendedCount >= Math.ceil(attendance.length * 0.5);

  // Segue shares only carry user_id (no bridging FK to public.users - same
  // reason the live view resolves names in a separate query rather than
  // an embed hint).
  const segueUserIds = segueShares.map((s: any) => s.user_id).filter(Boolean);
  const { data: segueUsers } = useQuery({
    queryKey: ['summary-segue-users', summary.id, segueUserIds],
    queryFn: async () => {
      if (segueUserIds.length === 0) return {};
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', segueUserIds);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((u: any) => [u.user_uuid, `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown'])
      );
    },
    enabled: segueUserIds.length > 0,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Meeting Summary</h2>
              <p className="text-sm text-muted-foreground">
                Generated on {format(new Date(summary.created_at), 'PPP')}
              </p>
            </div>
            {summary.rating != null && (
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                <span className="text-2xl font-bold">{summary.rating}/10</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance */}
      {attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {attendedCount}/{attendance.length} attended ({attendancePct}%)
              </span>
              <Badge variant={quorumMet ? 'default' : 'destructive'}>
                {quorumMet ? 'Quorum Met' : 'Quorum Not Met'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rocks */}
      {rocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Rocks Reviewed ({rocks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rocks.map((rock: any, index: number) => (
                <div key={index} className="p-3 bg-muted/50 rounded flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{rock.title}</p>
                    <Badge variant="outline" className="text-xs mt-1">
                      {rock.rock_level === 'company' ? 'Company' : rock.rock_level === 'individual' ? 'Individual' : 'Team'}
                    </Badge>
                  </div>
                  <Badge variant={ROCK_STATUS_VARIANT[rock.status] ?? 'secondary'}>
                    {ROCK_STATUS_LABEL[rock.status] ?? rock.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* To-Dos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            To-Dos ({todos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todos.length > 0 ? (
            <div className="space-y-2">
              {todos.map((todo: any, index: number) => (
                <div key={index} className="p-3 bg-muted/50 rounded flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{todo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due: {todo.due_date ? format(new Date(todo.due_date), 'PP') : 'No date'}
                    </p>
                  </div>
                  <Badge variant={todo.status === 'complete' ? 'default' : 'secondary'}>
                    {todo.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No to-dos created</p>
          )}
        </CardContent>
      </Card>

      {/* Issues */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Issues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {solvedIssues.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-green-600">Solved ({solvedIssues.length})</h4>
              {solvedIssues.map((issue: any, index: number) => (
                <div key={index} className="p-3 bg-green-50 border border-green-200 rounded">
                  <p className="font-medium text-sm">{issue.title}</p>
                  {issue.solution && (
                    <p className="text-xs text-muted-foreground mt-1">{issue.solution}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {unsolvedIssues.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-yellow-600">Carry Forward ({unsolvedIssues.length})</h4>
              {unsolvedIssues.map((issue: any, index: number) => (
                <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm flex-1">{issue.title}</p>
                    <Badge variant="outline">{issue.priority}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {issues.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No issues discussed</p>
          )}
        </CardContent>
      </Card>

      {/* Headlines */}
      {headlines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Headlines ({headlines.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {headlines.map((headline: any, index: number) => (
                <div
                  key={index}
                  className={`p-3 rounded ${
                    headline.is_good_news ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
                  }`}
                >
                  <Badge variant={headline.is_good_news ? 'default' : 'secondary'} className="mb-2">
                    {headline.is_good_news ? 'Good News' : 'FYI'}
                  </Badge>
                  <p className="text-sm">{headline.headline}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Segue shares */}
      {segueShares.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Personal & Professional Check-in ({segueShares.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {segueShares.map((share: any, index: number) => (
                <div key={index} className="p-3 bg-muted/50 rounded space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{segueUsers?.[share.user_id] ?? 'Unknown'}</p>
                    {share.rating != null && (
                      <Badge variant="secondary">{share.rating}/10</Badge>
                    )}
                  </div>
                  <p className="text-sm"><span className="font-medium">Personal:</span> {share.personal_win}</p>
                  <p className="text-sm"><span className="font-medium">Professional:</span> {share.professional_win}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cascades */}
      {cascades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cascade Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cascades.map((cascade: any, index: number) => (
                <div key={index} className="p-3 bg-muted/50 rounded">
                  <p className="text-sm">{cascade.message || cascade}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
