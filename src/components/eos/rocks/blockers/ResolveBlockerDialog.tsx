import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useResolveBlocker } from '@/hooks/useRockBlockers';
import { defaultResumeStatus, resumeOptions, type BlockerRow, type BlockerSubject } from '@/utils/rockBlocker';

interface ResolveBlockerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: BlockerSubject;
  subjectId: string;
  subjectLabel: string;
  blocker: BlockerRow | null;
}

/**
 * Resolving a blocker removes the obstacle, nothing more. The person says what
 * state the work resumes in; Complete is never offered, so clearing a blocker
 * cannot mark work done.
 */
export function ResolveBlockerDialog({ open, onOpenChange, subject, subjectId, subjectLabel, blocker }: ResolveBlockerDialogProps) {
  const resolve = useResolveBlocker();
  const returnFocus = useReturnFocus(open);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setStatus(defaultResumeStatus(subject, blocker?.status_before));
      setNote('');
    }
  }, [open, subject, blocker?.id, blocker?.status_before]);

  const confirm = async () => {
    try {
      await resolve.mutateAsync({ subject, id: subjectId, status, note });
      onOpenChange(false);
    } catch {
      // The mutation has already said what went wrong; stay open so the choice is not lost.
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !resolve.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Resolve this blocker</DialogTitle>
          <DialogDescription className="break-words">
            “{subjectLabel}” stops being blocked. Resolving does not mark it complete, so choose where it picks up.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">It resumes as</legend>
          <RadioGroup value={status} onValueChange={setStatus} className="grid gap-2">
            {resumeOptions(subject).map(option => (
              <div key={option.value} className="flex items-center gap-2">
                <RadioGroupItem id={`resume-${option.value}`} value={option.value} />
                <Label htmlFor={`resume-${option.value}`} className="font-normal">
                  {option.label}
                  {option.value === blocker?.status_before && <span className="ml-1.5 text-xs text-muted-foreground">(what it was before)</span>}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="resolve-note">How it was resolved (optional)</Label>
          <Textarea id="resolve-note" value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={1000} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={resolve.isPending}>Cancel</Button>
          <Button type="button" onClick={() => void confirm()} disabled={resolve.isPending || !status}>
            {resolve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Resolve blocker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
