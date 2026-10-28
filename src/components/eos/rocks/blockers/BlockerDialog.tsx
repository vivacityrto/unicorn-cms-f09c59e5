import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSetBlocker } from '@/hooks/useRockBlockers';
import { todayLocalIso } from '@/utils/localDate';
import {
  blockerToForm,
  emptyBlockerForm,
  validateBlockerForm,
  type BlockerErrors,
  type BlockerForm,
  type BlockerRow,
  type BlockerSubject,
  type DependencyKind,
} from '@/utils/rockBlocker';

export interface PickOption {
  id: string;
  label: string;
}

interface BlockerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: BlockerSubject;
  subjectId: string;
  /** What is being blocked, named in the heading so there is no doubt which item this is. */
  subjectLabel: string;
  /** The open blocker when editing; null when recording a new one. */
  existing: BlockerRow | null;
  people: PickOption[];
  /** Other Rocks this could depend on. */
  rockOptions: PickOption[];
  /** Milestones on the same Rock this could depend on. */
  milestoneOptions: PickOption[];
}

const FIELD_ORDER: Array<keyof BlockerErrors> = ['reason', 'dependency', 'reviewDate', 'evidenceUrl', 'text'];
const NONE = '__none__';

/**
 * Record or edit a blocker. Only the reason is required, so it can be done in the
 * middle of a meeting; the rest is there to make the blocker actionable. Saving
 * a new blocker is what sets the status to blocked, in one step on the server.
 */
export function BlockerDialog({
  open,
  onOpenChange,
  subject,
  subjectId,
  subjectLabel,
  existing,
  people,
  rockOptions,
  milestoneOptions,
}: BlockerDialogProps) {
  const save = useSetBlocker();
  const [form, setForm] = useState<BlockerForm>(emptyBlockerForm);
  const [showErrors, setShowErrors] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const dependencyRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLInputElement>(null);
  const evidenceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(existing ? blockerToForm(existing) : emptyBlockerForm());
      setShowErrors(false);
    }
  }, [open, existing, subjectId]);

  const todayIso = todayLocalIso();
  const { errors, valid } = validateBlockerForm(form, todayIso, { subjectId, originalReviewDate: existing?.review_date });
  const shown: BlockerErrors = showErrors ? errors : {};
  const patch = (partial: Partial<BlockerForm>) => setForm(current => ({ ...current, ...partial }));
  const isEdit = !!existing;

  const submit = async () => {
    if (!valid) {
      setShowErrors(true);
      const first = FIELD_ORDER.find(key => errors[key]);
      const target = { reason: reasonRef, dependency: dependencyRef, reviewDate: reviewRef, evidenceUrl: evidenceRef, text: reasonRef }[first ?? 'reason'];
      target.current?.focus();
      return;
    }
    try {
      await save.mutateAsync({ subject, id: subjectId, form });
      onOpenChange(false);
    } catch {
      // The mutation has already said what went wrong; the form stays so nothing typed is lost.
    }
  };

  const dependencyItems = form.dependencyKind === 'rock' ? rockOptions : form.dependencyKind === 'milestone' ? milestoneOptions : [];

  return (
    <Dialog open={open} onOpenChange={next => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit blocker' : 'Mark as blocked'}</DialogTitle>
          <DialogDescription className="break-words">
            {isEdit ? 'Update what is recorded about the blocker on' : 'Record what is in the way of'} “{subjectLabel}”.
            {!isEdit && ' Its status becomes Blocked when you save. It is not marked off track or complete.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="blocker-reason">What is blocking it? <span aria-hidden className="text-destructive">*</span></Label>
            <Textarea
              id="blocker-reason"
              ref={reasonRef}
              value={form.reason}
              onChange={event => patch({ reason: event.target.value })}
              rows={3}
              maxLength={1000}
              required
              aria-required
              aria-invalid={!!shown.reason}
              aria-describedby={shown.reason ? 'blocker-reason-error' : undefined}
              placeholder="e.g. Waiting on the vendor to issue API access"
              autoFocus
            />
            {shown.reason && <p id="blocker-reason-error" role="alert" className="text-xs text-destructive">{shown.reason}</p>}
          </div>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Depends on</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="blocker-dependency-kind" className="text-xs">Kind</Label>
                <Select
                  value={form.dependencyKind}
                  onValueChange={value => patch({ dependencyKind: value as DependencyKind, dependsOnId: '' })}
                >
                  <SelectTrigger id="blocker-dependency-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nothing in Unicorn</SelectItem>
                    <SelectItem value="rock">Another Rock</SelectItem>
                    <SelectItem value="milestone">A milestone on this Rock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.dependencyKind !== 'none' && (
                <div className="space-y-1.5">
                  <Label htmlFor="blocker-dependency" className="text-xs">{form.dependencyKind === 'rock' ? 'Rock' : 'Milestone'}</Label>
                  <Select value={form.dependsOnId || NONE} onValueChange={value => patch({ dependsOnId: value === NONE ? '' : value })}>
                    <SelectTrigger
                      id="blocker-dependency"
                      ref={dependencyRef}
                      aria-invalid={!!shown.dependency}
                      aria-describedby={shown.dependency ? 'blocker-dependency-error' : undefined}
                    >
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} disabled>Choose…</SelectItem>
                      {dependencyItems.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {shown.dependency && <p id="blocker-dependency-error" role="alert" className="text-xs text-destructive">{shown.dependency}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="blocker-dependency-note" className="text-xs">The condition, in a sentence (optional)</Label>
              <Input
                id="blocker-dependency-note"
                value={form.dependencyNote}
                onChange={event => patch({ dependencyNote: event.target.value })}
                maxLength={1000}
                placeholder="e.g. Needs the sandbox account before testing"
              />
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="blocker-next-action">Next action (optional)</Label>
              <Input
                id="blocker-next-action"
                value={form.nextAction}
                onChange={event => patch({ nextAction: event.target.value })}
                maxLength={1000}
                placeholder="e.g. Chase the vendor"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blocker-owner">Who owns the next action</Label>
              <Select value={form.nextActionOwnerId || NONE} onValueChange={value => patch({ nextActionOwnerId: value === NONE ? '' : value })}>
                <SelectTrigger id="blocker-owner"><SelectValue placeholder="Nobody yet" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nobody yet</SelectItem>
                  {people.map(person => <SelectItem key={person.id} value={person.id}>{person.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blocker-review">Check again on</Label>
              <Input
                id="blocker-review"
                ref={reviewRef}
                type="date"
                value={form.reviewDate}
                min={existing?.review_date && existing.review_date < todayIso ? existing.review_date : todayIso}
                onChange={event => patch({ reviewDate: event.target.value })}
                aria-invalid={!!shown.reviewDate}
                aria-describedby={shown.reviewDate ? 'blocker-review-error' : undefined}
              />
              {shown.reviewDate && <p id="blocker-review-error" role="alert" className="text-xs text-destructive">{shown.reviewDate}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="blocker-evidence">Supporting link (optional)</Label>
              <Input
                id="blocker-evidence"
                ref={evidenceRef}
                type="url"
                inputMode="url"
                value={form.evidenceUrl}
                onChange={event => patch({ evidenceUrl: event.target.value })}
                placeholder="https://"
                aria-invalid={!!shown.evidenceUrl}
                aria-describedby={shown.evidenceUrl ? 'blocker-evidence-error' : undefined}
              />
              {shown.evidenceUrl && <p id="blocker-evidence-error" role="alert" className="text-xs text-destructive">{shown.evidenceUrl}</p>}
            </div>
          </div>
          {shown.text && <p role="alert" className="text-xs text-destructive">{shown.text}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {isEdit ? 'Save blocker' : 'Mark as blocked'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
