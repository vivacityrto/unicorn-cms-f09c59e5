import { Ban, CalendarClock, CheckCircle2, ExternalLink, Link2, Pencil, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate, safeExternalUrl } from '@/utils/rockPanelFormat';
import { reviewState, type BlockerRow } from '@/utils/rockBlocker';

export interface DependencyTarget {
  label: string;
  kind: 'Rock' | 'Milestone';
  /** Opens the Rock the dependency lives on, when it is a different Rock from the one being viewed. */
  onOpen?: () => void;
}

interface BlockerDetailsProps {
  blocker: BlockerRow;
  todayIso: string;
  nameOf: (userId: string | null) => string | null;
  dependency?: DependencyTarget | null;
  canManage: boolean;
  onEdit?: () => void;
  onResolve?: () => void;
  /** Smaller type and spacing, for use inside a milestone row. */
  compact?: boolean;
  className?: string;
}

const REVIEW_BADGE: Record<'today' | 'overdue', string> = {
  today: 'Check due today',
  overdue: 'Check overdue',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[8.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * One open blocker, with everything recorded about it. Meaning is carried by the
 * words and the icon as well as the colour, so it reads the same without colour.
 */
export function BlockerDetails({
  blocker,
  todayIso,
  nameOf,
  dependency,
  canManage,
  onEdit,
  onResolve,
  compact = false,
  className,
}: BlockerDetailsProps) {
  const review = reviewState(blocker.review_date, todayIso);
  const evidenceHref = blocker.evidence_url ? safeExternalUrl(blocker.evidence_url) : null;
  const owner = blocker.next_action_owner_id ? nameOf(blocker.next_action_owner_id) : null;
  const recordedBy = blocker.recorded_by ? nameOf(blocker.recorded_by) : null;
  const recordedOn = formatDate(blocker.recorded_at);

  return (
    <section
      aria-label="Blocker"
      className={cn(
        'rounded-lg border border-violet-300 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30',
        compact ? 'space-y-2' : 'space-y-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
          <Ban className="h-4 w-4" aria-hidden />
          Blocked
          {review !== 'none' && review !== 'upcoming' && (
            <Badge variant="outline" className={cn('text-[10px]', review === 'overdue' ? 'border-destructive text-destructive' : 'border-amber-500 text-amber-700 dark:text-amber-300')}>
              {REVIEW_BADGE[review]}
            </Badge>
          )}
        </h4>
        {canManage && (
          <div className="flex flex-wrap gap-1.5">
            {onEdit && (
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
                <Pencil className="mr-1 h-3 w-3" aria-hidden />
                Edit blocker
              </Button>
            )}
            {onResolve && (
              <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={onResolve}>
                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
                Resolve
              </Button>
            )}
          </div>
        )}
      </div>

      <dl className="space-y-1.5">
        <Row label="What is blocking it">
          <span className="whitespace-pre-wrap">{blocker.reason}</span>
        </Row>
        {(dependency || blocker.dependency_note) && (
          <Row label="Depends on">
            {dependency && (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-xs text-muted-foreground">{dependency.kind}:</span>
                {dependency.onOpen ? (
                  <button
                    type="button"
                    onClick={dependency.onOpen}
                    className="rounded text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {dependency.label}
                  </button>
                ) : (
                  <span className="font-medium">{dependency.label}</span>
                )}
              </span>
            )}
            {blocker.dependency_note && <span className="block whitespace-pre-wrap text-muted-foreground">{blocker.dependency_note}</span>}
          </Row>
        )}
        {(blocker.next_action || owner) && (
          <Row label="Next action">
            {blocker.next_action && <span className="whitespace-pre-wrap">{blocker.next_action}</span>}
            {owner && (
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                Owned by {owner}
              </span>
            )}
          </Row>
        )}
        {blocker.review_date && (
          <Row label="Next check">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {formatDate(blocker.review_date)}
            </span>
          </Row>
        )}
        {evidenceHref && (
          <Row label="Evidence">
            <a
              href={evidenceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Open link
            </a>
          </Row>
        )}
      </dl>

      <p className="text-xs text-muted-foreground">
        Recorded{recordedOn ? ` ${recordedOn}` : ''}
        {recordedBy ? ` by ${recordedBy}` : ''}
        {blocker.status_before ? ` · was ${blocker.status_before.replace(/_/g, ' ')} before` : ''}
      </p>
    </section>
  );
}

/** Resolved blockers for one subject: what was in the way, and how it ended. */
export function ResolvedBlockerList({
  blockers,
  nameOf,
}: {
  blockers: BlockerRow[];
  nameOf: (userId: string | null) => string | null;
}) {
  if (blockers.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Resolved blockers">
      {blockers.map(b => (
        <li key={b.id} className="rounded-md border bg-muted/30 p-2.5 text-xs">
          <p className="break-words font-medium">{b.reason}</p>
          <p className="mt-0.5 text-muted-foreground">
            Recorded {formatDate(b.recorded_at)}
            {b.recorded_by && nameOf(b.recorded_by) ? ` by ${nameOf(b.recorded_by)}` : ''}
            {' · '}Resolved {formatDate(b.resolved_at)}
            {b.resolved_by && nameOf(b.resolved_by) ? ` by ${nameOf(b.resolved_by)}` : ''}
          </p>
          {b.resolution_note && <p className="mt-0.5 break-words text-muted-foreground">{b.resolution_note}</p>}
        </li>
      ))}
    </ul>
  );
}
