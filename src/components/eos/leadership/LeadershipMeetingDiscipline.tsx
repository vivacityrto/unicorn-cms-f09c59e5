import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { LeadershipMeetingDiscipline as MeetingDisciplineType } from '@/hooks/useLeadershipDashboard';

interface LeadershipMeetingDisciplineProps {
  meetingDiscipline: MeetingDisciplineType;
}

export function LeadershipMeetingDiscipline({ meetingDiscipline }: LeadershipMeetingDisciplineProps) {
  const quarterlyStatusLabels = {
    not_scheduled: { label: 'Not Scheduled', variant: 'destructive' as const },
    scheduled: { label: 'Scheduled', variant: 'secondary' as const },
    completed: { label: 'Completed', variant: 'default' as const },
  };

  const quarterlyStatus = quarterlyStatusLabels[meetingDiscipline.quarterlyMeetingStatus];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Meeting Discipline</CardTitle>
          <CardDescription>EOS meeting execution summary</CardDescription>
        </div>
        <Link 
          to="/eos/meetings"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View Meetings
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Last L10 */}
          <div className={cn(
            'p-4 rounded-lg border',
            meetingDiscipline.missedL10Warning && 'border-destructive/50 bg-destructive/5'
          )}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Calendar className="h-4 w-4" />
              Last L10
            </div>
            {meetingDiscipline.lastL10Date ? (
              <>
                <div className="font-semibold">
                  {format(new Date(meetingDiscipline.lastL10Date), 'MMM d')}
                </div>
                {meetingDiscipline.missedL10Warning && (
                  <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    L10 missed
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">None</div>
            )}
          </div>

          {/* Attendance */}
          <div className={cn(
            'p-4 rounded-lg border',
            !meetingDiscipline.quorumMet && meetingDiscipline.lastL10Date && 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20'
          )}>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Users className="h-4 w-4" />
              Attendance
            </div>
            <div className="font-semibold">
              {meetingDiscipline.lastL10AttendancePercentage}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {meetingDiscipline.quorumMet ? (
                <span className="text-emerald-600">Quorum met</span>
              ) : (
                <span className="text-amber-600">Quorum not met</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <CheckCircle className="h-4 w-4" />
              Actions
            </div>
            <div className="font-semibold">
              {meetingDiscipline.actionsClosed}/{meetingDiscipline.actionsCreated}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              closed from last L10
            </div>
          </div>

          {/* Quarterly */}
          <div className="p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Calendar className="h-4 w-4" />
              Quarterly
            </div>
            <Badge variant={quarterlyStatus.variant}>
              {quarterlyStatus.label}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
