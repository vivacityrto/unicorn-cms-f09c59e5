import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useCancelTeamsRegistrations } from '@/hooks/useTeamsEventRegistration';
import {
  describeCancelOutcomes,
  settledKeys,
  type DescribedOutcome,
  type NamedPerson,
} from '@/lib/teamsEvents/cancelResults';
import { formatEventDateTime } from '@/lib/teamsEvents/format';
import { TeamsEventsError } from '@/services/teamsEventsService';
import { CancelResultsList } from './CancelResultsList';

export interface CancelRegistrationsRequest {
  eventId: string;
  eventName: string;
  startUtc: string;
  people: NamedPerson[];
}

interface Props {
  request: CancelRegistrationsRequest | null;
  onClose: () => void;
  /** Called after the dialog is dismissed with the people who are now off the event. */
  onSettled: (keys: string[]) => void;
}

/** Confirms, then cancels the given people's registrations for one event, and shows exactly what happened. */
export function CancelRegistrationsDialog({ request, onClose, onSettled }: Props) {
  const cancel = useCancelTeamsRegistrations();
  const [described, setDescribed] = useState<DescribedOutcome[] | null>(null);
  const [settled, setSettled] = useState<string[]>([]);

  useEffect(() => {
    if (!request) {
      setDescribed(null);
      setSettled([]);
      cancel.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;

  const run = async () => {
    try {
      const result = await cancel.mutateAsync({ eventId: request.eventId, memberKeys: request.people.map((p) => p.key) });
      setDescribed(describeCancelOutcomes(result.outcomes, request.people));
      setSettled(settledKeys(result.outcomes));
    } catch {
      // surfaced via cancel.error below
    }
  };

  const finish = () => {
    onSettled(settled);
    onClose();
  };

  const names = request.people.map((p) => p.name).join(', ');

  return (
    <AlertDialog open onOpenChange={(open) => !open && !cancel.isPending && (described ? finish() : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{described ? 'Cancellation result' : 'Cancel registration?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {described
              ? `"${request.eventName}" · ${formatEventDateTime(request.startUtc)}`
              : `Cancel ${names}'s registration for "${request.eventName}" on ${formatEventDateTime(request.startUtc)}? Teams will treat them as no longer registered.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {described && <CancelResultsList eventName={request.eventName} described={described} />}
        {cancel.error && (
          <p role="alert" className="text-sm text-destructive">
            {cancel.error instanceof TeamsEventsError ? cancel.error.message : 'Something went wrong. Please try again.'}
          </p>
        )}

        <AlertDialogFooter>
          {described ? (
            <Button onClick={finish}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>
                Keep registered
              </Button>
              <Button variant="destructive" onClick={run} disabled={cancel.isPending}>
                {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cancel registration
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
