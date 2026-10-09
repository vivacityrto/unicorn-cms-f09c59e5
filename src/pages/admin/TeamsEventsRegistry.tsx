import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EventAttendancePanel } from '@/components/contact-directory/EventAttendancePanel';
import { usePermissionDetailed } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { formatEventDate, formatEventDateTime } from '@/lib/teamsEvents/format';
import { loadRegistryEvents } from '@/services/teamsEventRegistryService';

/**
 * Events registry: every Teams webinar registered through Unicorn, who was
 * registered, and a manual attendance check per participant.
 */
export default function TeamsEventsRegistry() {
  // UI gate only: RLS and the attendance Edge Function re-authorise server-side.
  const permission = usePermissionDetailed('teams_events.manage_registrations', 'full');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['teams-registry-events'],
    queryFn: loadRegistryEvents,
    enabled: permission.granted,
  });

  // Most recent first for browsing; the list helper returns soonest first.
  const events = useMemo(() => [...(eventsQuery.data ?? [])].reverse(), [eventsQuery.data]);
  const selected = events.find((e) => e.eventId === selectedId) ?? null;

  const header = (
    <PageHeader
      title="Events registry"
      description="Teams webinars registered through Unicorn: who was registered, and who actually attended."
      icon={CalendarCheck}
      actions={
        <Button variant="outline" asChild>
          <Link to="/administration/contacts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Contact Directory
          </Link>
        </Button>
      }
    />
  );

  if (permission.isLoading) {
    return (
      <div className="space-y-6 p-6">
        {header}
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (!permission.granted) {
    return (
      <div className="space-y-6 p-6">
        {header}
        <p className="text-sm text-muted-foreground">You do not have access to the Events registry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {header}

      {eventsQuery.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </p>
      )}
      {eventsQuery.isError && <p className="text-sm text-destructive">Could not load the Events registry. Please refresh.</p>}
      {eventsQuery.data && events.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No events yet. An event appears here once people have been registered for it from the Contact Directory.
        </p>
      )}

      {events.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Event date</TableHead>
                <TableHead className="hidden md:table-cell">First registered in Unicorn</TableHead>
                <TableHead className="text-right">Registered</TableHead>
                <TableHead className="text-right">Attended</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow
                  key={event.eventId}
                  tabIndex={0}
                  aria-selected={event.eventId === selectedId}
                  className={cn('cursor-pointer', event.eventId === selectedId && 'bg-muted')}
                  onClick={() => setSelectedId(event.eventId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(event.eventId);
                    }
                  }}
                >
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell>{formatEventDateTime(event.startUtc)}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatEventDate(event.firstRegisteredAt)}</TableCell>
                  <TableCell className="text-right">{event.registered}</TableCell>
                  <TableCell className="text-right">{event.attended}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && <EventAttendancePanel key={selected.eventId} event={selected} />}
      {!selected && events.length > 0 && (
        <p className="text-sm text-muted-foreground">Select an event to see its participants and record attendance.</p>
      )}
    </div>
  );
}
