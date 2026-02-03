import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  Users, 
  Play,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserMinus,
  ExternalLink
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export interface NextMeetingData {
  id: string;
  meetingType: 'L10' | 'Quarterly' | 'Annual' | 'Same_Page';
  scheduledDate: string;
  status: string;
  expectedAttendees: number;
  confirmedAttendees: number;
  quorumForecast: 'likely' | 'at_risk' | 'unlikely';
  missingSeatRoles: string[];
  integratorPresent: boolean;
  visionaryPresent: boolean;
}

interface NextMeetingCardProps {
  meeting: NextMeetingData | null;
  isLoading?: boolean;
}

const meetingTypeLabels: Record<string, string> = {
  L10: 'Level 10',
  Quarterly: 'Quarterly Planning',
  Annual: 'Annual Planning',
  Same_Page: 'Same Page',
};

const meetingTypeStyles: Record<string, { bg: string; border: string; text: string }> = {
  L10: { 
    bg: 'bg-blue-50 dark:bg-blue-950/30', 
    border: 'border-blue-200 dark:border-blue-800', 
    text: 'text-blue-700 dark:text-blue-300' 
  },
  Quarterly: { 
    bg: 'bg-purple-50 dark:bg-purple-950/30', 
    border: 'border-purple-200 dark:border-purple-800', 
    text: 'text-purple-700 dark:text-purple-300' 
  },
  Annual: { 
    bg: 'bg-emerald-50 dark:bg-emerald-950/30', 
    border: 'border-emerald-200 dark:border-emerald-800', 
    text: 'text-emerald-700 dark:text-emerald-300' 
  },
  Same_Page: { 
    bg: 'bg-amber-50 dark:bg-amber-950/30', 
    border: 'border-amber-200 dark:border-amber-800', 
    text: 'text-amber-700 dark:text-amber-300' 
  },
};

export function NextMeetingCard({ meeting, isLoading }: NextMeetingCardProps) {
  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Next Meeting</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!meeting) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Next Meeting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="mb-2">No upcoming meetings scheduled</p>
            <Link to="/eos/meetings">
              <Button variant="outline" size="sm">
                Schedule Meeting
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const styles = meetingTypeStyles[meeting.meetingType] || meetingTypeStyles.L10;
  const meetingDate = new Date(meeting.scheduledDate);
  const isNow = isPast(meetingDate) && !isPast(new Date(meetingDate.getTime() + 90 * 60000)); // Within 90 min of start

  const getQuorumBadge = () => {
    switch (meeting.quorumForecast) {
      case 'likely':
        return (
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Quorum Likely
          </Badge>
        );
      case 'at_risk':
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Quorum at Risk
          </Badge>
        );
      case 'unlikely':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Quorum Unlikely
          </Badge>
        );
    }
  };

  const getDateLabel = () => {
    if (isToday(meetingDate)) return 'Today';
    if (isTomorrow(meetingDate)) return 'Tomorrow';
    return format(meetingDate, 'EEEE, MMM d');
  };

  return (
    <Card className={cn('border-2', styles.border, isNow && 'ring-2 ring-primary')}>
      <CardHeader className={cn('pb-3', styles.bg)}>
        <div className="flex items-center justify-between">
          <CardTitle className={cn('text-lg flex items-center gap-2', styles.text)}>
            <Calendar className="h-5 w-5" />
            {meetingTypeLabels[meeting.meetingType]}
          </CardTitle>
          {isNow && (
            <Badge className="bg-primary text-primary-foreground animate-pulse">
              Starting Now
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Date & Time */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-lg">{getDateLabel()}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {format(meetingDate, 'h:mm a')}
              <span className="mx-1">·</span>
              {formatDistanceToNow(meetingDate, { addSuffix: true })}
            </div>
          </div>
          <Link to={`/eos/meetings/${meeting.id}`}>
            <Button size="lg" className="gap-2">
              <Play className="h-4 w-4" />
              {isNow ? 'Join Meeting' : 'Start Meeting'}
            </Button>
          </Link>
        </div>

        {/* Attendance Forecast */}
        <div className="flex items-center justify-between py-2 border-t border-b">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {meeting.confirmedAttendees} / {meeting.expectedAttendees} confirmed
            </span>
          </div>
          {getQuorumBadge()}
        </div>

        {/* Key Role Presence */}
        {(meeting.missingSeatRoles.length > 0 || !meeting.integratorPresent || !meeting.visionaryPresent) && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Required Roles</div>
            <div className="flex flex-wrap gap-2">
              <Badge 
                variant={meeting.integratorPresent ? 'outline' : 'destructive'}
                className={cn(
                  'text-xs',
                  meeting.integratorPresent && 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                )}
              >
                {meeting.integratorPresent ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <UserMinus className="h-3 w-3 mr-1" />}
                Integrator
              </Badge>
              <Badge 
                variant={meeting.visionaryPresent ? 'outline' : 'secondary'}
                className={cn(
                  'text-xs',
                  meeting.visionaryPresent && 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                )}
              >
                {meeting.visionaryPresent ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <UserMinus className="h-3 w-3 mr-1" />}
                Visionary
              </Badge>
            </div>
            {meeting.missingSeatRoles.length > 0 && (
              <div className="text-xs text-amber-600">
                Missing: {meeting.missingSeatRoles.join(', ')}
              </div>
            )}
          </div>
        )}

        {/* View All Link */}
        <Link 
          to="/eos/meetings"
          className="flex items-center justify-center gap-1 text-sm text-primary hover:underline pt-2"
        >
          View All Meetings
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
