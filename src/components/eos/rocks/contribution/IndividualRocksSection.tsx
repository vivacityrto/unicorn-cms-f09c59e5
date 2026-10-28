import { useId, useState } from 'react';
import { AlertTriangle, Ban, ChevronDown, ChevronRight, CornerUpRight, ExternalLink, Link2, Link2Off, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LinkMilestoneDialog } from '@/components/eos/rocks/linking/LinkMilestoneDialog';
import { cn } from '@/lib/utils';
import { useRockContribution } from '@/hooks/useRockContribution';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { formatDate } from '@/utils/rockPanelFormat';
import { milestoneRef, parseMilestoneTitle } from '@/utils/rockPanelMetrics';
import { formatQuarter } from '@/utils/rockCarryover';
import {
  contributionSummaryText,
  type CarriedTarget,
  type ContributionMilestone,
  type IndividualContribution,
} from '@/utils/rockContribution';
import { dbToUiStatus, getStatusConfig } from '@/utils/rockStatusUtils';
import type { RockMilestoneStatus } from '@/types/eos';

interface UserInfo {
  name: string;
}

interface IndividualRocksSectionProps {
  companyRockId: string;
  getUserInfo?: (userId: string) => UserInfo | null;
  onOpenRock?: (rockId: string) => void;
  /**
   * What the collapsed header can say before anything is loaded (the card already
   * knows how many Rocks cascade from it, and how many of those are blocked).
   */
  hint?: { total: number; blocked?: number };
  /** Start expanded (the details panel); a card starts collapsed to stay scannable. */
  defaultOpen?: boolean;
  /** Show the Link and Change actions on each Individual milestone. Off for someone who cannot edit Rocks. */
  canLink?: boolean;
  className?: string;
}

const mStatus = (status: string) => MILESTONE_STATUS[(status in MILESTONE_STATUS ? status : 'not_started') as RockMilestoneStatus];

function MilestoneLabel({ milestone }: { milestone: ContributionMilestone }) {
  const parsed = parseMilestoneTitle(milestone.title);
  return (
    <span className="break-words">
      {parsed.number !== null && <span className="mr-1.5 rounded bg-muted px-1 font-mono text-[11px] font-semibold">{milestoneRef(parsed)}</span>}
      {parsed.label}
    </span>
  );
}

function CarriedBlock({ carried, onOpenRock }: { carried: CarriedTarget[]; onOpenRock?: (id: string) => void }) {
  if (carried.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-dashed bg-muted/20 p-2.5">
      {carried.map(c => (
        <div key={c.carryoverId} className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CornerUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="font-medium">Carried forward to</span>
            {c.rock ? (
              <>
                <button
                  type="button"
                  disabled={!onOpenRock}
                  onClick={() => onOpenRock?.(c.rock!.id)}
                  className="min-w-0 break-words rounded text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-foreground disabled:no-underline"
                >
                  {c.rock.title}
                </button>
                <Badge variant="outline" className="text-[10px]">{formatQuarter({ year: c.rock.quarter_year, quarter: c.rock.quarter_number })}</Badge>
              </>
            ) : (
              <span className="text-muted-foreground">a Rock you cannot see</span>
            )}
          </div>
          {c.milestones.length > 0 && (
            <ul className="ml-5 list-disc space-y-0.5 text-muted-foreground">
              {c.milestones.map((m, index) => (
                <li key={`${m.sourceTitle}-${index}`} className="break-words">
                  {m.sourceTitle}
                  {m.destination && <> → now {mStatus(m.destination.status).label.toLowerCase()}</>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function IndividualRow({
  item,
  getUserInfo,
  onOpenRock,
  onLink,
}: {
  item: IndividualContribution;
  getUserInfo?: (userId: string) => UserInfo | null;
  onOpenRock?: (rockId: string) => void;
  /** Present only when the viewer may change the mapping. */
  onLink?: (milestone: { id: string; title: string }, rockTitle: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const status = getStatusConfig(item.rock.status);
  const owner = item.rock.owner_id && getUserInfo ? getUserInfo(item.rock.owner_id)?.name ?? null : null;
  const pct = item.progress.total > 0 ? Math.round((item.progress.complete / item.progress.total) * 100) : 0;

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${item.rock.title}`}
          onClick={() => setOpen(value => !value)}
          className="inline-flex min-w-[12rem] flex-1 items-start gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="min-w-0 break-words text-sm font-medium leading-snug">
            {item.rock.title}
            {item.viaTeam && <span className="block text-xs font-normal text-muted-foreground">via the Team Rock “{item.viaTeam}”</span>}
          </span>
        </button>
        <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:ml-0">
          <span className={cn('text-muted-foreground', !owner && 'italic')}>{owner ?? 'Unassigned'}</span>
          <Badge variant="outline" className={cn('gap-1 text-[10px]', status.color, status.bgColor, status.borderColor)}>
            {dbToUiStatus(item.rock.status) === 'blocked' && <Ban className="h-3 w-3" aria-hidden />}
            {status.label}
          </Badge>
          <span className="tabular-nums text-muted-foreground">{item.rock.due_date ? `Due ${formatDate(item.rock.due_date, 'd MMM')}` : 'No date'}</span>
          <span className="inline-flex items-center gap-1.5 tabular-nums" title={`${item.progress.complete} of ${item.progress.total} milestones complete`}>
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full bg-green-500" style={{ width: `${pct}%` }} />
            </span>
            {item.progress.complete}/{item.progress.total}
          </span>
          {item.blockedMilestones > 0 && (
            <Badge variant="outline" className="gap-1 border-violet-300 bg-violet-100 text-[10px] text-violet-800 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
              <Ban className="h-3 w-3" aria-hidden />
              {item.blockedMilestones === 1 ? '1 milestone blocked' : `${item.blockedMilestones} milestones blocked`}
            </Badge>
          )}
          {item.carriedTo.length > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <CornerUpRight className="h-3 w-3" aria-hidden />
              Carried forward
            </Badge>
          )}
          {item.unmappedCount > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-800 dark:text-amber-300">
              <Link2Off className="h-3 w-3" aria-hidden />
              {item.unmappedCount} unmapped
            </Badge>
          )}
        </div>
      </div>

      {open && (
        <div id={panelId} className="space-y-3 border-t bg-muted/20 p-3">
          {item.blocker && (
            <p className="flex items-start gap-1.5 text-xs text-violet-900 dark:text-violet-200">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="break-words"><span className="font-medium">Blocked:</span> {item.blocker.reason}</span>
            </p>
          )}
          {item.milestones.length === 0 ? (
            <p className="text-xs text-muted-foreground">This Individual Rock has no milestones yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {item.milestones.map(view => {
                const style = mStatus(view.milestone.status);
                const mapped = view.supports.length > 0;
                const needsMapping = !mapped && view.milestone.status !== 'complete' && view.milestone.status !== 'deferred';
                const ownerName = view.milestone.owner_id && getUserInfo ? getUserInfo(view.milestone.owner_id)?.name ?? null : null;
                return (
                  <li key={view.milestone.id} className="rounded-md border bg-card p-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 font-medium"><MilestoneLabel milestone={view.milestone} /></span>
                      <Badge variant="outline" className={cn('border-transparent px-1.5 py-0 text-[10px]', style.className)}>{style.label}</Badge>
                      <span className="text-muted-foreground">{ownerName ?? 'Unassigned'}</span>
                      <span className="tabular-nums text-muted-foreground">{view.milestone.due_date ? formatDate(view.milestone.due_date, 'd MMM') : 'No date'}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                      {mapped ? (
                        <>
                          <span>Supports</span>
                          {view.supports.map(company => (
                            <span key={company.id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                              <MilestoneLabel milestone={company} />
                              <span className="text-[10px]">({mStatus(company.status).label.toLowerCase()}{company.due_date ? `, due ${formatDate(company.due_date, 'd MMM')}` : ''})</span>
                            </span>
                          ))}
                        </>
                      ) : needsMapping ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Not linked to any Company milestone
                        </span>
                      ) : (
                        <span>Not linked to a Company milestone</span>
                      )}
                      {onLink && (mapped || needsMapping) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="ml-auto h-7 gap-1 px-2 text-xs"
                          onClick={() => onLink({ id: view.milestone.id, title: view.milestone.title }, item.rock.title)}
                        >
                          <Link2 className="h-3 w-3" aria-hidden />
                          {mapped ? 'Change' : 'Link to a Company milestone'}
                        </Button>
                      )}
                    </div>
                    {view.blocker && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-violet-900 dark:text-violet-200">
                        <Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span className="break-words"><span className="font-medium">Blocked:</span> {view.blocker.reason}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <CarriedBlock carried={item.carriedTo} onOpenRock={onOpenRock} />
          {onOpenRock && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenRock(item.rock.id)}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Open {item.rock.title.length > 28 ? 'details' : `“${item.rock.title}”`}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * A Company Rock's Individual Rocks, collapsed to a single line until opened. Each
 * can be expanded in place to show its milestones and which Company milestones they
 * support, with unmapped work and unsupported Company milestones called out. Data is
 * only fetched when the section is opened. The toggle is its own button, so it never
 * competes with whatever clicking the surrounding card does.
 */
export function IndividualRocksSection({ companyRockId, getUserInfo, onOpenRock, hint, defaultOpen = false, canLink = false, className }: IndividualRocksSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [linking, setLinking] = useState<{ id: string; title: string; rockTitle: string } | null>(null);
  const panelId = useId();
  const query = useRockContribution(companyRockId, open);
  const model = query.data;
  // With nothing known yet and nothing asked for, the hint decides whether the section is worth showing at all.
  if (hint && hint.total === 0 && !open && !model) return null;

  const summary = model
    ? contributionSummaryText(model.summary)
    : hint
      ? `${hint.total === 1 ? '1 Individual Rock' : `${hint.total} Individual Rocks`}${hint.blocked ? ` · ${hint.blocked} blocked` : ''}`
      : 'Individual Rocks';

  return (
    <section className={cn('space-y-2', className)} aria-label="Individual Rocks">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={event => {
          event.stopPropagation();
          setOpen(value => !value);
        }}
        onKeyDown={event => event.stopPropagation()}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-semibold">Individual Rocks</span>
        <span className="min-w-0 text-xs text-muted-foreground">{summary}</span>
      </button>

      {open && (
        <div id={panelId} className="space-y-3" onClick={event => event.stopPropagation()}>
          {query.isLoading ? (
            <div className="space-y-2" aria-label="Loading Individual Rocks">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : query.isError ? (
            <p role="alert" className="text-xs text-destructive">
              Individual Rocks could not be loaded.{' '}
              <button type="button" onClick={() => void query.refetch()} className="underline">Try again</button>
            </p>
          ) : !model || model.individuals.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No Individual Rocks cascade from this Company Rock yet.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {model.individuals.map(item => (
                  <IndividualRow key={item.rock.id} item={item} getUserInfo={getUserInfo} onOpenRock={onOpenRock} onLink={canLink ? (milestone, rockTitle) => setLinking({ ...milestone, rockTitle }) : undefined} />
                ))}
              </ul>

              {model.coverage.length > 0 && (
                <div className="space-y-1.5">
                  <h5 className="text-xs font-semibold">Company milestones and who delivers them</h5>
                  <ul className="space-y-1">
                    {model.coverage.map(c => {
                      const uncovered = c.contributors.length === 0 && c.milestone.status !== 'complete' && c.milestone.status !== 'deferred';
                      return (
                        <li key={c.milestone.id} className={cn('rounded-md border px-2.5 py-1.5 text-xs', uncovered && 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20')}>
                          <span className="font-medium"><MilestoneLabel milestone={c.milestone} /></span>
                          <span className="ml-2 text-muted-foreground">{mStatus(c.milestone.status).label}</span>
                          <span className="mt-0.5 block text-muted-foreground">
                            {c.contributors.length > 0 ? (
                              <>Delivered by {c.contributors.map(x => `${x.rock.title} (${parseMilestoneTitle(x.milestone.title).label})`).join('; ')}</>
                            ) : uncovered ? (
                              <span className="inline-flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" aria-hidden />
                                No Individual work is linked to this milestone
                              </span>
                            ) : (
                              'No Individual work linked'
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <CarriedBlock carried={model.companyCarriedTo} onOpenRock={onOpenRock} />
            </>
          )}
        </div>
      )}
      {linking && (
        <LinkMilestoneDialog
          open
          onOpenChange={next => !next && setLinking(null)}
          companyRockId={companyRockId}
          milestone={{ id: linking.id, title: linking.title }}
          rockTitle={linking.rockTitle}
        />
      )}
    </section>
  );
}
