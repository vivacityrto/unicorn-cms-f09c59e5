import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { format } from 'date-fns';
import { Ban, Building2, ExternalLink, History, Lightbulb, TriangleAlert, User, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { BlockerDetails, type DependencyTarget } from '@/components/eos/rocks/blockers/BlockerDetails';
import { BlockerDialog } from '@/components/eos/rocks/blockers/BlockerDialog';
import { ResolveBlockerDialog } from '@/components/eos/rocks/blockers/ResolveBlockerDialog';
import { CarryoverLinks } from '@/components/eos/rocks/carryover/CarryoverLinks';
import { IndividualRocksSection } from '@/components/eos/rocks/contribution/IndividualRocksSection';
import { StatusBar } from '@/components/eos/rocks/detail/StatusBar';
import { RaiseIssuePanel } from '@/components/eos/meeting/discuss/RaiseIssuePanel';
import { RockStatusDecision } from '@/components/eos/meeting/discuss/RockStatusDecision';
import { cn } from '@/lib/utils';
import { useRockBlockers } from '@/hooks/useRockBlockers';
import { useRockCarryover } from '@/hooks/useRockCarryover';
import { useEditorRocks } from '@/hooks/useRockEditorData';
import { useRockHistory } from '@/hooks/useRockLifecycle';
import { useRockLinkedIssues, useRockMilestones } from '@/hooks/useRockDiscussion';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { todayLocalIso } from '@/utils/localDate';
import type { RockCascadeNode } from '@/utils/meetingRocksCascade';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { openBlocker } from '@/utils/rockBlocker';
import { discussionReasons, facilitatorCue, issueSuggestion, lastStatusChange, type DiscussionOutcome } from '@/utils/rockDiscussion';
import { formatQuarter } from '@/utils/rockCarryover';
import { formatDate } from '@/utils/rockPanelFormat';
import { parseMilestoneTitle } from '@/utils/rockPanelMetrics';
import { dbToUiStatus, getStatusConfig } from '@/utils/rockStatusUtils';
import type { RockMilestoneStatus } from '@/types/eos';

const LEVEL = {
  company: { label: 'Company', icon: Building2, className: 'text-purple-700 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300' },
  team: { label: 'Team', icon: Users, className: 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300' },
  individual: { label: 'Individual', icon: User, className: 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300' },
} as const;

/** Most urgent first, so the first few rows are what the room should look at. */
const URGENCY: Record<string, number> = { blocked: 0, off_track: 1, in_progress: 3, not_started: 4, deferred: 5, complete: 6 };
/** Rows shown before "Show all": more when the list has the full width and runs in two columns, fewer on a short screen. */
const SHOWN_BESIDE = 5;
const SHOWN_FULL = 8;
const SHORT_SCREEN = '(max-height: 820px)';
const subscribeShort = (onChange: () => void) => {
  const query = window.matchMedia(SHORT_SCREEN);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isShort = () => window.matchMedia(SHORT_SCREEN).matches;

interface RockDiscussSlideProps {
  node: RockCascadeNode;
  ownerNames: Readonly<Record<string, string>>;
  outcomes: readonly DiscussionOutcome[];
  meeting?: { id?: string; segmentId?: string; type?: string | null };
  quarterLabel: string;
  onOutcome: (rockId: string, outcome: DiscussionOutcome) => void;
  onOpenDetails: (rockId: string) => void;
}

const REASON_TONE = {
  bad: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
  warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  info: 'border-border bg-muted text-foreground',
} as const;

/** One Rock, laid out around what it contains. Everything here is read from the Rock itself. */
export function RockDiscussSlide({ node, ownerNames, outcomes, meeting, quarterLabel, onOutcome, onOpenDetails }: RockDiscussSlideProps) {
  const { rock } = node;
  const status = dbToUiStatus(rock.status);
  const statusConfig = getStatusConfig(status);
  const level = LEVEL[rock.rock_level ?? 'company'];
  const LevelIcon = level.icon;
  const ownerName = rock.owner_id ? ownerNames[rock.owner_id] : undefined;
  const reasons = useMemo(() => discussionReasons(node), [node]);
  const cue = facilitatorCue(node);
  const suggestion = issueSuggestion(node);
  const todayIso = todayLocalIso();

  const [blockerMode, setBlockerMode] = useState<'record' | 'resolve' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [rock.id]);

  const milestonesQuery = useRockMilestones(rock.id);
  const milestoneRows = milestonesQuery.data ?? [];
  const milestoneIds = useMemo(() => milestoneRows.map(m => m.id), [milestoneRows]);
  const blockersQuery = useRockBlockers(rock.id, milestoneIds);
  const blockers = blockersQuery.data ?? [];
  const rockBlocker = openBlocker(blockers, 'rock', rock.id);
  const issuesQuery = useRockLinkedIssues(rock.id);
  const historyQuery = useRockHistory(rock.id, true);
  const carryoverQuery = useRockCarryover(rock.id);
  const { data: people } = useVivacityTeamUsers();
  const editorRocks = useEditorRocks(true);

  const nameOf = (userId: string | null) => (userId ? ownerNames[userId] ?? null : null);
  const change = historyQuery.data ? lastStatusChange(historyQuery.data, id => (id ? ownerNames[id] ?? 'Someone' : 'Someone')) : null;

  const milestones = useMemo(
    () =>
      milestoneRows
        .map(m => {
          const overdue = !!m.due_date && m.due_date.slice(0, 10) < todayIso && m.status !== 'complete' && m.status !== 'deferred';
          return { ...m, overdue, rank: overdue && m.status !== 'blocked' && m.status !== 'off_track' ? 2 : URGENCY[m.status] ?? 4 };
        })
        .sort((a, b) => a.rank - b.rank || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [milestoneRows, todayIso],
  );
  // With Individual Rocks or carryover to show, milestones share the row; otherwise they take the full width in two columns.
  const hasSide = node.children.length > 0 || (carryoverQuery.data?.links.length ?? 0) > 0;
  const shortScreen = useSyncExternalStore(subscribeShort, isShort, () => false);
  const shown = shortScreen ? (hasSide ? 3 : 6) : hasSide ? SHOWN_BESIDE : SHOWN_FULL;
  const visibleMilestones = showAll ? milestones : milestones.slice(0, shown);
  const breakdown = rock.milestoneBreakdown;
  const blockedMilestoneTitles = milestones.filter(m => m.status === 'blocked').map(m => parseMilestoneTitle(m.title).label);

  const dependencyFor = (b: { depends_on_rock_id: string | null; depends_on_milestone_id: string | null }): DependencyTarget | null => {
    if (b.depends_on_rock_id) {
      const target = editorRocks.data?.find(r => r.id === b.depends_on_rock_id);
      return { kind: 'Rock', label: target ? `${target.title} (${formatQuarter({ year: target.quarterYear, quarter: target.quarterNumber })})` : 'Another Rock' };
    }
    if (b.depends_on_milestone_id) {
      const target = milestoneRows.find(m => m.id === b.depends_on_milestone_id);
      return { kind: 'Milestone', label: target ? parseMilestoneTitle(target.title).label : 'A milestone on another Rock' };
    }
    return null;
  };

  const confirmed = outcomes.includes('confirmed') || outcomes.includes('changed');
  const dueLabel = formatDate(rock.due_date);

  return (
    <article aria-label={`Rock: ${rock.title}`} className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      {/* On a wide screen the status and issue rail starts beside the title, so both stay in reach; on a narrow one it sits right after the question. */}
      {/* On a narrow screen the wrapper below disappears (display: contents) so the rail can sit right after the question. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4">
      <header className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold', level.className)}>
            <LevelIcon className="h-3.5 w-3.5" aria-hidden />
            {level.label}
          </span>
          <Badge variant="outline">{formatQuarter({ year: rock.quarter_year, quarter: rock.quarter_number })}</Badge>
          {rock.function?.name && <Badge variant="outline">{rock.function.name}</Badge>}
          {rock.client_tenant_id ? <ClientBadge clientId={rock.client_tenant_id} /> : null}
          <Badge variant="outline" className={cn('gap-1 text-sm font-semibold', statusConfig.color, statusConfig.bgColor, statusConfig.borderColor)}>
            {status === 'blocked' && <Ban className="h-3.5 w-3.5" aria-hidden />}
            {statusConfig.label}
          </Badge>
        </div>
        <h2 ref={headingRef} tabIndex={-1} data-slide-heading className="break-words text-xl font-bold leading-tight outline-none sm:text-2xl lg:text-3xl [@media(min-height:821px)]:2xl:text-4xl">{rock.title}</h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground lg:text-base">
          <span className={cn(!ownerName && 'font-medium text-amber-700 dark:text-amber-300')}>{ownerName ? `Owner: ${ownerName}` : 'Nobody owns it'}</span>
          <span>{dueLabel ? `Due ${dueLabel}` : 'No due date'}</span>
          <button type="button" onClick={() => onOpenDetails(rock.id)} className="inline-flex items-center gap-1 rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open the full Rock
          </button>
          {rock.due_date && status !== 'complete' && rock.due_date.slice(0, 10) < todayIso && (
            <span className="font-medium text-destructive">{`${Math.max(1, Math.round((Date.parse(todayIso) - Date.parse(rock.due_date.slice(0, 10))) / 86400000))} days overdue`}</span>
          )}
        </p>
        {rock.description?.trim() && <p className="line-clamp-1 max-w-4xl text-sm text-muted-foreground" title={rock.description}>{rock.description}</p>}
      </header>

      <section aria-label="Why we are looking at this" className="min-w-0 space-y-2 rounded-xl border-l-4 border-l-primary bg-muted/40 px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 text-base font-medium leading-snug lg:text-lg xl:text-xl">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cue.headline}</span>
            {cue.question}
          </p>
        </div>
        {(reasons.length > 0 || change) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {reasons.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Flags">
                {reasons.map(reason => (
                  <li key={reason.key} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium sm:text-sm', REASON_TONE[reason.tone])}>
                    <TriangleAlert className="h-3 w-3" aria-hidden />
                    {reason.text}
                  </li>
                ))}
              </ul>
            )}
            {change && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
                <History className="h-3.5 w-3.5" aria-hidden />
                {change.text} on {format(new Date(change.occurredAt), 'd MMM')}.
              </p>
            )}
          </div>
        )}
      </section>

      <div className="order-2 min-w-0 space-y-4 lg:order-none xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-5 xl:gap-y-4 xl:space-y-0">
          {rockBlocker && (
            <div className="xl:col-span-2">
            <BlockerDetails
              wide
              compact
              blocker={rockBlocker}
              todayIso={todayIso}
              nameOf={nameOf}
              dependency={dependencyFor(rockBlocker)}
              canManage={node.reviewable}
              onEdit={() => setBlockerMode('record')}
              onResolve={() => setBlockerMode('resolve')}
            />
            </div>
          )}

          <section aria-labelledby={`ms-${rock.id}`} className={cn('min-w-0 space-y-2', !hasSide && 'xl:col-span-2')}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 id={`ms-${rock.id}`} className="text-base font-semibold">Milestones</h3>
              {breakdown && breakdown.total > 0 && (
                <>
                  <StatusBar size="md" className="w-28 shrink-0 sm:w-40" label="Milestones by status" counts={{ complete: breakdown.complete, inProgress: breakdown.inProgress, blocked: breakdown.blocked, offTrack: breakdown.offTrack, notStarted: breakdown.notStarted }} total={breakdown.total} />
                  <span className="text-sm tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{breakdown.complete}</span> of {breakdown.total} done
                    {breakdown.inProgress > 0 && <> · {breakdown.inProgress} in progress</>}
                    {breakdown.blocked > 0 && <> · <span className="font-medium text-violet-700 dark:text-violet-300">{breakdown.blocked} blocked</span></>}
                    {breakdown.offTrack > 0 && <> · <span className="font-medium text-orange-700 dark:text-orange-300">{breakdown.offTrack} off track</span></>}
                  </span>
                </>
              )}
            </div>
            {milestonesQuery.isLoading ? (
              <div className="space-y-2" aria-label="Loading milestones"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
            ) : milestonesQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">Milestones could not be loaded.</p>
            ) : milestones.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No milestones have been added to this Rock yet.</p>
            ) : (
              <>
                <ul className={cn('space-y-1.5', !hasSide && 'xl:grid xl:grid-cols-2 xl:gap-x-3 xl:gap-y-1.5 xl:space-y-0')}>
                  {visibleMilestones.map(m => {
                    const style = MILESTONE_STATUS[(m.status in MILESTONE_STATUS ? m.status : 'not_started') as RockMilestoneStatus];
                    const parsed = parseMilestoneTitle(m.title);
                    // The Rock's owner is already in the header; name a milestone's owner only when it is someone else (or nobody).
                    const ownerDiffers = (m.owner_id ?? null) !== (rock.owner_id ?? null);
                    const owner = m.owner_id ? ownerNames[m.owner_id] : null;
                    const blocker = openBlocker(blockers, 'milestone', m.id);
                    return (
                      <li key={m.id} className={cn('rounded-lg border bg-card px-2.5 py-1.5', (m.status === 'blocked' || m.status === 'off_track') && 'border-l-4 border-l-violet-500')}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className={cn('min-w-0 flex-1 basis-44 text-sm font-medium lg:text-base', m.status === 'complete' && 'text-muted-foreground line-through')}>
                            {parsed.number !== null && <span className="mr-2 rounded bg-muted px-1.5 font-mono text-xs font-semibold">M{parsed.number}</span>}
                            {parsed.label}
                          </span>
                          <Badge variant="outline" className={cn('border-transparent px-1.5 py-0 text-[11px]', style.className)}>{style.label}</Badge>
                          {ownerDiffers && <span className="text-xs text-muted-foreground sm:text-sm">{owner ?? 'Unassigned'}</span>}
                          <span className={cn('text-xs tabular-nums sm:text-sm', m.overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                            {m.due_date ? `${m.overdue ? 'Overdue · ' : ''}${formatDate(m.due_date, 'd MMM')}` : 'No date'}
                          </span>
                        </div>
                        {blocker && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-violet-900 dark:text-violet-200 sm:text-sm">
                            <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span className="break-words"><span className="font-medium">Blocked:</span> {blocker.reason}</span>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {milestones.length > shown && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(value => !value)}>
                    {showAll ? 'Show fewer' : `Show all ${milestones.length}`}
                  </Button>
                )}
              </>
            )}
          </section>

          <div className="min-w-0 space-y-4">
          {node.children.length > 0 && (
            <IndividualRocksSection
              companyRockId={rock.id}
              getUserInfo={id => (ownerNames[id] ? { name: ownerNames[id] } : null)}
              onOpenRock={onOpenDetails}
              defaultOpen
              hideCoverage
              // Milestones map up to a Company Rock's milestones, so only a Company Rock's slide can offer it; the
              // picker would list a Team Rock's own milestones, which the database refuses.
              canLink={node.reviewable && rock.rock_level === 'company'}
            />
          )}

          <CarryoverLinks data={carryoverQuery.data} isLoading={carryoverQuery.isLoading} isError={carryoverQuery.isError} nameOf={nameOf} onOpenRock={onOpenDetails} />

          </div>
        </div>
      </div>

        <div className="order-1 min-w-0 space-y-3 lg:order-none lg:sticky lg:top-0 lg:max-h-[calc(100dvh-9.5rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-1 xl:w-96">
          <RockStatusDecision
            rock={rock}
            canChange={node.reviewable}
            confirmed={confirmed}
            onOutcome={outcome => onOutcome(rock.id, outcome)}
            onBlock={() => setBlockerMode('record')}
            onResolve={() => setBlockerMode('resolve')}
          />
          <RaiseIssuePanel
            key={rock.id}
            rockId={rock.id}
            suggestion={suggestion}
            existing={issuesQuery.data ?? []}
            existingState={issuesQuery.isError ? 'error' : issuesQuery.isLoading || issuesQuery.data === undefined ? 'loading' : 'ready'}
            raisedNow={outcomes.includes('raised')}
            meeting={meeting}
            onRaised={() => onOutcome(rock.id, 'raised')}
            draft={{
              rockTitle: rock.title,
              status: rock.status,
              ownerName,
              dueLabel,
              quarterLabel,
              milestonesDone: breakdown ? { complete: breakdown.complete, total: breakdown.total } : null,
              blockedMilestoneTitles,
              reasons: reasons.map(r => r.text),
              blocker: rockBlocker
                ? {
                    reason: rockBlocker.reason,
                    nextAction: rockBlocker.next_action,
                    nextActionOwner: nameOf(rockBlocker.next_action_owner_id),
                    dependency: dependencyFor(rockBlocker)?.label ?? null,
                  }
                : null,
            }}
          />
        </div>

      {blockerMode === 'record' && (
        <BlockerDialog
          open
          onOpenChange={next => !next && setBlockerMode(null)}
          subject="rock"
          subjectId={rock.id}
          subjectLabel={rock.title}
          existing={rockBlocker}
          people={(people ?? []).map(u => ({ id: u.user_uuid, label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email }))}
          rockOptions={(editorRocks.data ?? []).filter(r => r.id !== rock.id && !r.archived).map(r => ({ id: r.id, label: `${formatQuarter({ year: r.quarterYear, quarter: r.quarterNumber })} · ${r.title}` }))}
          milestoneOptions={milestones.map(m => ({ id: m.id, label: parseMilestoneTitle(m.title).label }))}
          onSaved={() => onOutcome(rock.id, 'changed')}
        />
      )}
      {blockerMode === 'resolve' && (
        <ResolveBlockerDialog
          open
          onOpenChange={next => !next && setBlockerMode(null)}
          subject="rock"
          subjectId={rock.id}
          subjectLabel={rock.title}
          blocker={rockBlocker}
          onSaved={() => onOutcome(rock.id, 'changed')}
        />
      )}
    </article>
  );
}
