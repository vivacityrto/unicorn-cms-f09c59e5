import { User, ChevronDown, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface SharedCalendarOwner {
  user_uuid: string;
  full_name: string;
  scope: 'busy_only' | 'details';
}

interface CalendarOwnerSelectorProps {
  selectedOwnerId: string | null;
  onSelectOwner: (ownerId: string | null) => void;
  sharedCalendars: SharedCalendarOwner[];
  currentUserName?: string;
}

export function CalendarOwnerSelector({
  selectedOwnerId,
  onSelectOwner,
  sharedCalendars,
  currentUserName = 'My Calendar',
}: CalendarOwnerSelectorProps) {
  const selectedCalendar = selectedOwnerId
    ? sharedCalendars.find((c) => c.user_uuid === selectedOwnerId)
    : null;

  const displayName = selectedCalendar ? selectedCalendar.full_name : currentUserName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Calendar className="h-4 w-4" />
          <span>{displayName}</span>
          {selectedCalendar && (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {selectedCalendar.scope === 'busy_only' ? 'Busy' : 'Details'}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => onSelectOwner(null)}
          className="gap-2"
        >
          <User className="h-4 w-4" />
          <span>{currentUserName}</span>
          {!selectedOwnerId && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </DropdownMenuItem>

        {sharedCalendars.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Shared with me
            </div>
            {sharedCalendars.map((calendar) => (
              <DropdownMenuItem
                key={calendar.user_uuid}
                onClick={() => onSelectOwner(calendar.user_uuid)}
                className="gap-2"
              >
                <User className="h-4 w-4" />
                <span className="flex-1">{calendar.full_name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {calendar.scope === 'busy_only' ? 'Busy' : 'Details'}
                </Badge>
                {selectedOwnerId === calendar.user_uuid && (
                  <span className="ml-1 text-primary">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
