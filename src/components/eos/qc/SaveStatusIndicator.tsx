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
  }, [isSaving, isError]);

  // Also transition to saved when lastSavedKey changes
  useEffect(() => {
    if (lastSavedKey && lastSavedKey > 0 && !isSaving) {
      setState('saved');
      const timer = setTimeout(() => setState('idle'), 3000);
      return () => clearTimeout(timer);
    }
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
