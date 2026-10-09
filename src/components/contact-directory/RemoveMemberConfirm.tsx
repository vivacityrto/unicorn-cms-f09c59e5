import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { describeCancelOutcomes, type DescribedOutcome } from '@/lib/teamsEvents/cancelResults';
import { formatEventDateTime } from '@/lib/teamsEvents/format';
import { parseRowKey, removePersonFromGroup } from '@/services/contactGroupsService';
import {
  findUpcomingRegistrations,
  teamsEventsService,
  TeamsEventsError,
  type UpcomingRegistration,
} from '@/services/teamsEventsService';
import { CancelResultsList } from './CancelResultsList';

export interface RemoveMemberRequest {
  groupId: number;
  groupName: string;
  /** Directory row key, e.g. `user:12` or `contact:5`. */
  memberKey: string;
  memberName: string;
}

interface Props {
  request: RemoveMemberRequest | null;
  onClose: () => void;
  /** Called after the person has been removed, so the caller can refresh its lists. */
  onRemoved: () => void;
  /**
   * When true (the user holds the Teams events permission), the dialog also lists the
   * upcoming events this person is registered for through Unicorn and offers to cancel
   * each registration. Nothing is cancelled unless a box is ticked.
   */
  canCancelRegistrations?: boolean;
}

interface EventResult {
  registration: UpcomingRegistration;
  described: DescribedOutcome[] | null;
  /** Set when the request itself failed (e.g. not configured), so there are no per-person results. */
  errorText?: string;
}

/**
 * Confirms, then removes one person from one group (they stay in the directory).
 * Optionally also cancels their Teams registration for upcoming events.
 */
export function RemoveMemberConfirm({ request, onClose, onRemoved, canCancelRegistrations = false }: Props) {
  const [working, setWorking] = useState(false);
  const [registrations, setRegistrations] = useState<UpcomingRegistration[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<EventResult[] | null>(null);

  useEffect(() => {
    setRegistrations([]);
    setChosen(new Set());
    setResults(null);
    if (!request || !canCancelRegistrations) return;
    let cancelled = false;
    findUpcomingRegistrations(request.memberKey).then((found) => {
      if (!cancelled) setRegistrations(found);
    });
    return () => {
      cancelled = true;
    };
  }, [request, canCancelRegistrations]);

  const toggle = (eventId: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });

  const confirm = async () => {
    if (!request) return;
    const parsed = parseRowKey(request.memberKey);
    if (!parsed) {
      toast.error('Could not identify that person');
      return;
    }
    setWorking(true);
    const removal = await removePersonFromGroup(request.groupId, parsed.source, parsed.id);
    if (removal.ok === false) {
      setWorking(false);
      toast.error(removal.message);
      return;
    }
    onRemoved();

    const toCancel = registrations.filter((r) => chosen.has(r.eventId));
    if (toCancel.length === 0) {
      setWorking(false);
      toast.success(`Removed ${request.memberName} from ${request.groupName}`);
      onClose();
      return;
    }

    const person = [{ key: request.memberKey, name: request.memberName }];
    const collected: EventResult[] = [];
    for (const registration of toCancel) {
      try {
        const response = await teamsEventsService.cancelRegistrations(registration.eventId, [request.memberKey]);
        collected.push({ registration, described: describeCancelOutcomes(response.outcomes, person) });
      } catch (e) {
        collected.push({
          registration,
          described: null,
          errorText: e instanceof TeamsEventsError ? e.message : 'The cancellation request failed.',
        });
      }
    }
    setWorking(false);
    setResults(collected);
  };

  const showingResults = results !== null;

  return (
    <AlertDialog open={!!request} onOpenChange={(open) => !open && !working && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{showingResults ? 'Removed from group' : 'Remove from group?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {showingResults
              ? `${request?.memberName} was removed from "${request?.groupName}". Here is what happened to their Teams registrations.`
              : `Remove ${request?.memberName} from "${request?.groupName}". They stay in the Contact Directory.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!showingResults && (
          <>
            {registrations.length > 0 ? (
              <fieldset className="space-y-2 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">Their upcoming Teams registrations</legend>
                {registrations.map((r) => (
                  <div key={r.eventId} className="flex items-start gap-2">
                    <Checkbox
                      id={`cancel-${r.eventId}`}
                      checked={chosen.has(r.eventId)}
                      onCheckedChange={() => toggle(r.eventId)}
                      disabled={working}
                    />
                    <Label htmlFor={`cancel-${r.eventId}`} className="text-sm font-normal normal-case leading-snug tracking-normal text-foreground">
                      Also cancel their registration for <strong>{r.eventName}</strong>
                      <span className="block text-xs text-muted-foreground">{formatEventDateTime(r.startUtc)}</span>
                    </Label>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Only registrations made through Unicorn are listed. Nothing is cancelled unless you tick it.
                </p>
              </fieldset>
            ) : (
              <p className="text-sm text-muted-foreground">
                Teams registrations they already hold are not changed.
                {canCancelRegistrations ? ' Unicorn has no upcoming registration for them.' : ''}
              </p>
            )}
          </>
        )}

        {showingResults && (
          <div className="space-y-4">
            {results.map((r) => (
              <div key={r.registration.eventId} className="space-y-1">
                <p className="text-sm font-medium">
                  {r.registration.eventName} · {formatEventDateTime(r.registration.startUtc)}
                </p>
                {r.described ? (
                  <CancelResultsList eventName={r.registration.eventName} described={r.described} />
                ) : (
                  <p role="alert" className="text-sm text-destructive">
                    {r.errorText} They are still registered. Remove them in Teams yourself.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter>
          {showingResults ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={confirm} disabled={working}>
                {working ? 'Working…' : chosen.size > 0 ? `Remove and cancel ${chosen.size}` : 'Remove'}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
