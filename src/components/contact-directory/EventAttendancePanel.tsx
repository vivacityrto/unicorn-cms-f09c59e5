import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exportToCSV } from '@/lib/exportCsv';
import { cn } from '@/lib/utils';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';
import { formatEventDate, formatEventDateTime } from '@/lib/teamsEvents/format';
import {
  buildParticipants,
  filterParticipants,
  participantCsvRows,
  participantStatusLabel,
  summariseParticipants,
  type RegistryEvent,
  type RegistryParticipant,
} from '@/lib/teamsEvents/registry';
import { loadEventParticipants } from '@/services/teamsEventRegistryService';
import { teamsEventsService, TeamsEventsError } from '@/services/teamsEventsService';
import { WalkInPanel } from './WalkInPanel';

interface Props {
  event: RegistryEvent;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'event';
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EventAttendancePanel({ event }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);

  const query = useQuery({
    queryKey: ['teams-event-participants', event.eventId],
    queryFn: () => loadEventParticipants(event.eventId),
  });

  const participants = useMemo(
    () => (query.data ? buildParticipants(query.data.items, query.data.attendance) : []),
    [query.data],
  );
  const tenantNames = useMemo(() => query.data?.tenantNames ?? new Map<number, string>(), [query.data]);
  const started = new Date(event.startUtc).getTime() <= Date.now();
  const summary = useMemo(() => summariseParticipants(participants, event.startUtc), [participants, event.startUtc]);
  const visible = useMemo(() => filterParticipants(participants, search, tenantNames), [participants, search, tenantNames]);
  const listedEmails = useMemo(() => new Set(participants.map((p) => p.email.toLowerCase())), [participants]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teams-event-participants', event.eventId] }),
      queryClient.invalidateQueries({ queryKey: ['teams-registry-events'] }),
    ]);
  };

  const mark = async (memberKey: string, attended: boolean, label: string) => {
    setBusyKey(memberKey);
    try {
      await teamsEventsService.setAttendance(event.eventId, memberKey, attended);
      await refresh();
      toast.success(attended ? `${label} marked as attended` : `${label} marked as not attended`);
    } catch (error) {
      toast.error(error instanceof TeamsEventsError ? error.message : 'Could not save attendance. Please try again.');
    } finally {
      setBusyKey(null);
    }
  };

  const addWalkIn = (person: DirectoryPerson) =>
    mark(person.row_key, true, [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email);

  const exportCsv = () => {
    exportToCSV(
      participantCsvRows(event.name, visible, tenantNames, started, formatEventDateTime),
      `teams_event_${slug(event.name)}_participants`,
    );
  };

  const statusBadge = (p: RegistryParticipant) => {
    const label = participantStatusLabel(p, started);
    if (p.status === 'cancelled') return <Badge variant="outline">{label}</Badge>;
    if (p.status === 'walk_in') return <Badge variant="secondary">{label}</Badge>;
    if (p.attended) return <Badge>{label}</Badge>;
    return <Badge variant="outline">{label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{event.name}</h2>
        <p className="text-sm text-muted-foreground">
          {formatEventDateTime(event.startUtc)} · First registered in Unicorn {formatEventDate(event.firstRegisteredAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Registered" value={summary.registered} />
        <Stat label="Attended" value={summary.attended} />
        <Stat label="No-show" value={summary.noShow ?? '—'} hint={summary.noShow === null ? 'After the event starts' : undefined} />
        <Stat label="Walk-ins" value={summary.walkIns} hint="Attended, not registered" />
        <Stat label="Cancelled" value={summary.cancelled} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a participant by name, email or client…"
            aria-label="Find a participant"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setShowWalkIn((v) => !v)}>
          <UserPlus className="mr-2 h-4 w-4" />
          {showWalkIn ? 'Close walk-in' : 'Add walk-in'}
        </Button>
        <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {showWalkIn && <WalkInPanel listedEmails={listedEmails} busyKey={busyKey} onAdd={addWalkIn} />}

      {query.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading participants…
        </p>
      )}
      {query.isError && <p className="text-sm text-destructive">Could not load the participants. Please refresh.</p>}

      {query.data && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Attended</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Registered in Unicorn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {participants.length === 0 ? 'Nobody is registered for this event yet.' : 'Nobody matches that search.'}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((p) => {
                const cancelled = p.status === 'cancelled';
                return (
                  <TableRow key={p.emailKey} className={cn(cancelled && 'text-muted-foreground opacity-60')}>
                    <TableCell>
                      {busyKey === p.memberKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" />
                      ) : (
                        <Checkbox
                          checked={p.attended}
                          disabled={cancelled || busyKey !== null}
                          aria-label={`Attended: ${p.name}`}
                          onCheckedChange={(checked) => mark(p.memberKey, checked === true, p.name)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.email}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {p.tenantId != null ? (tenantNames.get(p.tenantId) ?? '') : ''}
                    </TableCell>
                    <TableCell>{statusBadge(p)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.registeredAt ? formatEventDateTime(p.registeredAt) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Attendance is ticked by hand. Cancelled registrations are greyed out; if someone cancelled but still attended, add them as a walk-in.
      </p>
    </div>
  );
}
