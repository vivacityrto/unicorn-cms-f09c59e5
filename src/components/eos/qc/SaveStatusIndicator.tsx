import { useEffect, useState } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusIndicatorProps {
  isSaving: boolean;
  isError: boolean;
  /** Trigger value — changes whenever a save completes successfully */
  lastSavedKey?: number;
}

export const SaveStatusIndicator = ({ isSaving, isError, lastSavedKey }: SaveStatusIndicatorProps) => {
  const [state, setState] = useState<SaveState>('idle');

  useEffect(() => {
    if (isSaving) {
      setState('saving');
    } else if (isError) {
      setState('error');
    } else if (state === 'saving') {
      setState('saved');
      const timer = setTimeout(() => setState('idle'), 3000);
      return () => clearTimeout(timer);
    }
    // Intentionally reads `state` as a guard without depending on it: adding it would
    // make this effect re-fire on its own `setState('saved')` above, cancelling the
    // idle-revert timer via the cleanup-then-rerun cycle before it ever fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving, isError]);

  // Also transition to saved when lastSavedKey changes
  useEffect(() => {
    if (lastSavedKey && lastSavedKey > 0 && !isSaving) {
      setState('saved');
      const timer = setTimeout(() => setState('idle'), 3000);
      return () => clearTimeout(timer);
    }
    // Intentionally scoped to `lastSavedKey` only: this should fire when a save
    // completes, not whenever `isSaving` toggles on its own (that's the other
    // effect's job) -- adding it would double-fire/race the two idle-revert timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSavedKey]);

  if (state === 'idle') return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      {state === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-green-600">All changes saved</span>
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" />
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </span>
  );
};
