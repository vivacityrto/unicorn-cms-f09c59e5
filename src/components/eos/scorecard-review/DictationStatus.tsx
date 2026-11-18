import { type ReactNode } from 'react';
import { CheckCircle2, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOptionalScorecardNotesDictation } from '@/features/eos-scorecard/useScorecardNotesDictation';

interface DictationStatusProps {
  /** The area on screen, or null at the wrap-up. */
  currentCategory: string | null;
  nameOf: (category: string) => string;
  /** Shown when there is nothing to say about dictation or notes. */
  fallback: ReactNode;
}

/**
 * One fixed place, beside Next, that says where the microphone is writing and confirms each save, so a presenter
 * who talks through every slide never wonders which area a note is going to, or whether Next kept it.
 */
export function DictationStatus({ currentCategory, nameOf, fallback }: DictationStatusProps) {
  const notes = useOptionalScorecardNotesDictation();
  if (!notes) return <>{fallback}</>;

  const { isRecording, activeCategory, handingOverFrom, lastSaved } = notes;
  const quoted = (category: string) => `“${nameOf(category)}”`;

  let status: ReactNode = null;
  if (handingOverFrom) {
    status = (
      <span className="flex min-w-0 items-center justify-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        <span className="min-w-0 truncate">Saving your note for {quoted(handingOverFrom)}…</span>
      </span>
    );
  } else if (isRecording && activeCategory) {
    status = (
      <span className="flex min-w-0 items-center justify-center gap-2">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
        <span className="min-w-0 truncate" title="Next saves this note and keeps listening for the next area">Listening · notes go to {quoted(activeCategory)}</span>
        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => notes.stopMic()}>
          <Square className="h-3 w-3 fill-current" aria-hidden />Stop
        </Button>
      </span>
    );
  } else if (lastSaved) {
    status = (
      <span className="flex min-w-0 items-center justify-center gap-1.5 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">Saved your note for {quoted(lastSaved.category)}</span>
      </span>
    );
  } else if (currentCategory && notes.isDirty(currentCategory)) {
    status = <span className="block truncate">Unsaved note for {quoted(currentCategory)} · Next saves it</span>;
  }

  if (!status) return <>{fallback}</>;
  return (
    <p role="status" aria-live="polite" className="min-w-0 flex-1 px-2 text-center text-xs text-foreground">
      {status}
    </p>
  );
}
