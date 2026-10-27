import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, GitMerge, Link2, TriangleAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  DELIVERY_STATE_LABEL,
  type CompanyMilestoneDelivery,
  type DeliveryState,
  type SupportedCompanyMilestone,
} from '@/utils/milestoneDelivery';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { parseMilestoneTitle } from '@/utils/rockPanelMetrics';

interface UserInfo {
  name: string;
  initials: string;
  avatarUrl?: string | null;
}

const STATE_STYLE: Record<DeliveryState, string> = {
  complete: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ready_for_review: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  not_started: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  at_risk: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  uncovered: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  deferred: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export function DeliveryStateBadge({ state }: { state: DeliveryState }) {
  return (
    <Badge variant="outline" className={cn('border-transparent px-1.5 py-0 text-[10px]', STATE_STYLE[state])}>
      {DELIVERY_STATE_LABEL[state]}
    </Badge>
  );
}

function percentLabel(percent: number | null) {
  return percent === null ? '' : ` · ${percent}%`;
}

/** Under a Company milestone: the Individual milestones that deliver it, and how far they have got. */
export function CompanyMilestoneDeliveryBlock({
  delivery,
  getUserInfo,
  className = 'ml-6',
}: {
  delivery: CompanyMilestoneDelivery;
  getUserInfo?: (userId: string) => UserInfo | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { counts, contributors, percent, state } = delivery;

  if (state === 'uncovered') {
    return (
      <div className={cn('flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200', className)}>
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>No active Individual milestone is linked to this, so nobody is delivering it yet.</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2 rounded-md border bg-muted/30 p-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <GitMerge className="h-3.5 w-3.5" aria-hidden />
          Delivery · {counts.complete} of {counts.active} done{percentLabel(percent)}
        </span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {counts.blocked > 0 && (
            <Badge variant="outline" className="border-transparent bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {counts.blocked} blocked
            </Badge>
          )}
          {counts.overdue > 0 && (
            <Badge variant="outline" className="border-transparent bg-amber-100 px-1.5 py-0 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {counts.overdue} overdue
            </Badge>
          )}
          <DeliveryStateBadge state={state} />
        </span>
      </div>
      {percent !== null && <Progress value={percent} className="h-1.5" aria-label="Delivery progress for this milestone" />}
      {state === 'ready_for_review' && (
        <p className="text-xs text-muted-foreground">
          Everything delivering this is done. Review the evidence, then sign this milestone off in Unicorn.
        </p>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          Delivered by {contributors.length}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-1.5 space-y-1.5">
            {contributors.map(({ milestone, rock, ownerId, overdue }) => {
              const style = MILESTONE_STATUS[milestone.status];
              const owner = ownerId && getUserInfo ? getUserInfo(ownerId) : null;
              const due = milestone.dueDate ? format(new Date(milestone.dueDate), 'd MMM') : null;
              return (
                <li key={milestone.id} className="rounded border bg-card p-2 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className={cn('min-w-0 flex-1 basis-40 break-words font-medium', milestone.status === 'complete' && 'text-muted-foreground line-through')}>
                      {milestone.title}
                    </span>
                    <Badge variant="outline" className={cn('border-transparent px-1.5 py-0 text-[10px]', style.className)}>
                      {style.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden />
                      {owner?.name ?? 'Owner not shown'}
                    </span>
                    {due && (
                      <span className={cn(overdue && 'font-medium text-destructive')}>
                        {overdue ? 'Overdue · ' : 'Due '}
                        {due}
                      </span>
                    )}
                  </div>
                  {rock && <p className="mt-0.5 truncate text-muted-foreground/80" title={rock.title}>{rock.title}</p>}
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** Under an Individual milestone: the Company milestone(s) it feeds and where they stand overall. */
export function SupportedMilestonesBlock({
  supported,
  onOpenRock,
  className = 'ml-6',
}: {
  supported: SupportedCompanyMilestone[];
  onOpenRock?: (rockId: string) => void;
  className?: string;
}) {
  if (supported.length === 0) return null;
  return (
    <div className={cn('space-y-1.5', className)}>
      {supported.map(({ milestone, rock, delivery }) => {
        const ref = parseMilestoneTitle(milestone.title);
        return (
          <div key={milestone.id} className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
            <p className="flex items-start gap-1.5 break-words">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                Supports{' '}
                <span className="font-medium text-foreground">
                  {ref.number !== null && <span className="mr-1 font-mono">M{ref.number} ·</span>}
                  {ref.label}
                </span>
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <DeliveryStateBadge state={delivery.state} />
              {delivery.counts.active > 0 && (
                <span>
                  {delivery.counts.complete} of {delivery.counts.active} delivering milestones done
                </span>
              )}
              {onOpenRock && rock && (
                <button
                  type="button"
                  className="rounded text-left text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open Company Rock: ${rock.title}`}
                  title={rock.title}
                  onClick={() => onOpenRock(rock.id)}
                >
                  Open Company Rock
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
