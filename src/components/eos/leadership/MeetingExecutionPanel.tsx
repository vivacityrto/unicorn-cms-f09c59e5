import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  ExternalLink,
  Play,
  Eye
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export interface MeetingSeriesData {
  type: 'L10' | 'Quarterly' | 'Annual' | 'Same_Page';
  label: string;
  nextMeeting: {
    id: string;
    date: string;
    status: string;
  } | null;
  lastMeeting: {
    id: string;
    date: string;
    attendanceRate: number;
    quorumMet: boolean;
    minutesStatus: 'draft' | 'final' | 'signed_off' | 'none';
    todosCreated: number;
    idsAdded: number;
  } | null;
}

interface MeetingExecutionPanelProps {
  meetingSeries: MeetingSeriesData[];
}

const meetingTypeStyles = {
  L10: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300' },
  Quarterly: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-300' },
  Annual: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300' },
  Same_Page: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300' },
};

const minutesStatusStyles = {
  draft: { label: 'Draft', variant: 'secondary' as const },
  final: { label: 'Final', variant: 'default' as const },
  signed_off: { label: 'Signed Off', variant: 'outline' as const },
  none: { label: 'None', variant: 'outline' as const },
};

export function MeetingExecutionPanel({ meetingSeries }: MeetingExecutionPanelProps) {
  if (meetingSeries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meeting Execution</CardTitle>
          <CardDescription>EOS meeting series overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No meeting series configured</p>
            <Link to="/eos/meetings" className="text-sm text-primary hover:underline">
              Set up meetings →
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Meeting Execution</CardTitle>
          <CardDescription>Recurring meeting series status and discipline</CardDescription>
        </div>
        <Link 
          to="/eos/meetings"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          All Meetings
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {meetingSeries.map((series) => {
            const styles = meetingTypeStyles[series.type];
            const quorumIssue = series.lastMeeting && !series.lastMeeting.quorumMet;
            
            return (
              <div 
                key={series.type}
                className={cn(
                  'p-4 rounded-lg border',
                  styles.bg,
                  styles.border,
                  quorumIssue && 'ring-2 ring-amber-400'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('font-semibold', styles.text)}>
                    {series.label}
                  </div>
                  {series.nextMeeting && (
                    <Link to={`/eos/meetings/${series.nextMeeting.id}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    </Link>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Next Meeting */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Next:</span>
                    {series.nextMeeting ? (
                      <span className="font-medium">
                        {format(new Date(series.nextMeeting.date), 'MMM d, h:mm a')}
                      </span>
                    ) : (
                      <span className="text-amber-600">Not scheduled</span>
                    )}
                  </div>

                  {/* Last Meeting */}
                  {series.lastMeeting ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Last:</span>
                        <span>
                          {format(new Date(series.lastMeeting.date), 'MMM d')}
                          <span className="text-muted-foreground ml-1">
                            ({formatDistanceToNow(new Date(series.lastMeeting.date), { addSuffix: true })})
                          </span>
                        </span>
                      </div>

                      {/* Attendance & Quorum */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{series.lastMeeting.attendanceRate}% attended</span>
                        </div>
                        {series.lastMeeting.quorumMet ? (
                          <Badge variant="outline" className="text-xs text-emerald-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Quorum
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            No Quorum
                          </Badge>
                        )}
                      </div>

                      {/* Minutes Status */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Minutes:</span>
                        </div>
                        <Badge variant={minutesStatusStyles[series.lastMeeting.minutesStatus].variant} className="text-xs">
                          {minutesStatusStyles[series.lastMeeting.minutesStatus].label}
                        </Badge>
                      </div>

                      {/* Actions Summary */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
                        <span>{series.lastMeeting.todosCreated} To-Dos created</span>
                        <span>{series.lastMeeting.idsAdded} IDS items</span>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex gap-2 pt-2">
                        <Link to={`/eos/meetings/${series.lastMeeting.id}/minutes`} className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-7">
                            <Eye className="h-3 w-3 mr-1" />
                            View Minutes
                          </Button>
                        </Link>
                        <Link to={`/eos/meetings/${series.lastMeeting.id}/attendance`} className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-7">
                            <Users className="h-3 w-3 mr-1" />
                            Attendance
                          </Button>
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      No previous meetings
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
