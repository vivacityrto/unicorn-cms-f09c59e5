import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { 
  Video, MapPin, Building2, Timer, Clock, 
  AlertCircle, CheckCircle2, Calendar
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Meeting } from '@/hooks/useMeetings';
import { cn } from '@/lib/utils';

interface MeetingsListProps {
  meetings: Meeting[];
  onMeetingClick?: (meeting: Meeting) => void;
  onCreateTimeDraft?: (meetingId: string) => void;
  onLinkToClient?: (meetingId: string) => void;
}

export function MeetingsList({
  meetings,
  onMeetingClick,
  onCreateTimeDraft,
  onLinkToClient,
}: MeetingsListProps) {
  if (meetings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">No meetings found</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or sync your calendar
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group meetings by date
  const groupedMeetings = meetings.reduce((acc, meeting) => {
    const dateKey = format(new Date(meeting.starts_at), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(meeting);
    return acc;
  }, {} as Record<string, Meeting[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedMeetings).map(([dateKey, dayMeetings]) => {
        const date = new Date(dateKey);
        const dateLabel = isToday(date) 
          ? 'Today' 
          : isTomorrow(date) 
            ? 'Tomorrow' 
            : format(date, 'EEEE, MMMM d');

        return (
          <div key={dateKey}>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {dateLabel}
            </h3>
            <div className="space-y-2">
              {dayMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onClick={() => onMeetingClick?.(meeting)}
                  onCreateTimeDraft={onCreateTimeDraft}
                  onLinkToClient={onLinkToClient}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MeetingCard({
  meeting,
  onClick,
  onCreateTimeDraft,
  onLinkToClient,
}: {
  meeting: Meeting;
  onClick?: () => void;
  onCreateTimeDraft?: (meetingId: string) => void;
  onLinkToClient?: (meetingId: string) => void;
}) {
  const isBusyOnly = meeting.access_scope === 'busy_only';
  const isOwner = meeting.access_scope === 'owner';
  const isCompleted = meeting.status === 'completed';
  const isCancelled = meeting.status === 'cancelled';
  const startTime = new Date(meeting.starts_at);
  const endTime = new Date(meeting.ends_at);
  const hasPassed = isPast(endTime);

  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationLabel = hours > 0 
    ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
    : `${minutes}m`;

  return (
    <Card 
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent/50',
        isCancelled && 'opacity-60'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Time column */}
          <div className="text-sm text-muted-foreground w-20 flex-shrink-0">
            <div className="font-medium text-foreground">
              {format(startTime, 'HH:mm')}
            </div>
            <div className="text-xs">{durationLabel}</div>
          </div>

          {/* Icon */}
          <div className={cn(
            'p-2 rounded-md flex-shrink-0',
            meeting.is_online ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {meeting.is_online ? (
              <Video className="h-4 w-4" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className={cn(
                  'font-medium text-sm',
                  isCancelled && 'line-through'
                )}>
                  {meeting.title}
                </h4>
                {meeting.location && !isBusyOnly && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {meeting.location}
                  </p>
                )}
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {meeting.client_id && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="h-6 gap-1">
                        <Building2 className="h-3 w-3" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Linked to client</TooltipContent>
                  </Tooltip>
                )}

                {meeting.time_draft_created && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-6 gap-1 text-primary border-primary/30">
                        <Timer className="h-3 w-3" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Time draft created</TooltipContent>
                  </Tooltip>
                )}

                {isCancelled && (
                  <Badge variant="destructive" className="h-6">
                    Cancelled
                  </Badge>
                )}

                {isCompleted && !isCancelled && (
                  <Badge variant="outline" className="h-6 text-green-600 border-green-600/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Done
                  </Badge>
                )}
              </div>
            </div>

            {/* Alerts and quick actions */}
            {isOwner && hasPassed && !isCancelled && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {meeting.needs_linking && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLinkToClient?.(meeting.id);
                    }}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Link to client
                  </Button>
                )}

                {!meeting.time_draft_created && isCompleted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateTimeDraft?.(meeting.id);
                    }}
                  >
                    <Timer className="h-3 w-3 mr-1" />
                    Create time draft
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
