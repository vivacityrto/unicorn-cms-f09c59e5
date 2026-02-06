import { format } from 'date-fns';
import { Clock, MapPin, Users, Building2, Timer, Link as LinkIcon, ExternalLink, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CalendarEvent } from '@/hooks/useWorkCalendar';

interface CalendarEventDetailDialogProps {
  event: CalendarEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTimeDraft?: (eventId: string) => void;
  onLinkToClient?: (eventId: string) => void;
}

export function CalendarEventDetailDialog({
  event,
  open,
  onOpenChange,
  onCreateTimeDraft,
  onLinkToClient,
}: CalendarEventDetailDialogProps) {
  const isBusyOnly = event.access_scope === 'busy_only';
  const isOwner = event.access_scope === 'owner';
  const startTime = new Date(event.start_at);
  const endTime = new Date(event.end_at);
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationLabel = hours > 0 
    ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`
    : `${minutes}m`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold break-words">
                {event.title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                {event.client_id && (
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    Client linked
                  </Badge>
                )}
                {isBusyOnly && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Busy time
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-medium">
                {format(startTime, 'EEEE, MMMM d, yyyy')}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')} ({durationLabel})
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && !isBusyOnly && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm">{event.location}</div>
            </div>
          )}

          {/* Meeting URL */}
          {event.meeting_url && !isBusyOnly && (
            <div className="flex items-start gap-3">
              <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
              <a
                href={event.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Join meeting
              </a>
            </div>
          )}

          {/* Attendees */}
          {event.attendees?.list && event.attendees.list.length > 0 && !isBusyOnly && (
            <div className="flex items-start gap-3">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">
                  {event.attendees.list.length} attendee{event.attendees.list.length !== 1 ? 's' : ''}
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {event.attendees.list.slice(0, 5).map((attendee: any, i: number) => (
                    <div key={i}>
                      {attendee.name || attendee.email}
                    </div>
                  ))}
                  {event.attendees.list.length > 5 && (
                    <div>+{event.attendees.list.length - 5} more</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && !isBusyOnly && (
            <>
              <Separator />
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {event.description}
              </div>
            </>
          )}

          {/* Actions for owner */}
          {isOwner && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    onCreateTimeDraft?.(event.id);
                    onOpenChange(false);
                  }}
                >
                  <Timer className="h-4 w-4" />
                  Create time draft
                </Button>
                {!event.client_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      onLinkToClient?.(event.id);
                      onOpenChange(false);
                    }}
                  >
                    <LinkIcon className="h-4 w-4" />
                    Link to client
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
