import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useArchiveRock, useDeleteRock, useRestoreRock, useRockImpact } from '@/hooks/useRockLifecycle';
import { archiveEffects, blockerSentences, deleteEffects } from '@/utils/rockLifecycle';

export type LifecycleMode = 'archive' | 'delete' | 'restore';

interface RockLifecycleDialogProps {
  mode: LifecycleMode | null;
  rockId: string | null;
  onClose: () => void;
  /** Called after the action succeeds and the dialog has closed. */
  onDone?: (mode: LifecycleMode) => void;
}

/**
 * One confirmation for archive, delete and restore. It asks the database what the
 * action would touch before offering it, so the person decides with the facts.
 */
export function RockLifecycleDialog({ mode: requested, rockId, onClose, onDone }: RockLifecycleDialogProps) {
  const [mode, setMode] = useState<LifecycleMode | null>(requested);
  const [includeChildren, setIncludeChildren] = useState(false);
  const [restoreTogether, setRestoreTogether] = useState(true);
  const impactQuery = useRockImpact(requested ? rockId : null);
  const archive = useArchiveRock();
  const restore = useRestoreRock();
  const remove = useDeleteRock();

  useEffect(() => {
    setMode(requested);
    setIncludeChildren(false);
    setRestoreTogether(true);
  }, [requested, rockId]);

  const impact = impactQuery.data;
  const busy = archive.isPending || restore.isPending || remove.isPending;
  const title = impact?.rock.title ?? 'this Rock';

  const finish = (done: LifecycleMode) => {
    onClose();
    onDone?.(done);
  };

  const confirm = async () => {
    if (!impact || !mode) return;
    try {
      if (mode === 'archive') await archive.mutateAsync({ id: impact.rock.id, includeChildren });
      else if (mode === 'restore') await restore.mutateAsync({ id: impact.rock.id, includeParents: !!impact.parent?.archived_at, includeChildren: restoreTogether && impact.children_archived > 0 });
      else await remove.mutateAsync(impact.rock.id);
      finish(mode);
    } catch {
      // The mutation already explained what went wrong; the dialog stays so the person can choose again.
    }
  };

  const blocked = mode === 'delete' && impact && !impact.can_delete;
  const heading = mode === 'delete' ? (blocked ? 'This Rock cannot be deleted' : 'Delete this Rock permanently?')
    : mode === 'restore' ? 'Restore this Rock?' : 'Archive this Rock?';

  return (
    <Dialog open={requested !== null} onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription className="break-words">“{title}”</DialogDescription>
        </DialogHeader>

        {impactQuery.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking what this touches…
          </p>
        )}
        {impactQuery.isError && (
          <p className="text-sm text-destructive" role="alert">Could not check what this touches: {(impactQuery.error as Error).message}</p>
        )}

        {impact && mode === 'archive' && (
          <div className="space-y-4 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {archiveEffects(impact, includeChildren).map(line => <li key={line}>{line}</li>)}
            </ul>
            {impact.descendants_active > 0 && (
              <RadioGroup value={includeChildren ? 'with' : 'only'} onValueChange={v => setIncludeChildren(v === 'with')} aria-label="What to archive">
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="archive-only" value="only" />
                  <Label htmlFor="archive-only" className="text-sm font-normal normal-case tracking-normal leading-snug">Archive only this Rock</Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="archive-with" value="with" />
                  <Label htmlFor="archive-with" className="text-sm font-normal normal-case tracking-normal leading-snug">
                    Archive it and the {impact.descendants_active} {impact.descendants_active === 1 ? 'Rock' : 'Rocks'} that serve it
                  </Label>
                </div>
              </RadioGroup>
            )}
          </div>
        )}

        {impact && mode === 'delete' && (
          blocked ? (
            <div className="space-y-3 text-sm">
              <p>Deleting it would lose something worth keeping:</p>
              <ul className="list-disc space-y-1 pl-5">{blockerSentences(impact).map(line => <li key={line}>{line}</li>)}</ul>
              <p className="text-muted-foreground">Archive it instead. It leaves the active views and can be restored.</p>
            </div>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">{deleteEffects(impact).map(line => <li key={line}>{line}</li>)}</ul>
          )
        )}

        {impact && mode === 'restore' && (
          <div className="space-y-3 text-sm">
            <p>It returns to the active views, the cascade and the L10 Rock Review.</p>
            {impact.parent?.archived_at && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                It serves “{impact.parent.title}”, which is archived. Restoring brings both back.
              </p>
            )}
            {impact.children_archived > 0 && (
              <div className="flex items-start gap-2">
                <Checkbox id="restore-together" checked={restoreTogether} onCheckedChange={v => setRestoreTogether(v === true)} />
                <Label htmlFor="restore-together" className="text-sm font-normal normal-case tracking-normal leading-snug">
                  Also restore the Rocks that serve it and were archived at the same time
                </Label>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {blocked ? (
            <Button type="button" onClick={() => setMode('archive')}>Archive instead</Button>
          ) : (
            <Button
              type="button"
              variant={mode === 'delete' ? 'destructive' : 'default'}
              onClick={() => void confirm()}
              disabled={!impact || busy}
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === 'delete' ? 'Delete permanently' : mode === 'restore' ? (impact?.parent?.archived_at ? 'Restore both' : 'Restore') : 'Archive'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
