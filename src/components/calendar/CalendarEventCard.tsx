import { CSSProperties } from 'react';
import { format } from 'date-fns';
import { Clock, MapPin, Users, Building2, Timer, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/hooks/useWorkCalendar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface CalendarEventCardProps {
  event: CalendarEvent;
  style?: CSSProperties;
  onClick?: () => void;
  onCreateTimeDraft?: (eventId: string) => void;
  onLinkToClient?: (eventId: string) => void;
  compact?: boolean;
}

export function CalendarEventCard({
  event,
  style,
  onClick,
  onCreateTimeDraft,
  onLinkToClient,
  compact = false,
}: CalendarEventCardProps) {
  const isBusyOnly = event.access_scope === 'busy_only';
  const hasClient = !!event.client_id;
  const startTime = format(new Date(event.start_at), 'HH:mm');
  const endTime = format(new Date(event.end_at), 'HH:mm');

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'rounded px-2 py-1 text-xs cursor-pointer overflow-hidden transition-colors group',
              isBusyOnly
                ? 'bg-muted/80 text-muted-foreground hover:bg-muted'
                : hasClient
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
            )}
            style={style}
            onClick={onClick}
          >
            <div className="truncate font-medium">{event.title}</div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {startTime} - {endTime}
            </p>
            {event.location && (
              <p className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {event.location}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md px-2 py-1.5 text-xs cursor-pointer overflow-hidden transition-colors group',
        isBusyOnly
          ? 'bg-muted/80 text-muted-foreground hover:bg-muted'
          : hasClient
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-primary/20 text-primary hover:bg-primary/30'
      )}
      style={style}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{event.title}</div>
          <div className="flex items-center gap-1 text-[10px] opacity-80 mt-0.5">
            <Clock className="h-3 w-3" />
            <span>{startTime} - {endTime}</span>
          </div>
        </div>
        
        {/* Status badges */}
        {hasClient && (
          <Badge variant="secondary" className="h-4 px-1 text-[9px] flex-shrink-0">
            <Building2 className="h-2.5 w-2.5" />
          </Badge>
        )}
      </div>

      {/* Location */}
      {event.location && !isBusyOnly && (
        <div className="flex items-center gap-1 text-[10px] opacity-70 mt-1 truncate">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>
      )}

      {/* Quick actions - show on hover */}
      {!isBusyOnly && event.access_scope === 'owner' && (
        <div className="hidden group-hover:flex items-center gap-1 mt-1.5 pt-1 border-t border-current/10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTimeDraft?.(event.id);
                }}
              >
                <Timer className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create time draft</TooltipContent>
          </Tooltip>

          {!hasClient && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLinkToClient?.(event.id);
                  }}
                >
                  <LinkIcon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Link to client</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
