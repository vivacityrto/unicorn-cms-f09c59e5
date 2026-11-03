import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useLinkedCompanyIds, useLinkTargets, useSetMilestoneLinks } from '@/hooks/useMilestoneLinking';
import { cn } from '@/lib/utils';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { diffLinks, type LinkTargetRock } from '@/utils/rockLinking';
import { formatDate } from '@/utils/rockPanelFormat';
import { parseMilestoneTitle } from '@/utils/rockPanelMetrics';
import type { RockMilestoneStatus } from '@/types/eos';

interface LinkMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Rocks above this milestone's Rock whose milestones it can support: its Team Rock and/or Company Rock. */
  targetRocks: readonly LinkTargetRock[];
  milestone: { id: string; title: string };
  /** Name of the milestone's own Rock, so the heading says whose milestone this is. */
  rockTitle?: string;
}

const LEVEL_NAME = { team: 'Team', company: 'Company' } as const;

/**
 * Pick which milestones above one milestone helps deliver: those of the Team Rock its Rock serves and
 * of the Company Rock above. A milestone can support several, and leaving all unticked is allowed (it
 * then counts as unmapped). Changes are saved together, and the database re-checks each pairing.
 */
export function LinkMilestoneDialog({ open, onOpenChange, targetRocks, milestone, rockTitle }: LinkMilestoneDialogProps) {
  const targets = useLinkTargets(targetRocks.map(r => r.id), open);
  const linked = useLinkedCompanyIds(milestone.id, open);
  const save = useSetMilestoneLinks();
  const returnFocus = useReturnFocus(open);
  const [selected, setSelected] = useState<string[] | null>(null);

  // Trust only what was fetched since this dialog opened. A cached copy from an earlier opening can be
  // out of date (a link added or removed elsewhere), and ticks built from it would make a save delete
  // links the person never unticked.
  const fresh = !!linked.isFetchedAfterMount && !!targets.isFetchedAfterMount;

  // Fill the ticks from what the database holds once, each time the dialog opens.
  useEffect(() => {
    if (!open) setSelected(null);
    else if (selected === null && fresh && linked.data) setSelected(linked.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fresh, linked.data]);

  const current = linked.data ?? [];
  const chosen = selected ?? current;
  const { add, remove } = diffLinks(current, chosen);
  const changed = add.length + remove.length > 0;
  const loading = targets.isLoading || linked.isLoading || !fresh || selected === null;
  const failed = targets.isError || linked.isError;
  const label = parseMilestoneTitle(milestone.title).label;

  const groups = targetRocks.map(rock => ({ rock, milestones: (targets.data ?? []).filter(t => t.rockId === rock.id) }));
  const nothingToLink = (targets.data ?? []).length === 0;

  const toggle = (id: string, on: boolean) => setSelected(chosen.includes(id) === on ? chosen : on ? [...chosen, id] : chosen.filter(x => x !== id));

  const submit = async () => {
    const tenantId = targets.data?.[0]?.tenantId;
    if (tenantId === undefined) return;
    try {
      await save.mutateAsync({ individualMilestoneId: milestone.id, tenantId, add, remove });
      onOpenChange(false);
    } catch {
      // The mutation has already said what went wrong; the ticks stay so nothing is lost.
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Which milestones does this support?</DialogTitle>
          <DialogDescription className="break-words">
            “{label}”{rockTitle ? ` in ${rockTitle}` : ''}. Tick the milestones it helps deliver. It can support more than one.
          </DialogDescription>
        </DialogHeader>

        {loading && !failed ? (
          <div className="space-y-2" aria-label="Loading milestones">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : failed ? (
          <p role="alert" className="text-sm text-destructive">The milestones could not be loaded. Close this and try again.</p>
        ) : nothingToLink ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {targetRocks.length === 1
              ? `The ${LEVEL_NAME[targetRocks[0].level]} Rock has no milestones yet, so there is nothing to map to. Add milestones to the ${LEVEL_NAME[targetRocks[0].level]} Rock first.`
              : 'The Rocks above have no milestones yet, so there is nothing to map to. Add milestones to them first.'}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ rock, milestones: rockTargets }) => (
              <fieldset key={rock.id} className="space-y-2">
                <legend className="mb-1 text-xs font-semibold text-muted-foreground">{LEVEL_NAME[rock.level]} Rock: {rock.title}</legend>
                {rockTargets.length === 0 && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No milestones yet.</p>}
                {rockTargets.map(target => {
                  const parsed = parseMilestoneTitle(target.title);
                  const style = MILESTONE_STATUS[(target.status in MILESTONE_STATUS ? target.status : 'not_started') as RockMilestoneStatus];
                  const checked = chosen.includes(target.id);
                  return (
                    <div key={target.id} className={cn('flex items-start gap-3 rounded-lg border p-3', checked && 'border-primary bg-primary/5')}>
                      <Checkbox id={`link-${target.id}`} checked={checked} onCheckedChange={value => toggle(target.id, value === true)} className="mt-0.5" />
                      <Label htmlFor={`link-${target.id}`} className="min-w-0 flex-1 cursor-pointer space-y-1 font-normal">
                        <span className="block break-words text-sm font-medium">
                          {parsed.number !== null && <span className="mr-2 rounded bg-muted px-1.5 font-mono text-xs font-semibold">M{parsed.number}</span>}
                          {parsed.label}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className={cn('border-transparent px-1.5 py-0 text-[10px]', style.className)}>{style.label}</Badge>
                          {target.dueDate && <span>Due {formatDate(target.dueDate, 'd MMM')}</span>}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>
        )}

        {!loading && !failed && !nothingToLink && chosen.length === 0 && (
          <p className="text-xs text-muted-foreground">With none ticked this milestone stays unmapped, and is flagged as such.</p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={save.isPending || loading || failed || !changed}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
