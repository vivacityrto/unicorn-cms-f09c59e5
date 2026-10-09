import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  MANUAL_REMOVAL_STEPS,
  needsManualRemoval,
  type DescribedOutcome,
} from '@/lib/teamsEvents/cancelResults';

interface Props {
  eventName: string;
  described: DescribedOutcome[];
}

/** Per-person result of a cancellation, plus the "remove them in Teams yourself" fallback. */
export function CancelResultsList({ eventName, described }: Props) {
  const manual = needsManualRemoval(described);
  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {described.map((d) => (
          <li key={d.key} className="flex items-start gap-2">
            {d.status === 'cancelled' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />}
            {d.status === 'not_registered' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            {d.status === 'failed' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />}
            <span>
              {d.text}
              {d.reason && <span className="block text-xs text-muted-foreground">{d.reason}</span>}
            </span>
          </li>
        ))}
      </ul>

      {manual.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Remove {manual.length === 1 ? 'this person' : 'these people'} in Teams yourself</AlertTitle>
          <AlertDescription>
            <span className="block">
              {manual.map((m) => m.name).join(', ')} {manual.length === 1 ? 'is' : 'are'} still registered for "{eventName}".
            </span>
            <span className="mt-1 block">{MANUAL_REMOVAL_STEPS}</span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
