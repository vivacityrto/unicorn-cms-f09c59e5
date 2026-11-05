import { ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useSignOffMilestone } from '@/hooks/useMilestoneSignOff';

export interface SignOffTarget {
  id: string;
  label: string;
  exitCriteria: string | null;
  /** Already passed through safeExternalUrl; null when there is none or it is not safe to link. */
  evidenceHref: string | null;
  cautions: string[];
}

interface SignOffMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SignOffTarget;
}

/**
 * Signing off says a person has checked the work against its "Done when" and is
 * satisfied. The dialog puts those in front of them first. Cautions are shown, never
 * enforced: delivery progress is only a hint.
 */
export function SignOffMilestoneDialog({ open, onOpenChange, target }: SignOffMilestoneDialogProps) {
  const signOff = useSignOffMilestone();
  const returnFocus = useReturnFocus(open);

  const confirm = async () => {
    try {
      await signOff.mutateAsync({ id: target.id });
      onOpenChange(false);
    } catch {
      // The mutation has already said what went wrong; stay open so the person can read it.
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !signOff.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Sign off this milestone</DialogTitle>
          <DialogDescription className="break-words">
            “{target.label}” will be marked complete. Check it against what “done” meant before you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Done when</p>
            <p className="mt-0.5 break-words">{target.exitCriteria ?? <span className="text-muted-foreground">Not recorded</span>}</p>
          </div>
          {target.evidenceHref && (
            <a
              href={target.evidenceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open the evidence
            </a>
          )}
          {target.cautions.length > 0 && (
            <div
              role="note"
              aria-label="Before you sign off"
              className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Worth a second look
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {target.cautions.map(caution => <li key={caution}>{caution}</li>)}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={signOff.isPending}>Cancel</Button>
          <Button type="button" onClick={() => void confirm()} disabled={signOff.isPending}>
            {signOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Sign off milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
