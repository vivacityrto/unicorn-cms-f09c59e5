import { ArrowRight, ChevronDown, ChevronRight, CornerUpLeft } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { RockCarryoverData } from '@/hooks/useRockCarryover';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { formatDate } from '@/utils/rockPanelFormat';
import { formatQuarter, type CarryoverLink } from '@/utils/rockCarryover';
import { getStatusConfig } from '@/utils/rockStatusUtils';
import type { RockMilestoneStatus } from '@/types/eos';

interface CarryoverLinksProps {
  data: RockCarryoverData | undefined;
  isLoading: boolean;
  isError: boolean;
  nameOf: (userId: string | null) => string | null;
  onOpenRock?: (rockId: string) => void;
}

function MilestonePairs({ link, data, onOpenRock }: { link: CarryoverLink; data: RockCarryoverData; onOpenRock?: (id: string) => void }) {
  if (link.milestones.length === 0) {
    return <p className="text-xs text-muted-foreground">No milestones were carried, only the Rock.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {link.milestones.map(pair => {
        const sourceNow = pair.sourceMilestoneId ? data.milestones[pair.sourceMilestoneId] : null;
        const destNow = pair.destinationMilestoneId ? data.milestones[pair.destinationMilestoneId] : null;
        const destStatus = destNow ? MILESTONE_STATUS[(destNow.status in MILESTONE_STATUS ? destNow.status : 'not_started') as RockMilestoneStatus] : null;
        // On the source side the other end is the destination milestone; on the destination side it is the source one.
        const other = link.direction === 'to' ? destNow : sourceNow;
        const otherStatus = other ? MILESTONE_STATUS[(other.status in MILESTONE_STATUS ? other.status : 'not_started') as RockMilestoneStatus] : null;
        const otherRockId = other?.rock_id ?? null;
        return (
          <li key={pair.id} className="rounded-md border bg-card p-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 break-words font-medium">{pair.sourceTitle}</span>
              {link.direction === 'to' ? <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="carried to" /> : <CornerUpLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="carried from" />}
              {other ? (
                <button
                  type="button"
                  disabled={!onOpenRock || !otherRockId}
                  onClick={() => otherRockId && onOpenRock?.(otherRockId)}
                  className="min-w-0 break-words rounded text-left text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-foreground disabled:no-underline"
                >
                  {other.title}
                </button>
              ) : (
                <span className="text-muted-foreground">{link.direction === 'to' ? 'Removed since' : 'Original milestone removed'}</span>
              )}
              {otherStatus && <Badge variant="outline" className={cn('border-transparent px-1.5 py-0 text-[10px]', otherStatus.className)}>{otherStatus.label}</Badge>}
            </div>
            <p className="mt-1 text-muted-foreground">
              {link.direction === 'to'
                ? `Was ${pair.sourceStatus.replace(/_/g, ' ')}${pair.newDueDate ? ` · new target ${formatDate(pair.newDueDate, 'd MMM yyyy')}` : ''}`
                : `Was ${pair.sourceStatus.replace(/_/g, ' ')} when carried${destStatus && destNow ? ` · now ${destStatus.label.toLowerCase()}` : ''}${pair.newDueDate ? ` · new target ${formatDate(pair.newDueDate, 'd MMM yyyy')}` : ''}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function LinkCard({ link, data, nameOf, onOpenRock }: { link: CarryoverLink; data: RockCarryoverData; nameOf: CarryoverLinksProps['nameOf']; onOpenRock?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const other = data.rocks[link.otherRockId];
  const status = getStatusConfig(other?.status);
  const by = link.carriedBy ? nameOf(link.carriedBy) : null;
  const panelId = `carryover-${link.carryoverId}`;
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {link.direction === 'to' ? <ArrowRight className="h-3.5 w-3.5" aria-hidden /> : <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />}
          {link.direction === 'to' ? 'Carried forward to' : 'Carried from'}
        </span>
        {other ? (
          <>
            <button
              type="button"
              disabled={!onOpenRock}
              onClick={() => onOpenRock?.(other.id)}
              className="min-w-0 break-words rounded text-left text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-foreground disabled:no-underline"
            >
              {other.title}
            </button>
            <Badge variant="outline" className="text-[10px]">{formatQuarter({ year: other.quarter_year, quarter: other.quarter_number })}</Badge>
            <Badge variant="outline" className={cn('text-[10px]', status.color, status.bgColor, status.borderColor)}>{status.label}</Badge>
            {other.archived_at && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">A Rock you cannot see</span>
        )}
      </div>
      <p className="mt-1.5 break-words text-xs text-muted-foreground">
        “{link.reason}” · {formatDate(link.carriedAt)}
        {by ? ` · ${by}` : ''}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        {link.milestones.length === 1 ? '1 milestone' : `${link.milestones.length} milestones`}
      </button>
      {open && (
        <div id={panelId} className="mt-2">
          <MilestonePairs link={link} data={data} onOpenRock={onOpenRock} />
        </div>
      )}
    </li>
  );
}

/**
 * "Carried forward to" on a source Rock and "Carried from" on a destination,
 * each linking to the Rock on the other side and, one level down, to the carried
 * milestones. Renders nothing when there is no carryover, so most Rocks are unchanged.
 */
export function CarryoverLinks({ data, isLoading, isError, nameOf, onOpenRock }: CarryoverLinksProps) {
  if (isLoading) return <Skeleton className="h-14 w-full" aria-label="Loading carryover" />;
  if (isError) return <p className="text-xs text-muted-foreground">Carryover details could not be loaded.</p>;
  if (!data || data.links.length === 0) return null;
  return (
    <section aria-label="Carryover" className="space-y-2">
      <ul className="space-y-2">
        {data.links.map(link => (
          <LinkCard key={link.carryoverId} link={link} data={data} nameOf={nameOf} onOpenRock={onOpenRock} />
        ))}
      </ul>
    </section>
  );
}
