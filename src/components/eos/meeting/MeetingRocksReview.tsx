import { useMemo, useState } from 'react';
import { format, isPast } from 'date-fns';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ListTree,
  Pencil,
  Rows3,
  Target,
  TriangleAlert,
  User,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { RockProgressControl } from '@/components/eos/RockProgressControl';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import { StatusBar, StatusLegend } from '@/components/eos/rocks/detail/StatusBar';
import { OffTrackRockPrompt, RockReviewPrompt } from '@/components/eos/facilitator/FacilitatorPrompts';
import { RocksInsights } from '@/components/eos/facilitator/RocksInsights';
import { useEosRocksHierarchy } from '@/hooks/useEosRocksHierarchy';
import { cn } from '@/lib/utils';
import {
  buildMeetingRocksCascade,
  collectBranchIds,
  standaloneNode,
  type RockCascadeNode,
  type StatusCounts,
} from '@/utils/meetingRocksCascade';
import type { MilestoneBreakdown } from '@/utils/rockMilestoneRollup';
import { dbToUiStatus, getStatusConfig, type UiRockStatus } from '@/utils/rockStatusUtils';
import type { RockLevel, RockWithHierarchy } from '@/types/eos';

interface MeetingRocksReviewProps {
  /** The meeting Configuration's rocks_scope: which levels the facilitator reviews. */
  scope: readonly string[];
  /** user_uuid -> display name, for owner labels and sorting. */
  ownerNames: Readonly<Record<string, string>>;
  onEditRock: (rock: RockWithHierarchy) => void;
}

const LEVEL: Record<RockLevel, { label: string; icon: typeof Building2; className: string }> = {
  company: { label: 'Company', icon: Building2, className: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  team: { label: 'Team', icon: Users, className: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
  individual: { label: 'Individual', icon: User, className: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
};

const STATUS_ORDER: UiRockStatus[] = ['on_track', 'at_risk', 'off_track', 'not_started', 'complete'];

const STATUS_BAR_COLOUR: Record<UiRockStatus, string> = {
  on_track: 'bg-green-500',
  at_risk: 'bg-amber-500',
  off_track: 'bg-red-500',
  not_started: 'bg-gray-400 dark:bg-gray-500',
  complete: 'bg-blue-500',
};

function initialsOf(name: string): string {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?';
}

/** The hook supplies a full breakdown; fall back to the simple total and complete count if that is all there is. */
function breakdownOf(rock: RockWithHierarchy): MilestoneBreakdown | undefined {
  if (rock.milestoneBreakdown) return rock.milestoneBreakdown;
  if (!rock.milestoneStats) return undefined;
  const { total, complete } = rock.milestoneStats;
  return { total, complete, inProgress: 0, blocked: 0, offTrack: 0, notStarted: total - complete, overdue: 0 };
}

function barCounts(b: MilestoneBreakdown) {
  return { complete: b.complete, inProgress: b.inProgress, blocked: b.blocked, offTrack: b.offTrack, notStarted: b.notStarted };
}

function RockStatusSummary({ counts }: { counts: StatusCounts }) {
  if (counts.total === 0) return null;
  const present = STATUS_ORDER.filter(s => counts[s] > 0);
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">Rocks under review</h4>
        <span className="text-xs tabular-nums text-muted-foreground">{counts.total}</span>
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted-foreground/20"
        role="img"
        aria-label={`Rocks by status: ${present.map(s => `${counts[s]} ${getStatusConfig(s).label}`).join(', ')}`}
      >
        {present.map(s => (
          <div key={s} className={cn('h-full min-w-[3px]', STATUS_BAR_COLOUR[s])} style={{ width: `${(counts[s] / counts.total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {present.map(s => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', STATUS_BAR_COLOUR[s])} aria-hidden />
            <span className="font-medium tabular-nums text-foreground">{counts[s]}</span>
            {getStatusConfig(s).label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MilestoneSummary({ totals }: { totals: MilestoneBreakdown }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold">Milestones</h4>
        <span className="text-xs tabular-nums text-muted-foreground">
          {totals.total === 0 ? 'None yet' : (
            <>
              <span className="font-semibold text-foreground">{totals.complete}</span> of {totals.total} done
              {totals.blocked > 0 && <span className="ml-2 font-medium text-destructive">{totals.blocked} blocked</span>}
              {totals.offTrack > 0 && <span className="ml-2 font-medium text-orange-600 dark:text-orange-400">{totals.offTrack} off track</span>}
              {totals.overdue > 0 && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">{totals.overdue} overdue</span>}
            </>
          )}
        </span>
      </div>
      <StatusBar size="lg" label="Milestones across these Rocks" counts={barCounts(totals)} total={totals.total} />
      <StatusLegend counts={barCounts(totals)} />
    </div>
  );
}

function MilestoneMeter({ breakdown }: { breakdown?: MilestoneBreakdown }) {
  if (!breakdown || breakdown.total === 0) {
    return <span className="text-xs text-muted-foreground">No milestones yet</span>;
  }
  const percent = Math.round((breakdown.complete / breakdown.total) * 100);
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <StatusBar size="md" className="w-36 shrink-0" label="Milestones" counts={barCounts(breakdown)} total={breakdown.total} />
      <span className="whitespace-nowrap tabular-nums">
        <span className="font-semibold">{breakdown.complete}</span>
        <span className="text-muted-foreground">/{breakdown.total} milestones · {percent}%</span>
      </span>
    </span>
  );
}

function AttentionChips({ breakdown, bubbled }: { breakdown?: MilestoneBreakdown; bubbled: boolean }) {
  const chips: Array<{ key: string; text: string; className: string }> = [];
  if (breakdown && breakdown.blocked > 0) {
    chips.push({ key: 'blocked', text: `${breakdown.blocked} blocked ${breakdown.blocked === 1 ? 'milestone' : 'milestones'}`, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' });
  }
  if (breakdown && breakdown.offTrack > 0) {
    chips.push({ key: 'offTrack', text: `${breakdown.offTrack} off track`, className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' });
  }
  if (breakdown && breakdown.overdue > 0) {
    chips.push({ key: 'overdue', text: `${breakdown.overdue} overdue`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' });
  }
  if (bubbled) {
    chips.push({ key: 'bubbled', text: 'Needs attention below', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' });
  }
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map(chip => (
        <Badge key={chip.key} variant="outline" className={cn('gap-1 border-transparent px-1.5 py-0 text-[11px] font-medium', chip.className)}>
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {chip.text}
        </Badge>
      ))}
    </>
  );
}

function DescendantChips({ counts }: { counts: StatusCounts }) {
  if (counts.total === 0) return null;
  const dot: Record<UiRockStatus, string> = {
    on_track: 'bg-green-500', at_risk: 'bg-amber-500', off_track: 'bg-red-500', not_started: 'bg-gray-400', complete: 'bg-blue-500',
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1">
        <GitBranch className="h-3 w-3" aria-hidden />
        {counts.total} cascaded
      </span>
      {STATUS_ORDER.filter(s => counts[s] > 0 && s !== 'on_track').map(s => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={cn('h-1.5 w-1.5 rounded-full', dot[s])} aria-hidden />
          {counts[s]} {getStatusConfig(s).label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

interface RowProps {
  node: RockCascadeNode;
  depth: number;
  ownerNames: Readonly<Record<string, string>>;
  showCascade: boolean;
  /** Only Rocks that need discussing, and the path down to them. */
  attentionOnly: boolean;
  isOpen: (id: string, defaultOpen: boolean) => boolean;
  onToggle: (id: string, currentlyOpen: boolean) => void;
  onOpenRock: (rock: RockWithHierarchy) => void;
  onEditRock: (rock: RockWithHierarchy) => void;
  parentTitle?: string | null;
}

function RockRow({ node, depth, ownerNames, showCascade, attentionOnly, isOpen, onToggle, onOpenRock, onEditRock, parentTitle }: RowProps) {
  const { rock, reviewable, children, descendants, attention } = node;
  const status = dbToUiStatus(rock.status);
  const statusConfig = getStatusConfig(status);
  const level = LEVEL[rock.rock_level || 'company'];
  const LevelIcon = level.icon;
  const ownerName = rock.owner_id ? ownerNames[rock.owner_id] : undefined;
  const shownChildren = attentionOnly ? children.filter(child => child.needsAttention) : children;
  const hasChildren = showCascade && children.length > 0;
  const defaultOpen = depth < 1 || (attentionOnly && shownChildren.length > 0);
  const open = hasChildren && isOpen(rock.id, defaultOpen);
  const overdue = !!rock.due_date && status !== 'complete' && isPast(new Date(rock.due_date));
  const breakdown = breakdownOf(rock);
  const red = attention.includes('off_track') || attention.includes('blocked_milestones');
  const amber = !red && (attention.includes('at_risk') || attention.includes('overdue_milestones') || attention.includes('rock_overdue'));
  const bubbledOnly = showCascade && !open && attention.length === 0 && node.needsAttention;

  return (
    <li>
      <Card className={cn('p-3 transition-colors', reviewable ? 'bg-muted/20' : 'bg-card', red && 'border-l-4 border-l-red-500', amber && 'border-l-4 border-l-amber-500')}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-72 items-start gap-2">
            {showCascade && (
              hasChildren ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-expanded={open}
                  aria-label={`${open ? 'Collapse' : 'Expand'} cascade for ${rock.title}`}
                  onClick={() => onToggle(rock.id, open)}
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden />
              )
            )}
            <span
              className={cn('mt-0.5 shrink-0 rounded p-1.5', level.className)}
              role="img"
              aria-label={`${level.label} Rock`}
              title={level.label}
            >
              <LevelIcon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open Rock: ${rock.title}`}
                  onClick={() => onOpenRock(rock)}
                >
                  {rock.title}
                </button>
                {rock.function?.name && <Badge variant="outline" className="text-xs">{rock.function.name}</Badge>}
                {rock.client_tenant_id ? <ClientBadge clientId={rock.client_tenant_id} /> : null}
              </div>
              {parentTitle && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3 rotate-180" aria-hidden />
                  <span className="truncate">From {parentTitle}</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                {ownerName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initialsOf(ownerName)}</AvatarFallback>
                    </Avatar>
                    {ownerName}
                  </span>
                ) : (
                  <span className={cn(attention.includes('no_owner') && 'font-medium text-amber-700 dark:text-amber-300')}>No owner</span>
                )}
                <span className={cn(overdue && 'font-medium text-destructive')}>
                  {rock.due_date ? `${overdue ? 'Overdue · ' : 'Due '}${format(new Date(rock.due_date), 'd MMM')}` : 'No due date'}
                </span>
                <AttentionChips breakdown={breakdown} bubbled={bubbledOnly} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <MilestoneMeter breakdown={breakdown} />
                {showCascade && <DescendantChips counts={descendants} />}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {reviewable ? (
              <RockProgressControl key={`${rock.id}-${rock.status}`} rock={rock} compact />
            ) : (
              <Badge variant="outline" className={cn('text-xs', statusConfig.color, statusConfig.bgColor, statusConfig.borderColor)}>
                {statusConfig.label}
              </Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => onEditRock(rock)} aria-label={`Edit Rock: ${rock.title}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {reviewable && status === 'off_track' && (
          // The facilitator prompt renders nothing for other viewers; don't leave its margin behind.
          <div className="mt-3 empty:hidden">
            <OffTrackRockPrompt rockTitle={rock.title} />
          </div>
        )}
      </Card>

      {open && (
        <ul className="ml-5 mt-2 space-y-2 border-l-2 border-muted pl-4">
          {shownChildren.map(child => (
            <RockRow
              key={child.rock.id}
              node={child}
              depth={depth + 1}
              ownerNames={ownerNames}
              showCascade={showCascade}
              attentionOnly={attentionOnly}
              isOpen={isOpen}
              onToggle={onToggle}
              onOpenRock={onOpenRock}
              onEditRock={onEditRock}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MeetingRocksReview({ scope, ownerNames, onEditRock }: MeetingRocksReviewProps) {
  const { quarterRocks, isLoading, currentQuarter } = useEosRocksHierarchy();
  const [view, setView] = useState<'cascade' | 'list'>('cascade');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [viewingRockId, setViewingRockId] = useState<string | null>(null);

  const { roots, reviewRocks, counts, milestoneTotals } = useMemo(
    () => buildMeetingRocksCascade(quarterRocks, scope, ownerNames),
    [quarterRocks, scope, ownerNames],
  );
  const listNodes = useMemo(() => reviewRocks.map(rock => standaloneNode(rock, scope)), [reviewRocks, scope]);
  const branchIds = useMemo(() => collectBranchIds(roots), [roots]);
  const rocksById = useMemo(() => new Map(quarterRocks.map(r => [r.id, r])), [quarterRocks]);

  const showCascade = view === 'cascade';
  const attentionCount = showCascade
    ? roots.filter(node => node.needsAttention).length
    : listNodes.filter(node => node.attention.length > 0).length;
  const visibleRoots = attentionOnly ? roots.filter(node => node.needsAttention) : roots;
  const visibleList = attentionOnly ? listNodes.filter(node => node.attention.length > 0) : listNodes;

  // Top level opens to show its direct cascade; deeper levels start collapsed.
  const isOpen = (id: string, defaultOpen: boolean) => overrides[id] ?? defaultOpen;
  const toggle = (id: string, currentlyOpen: boolean) => setOverrides(current => ({ ...current, [id]: !currentlyOpen }));
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(branchIds.map(id => [id, open])));

  const viewingRock = viewingRockId ? rocksById.get(viewingRockId) ?? null : null;
  const viewingParent = viewingRock?.parent_rock_id ? rocksById.get(viewingRock.parent_rock_id) ?? null : null;
  const viewingChildren = viewingRock ? quarterRocks.filter(r => r.parent_rock_id === viewingRock.id) : [];

  const quarterLabel = `Q${currentQuarter.quarter} ${currentQuarter.year}`;
  const hasCascade = branchIds.length > 0;

  const getUserInfo = (userId: string) => {
    const name = ownerNames[userId];
    return name ? { name, initials: initialsOf(name) } : null;
  };

  return (
    <Card className="space-y-5 p-4 sm:p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-5 w-5 text-primary" />
            Rock Review
            <Badge variant="outline" className="text-xs font-normal">{quarterLabel}</Badge>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={attentionOnly ? 'default' : 'outline'}
              aria-pressed={attentionOnly}
              className="h-8 gap-1.5"
              onClick={() => setAttentionOnly(value => !value)}
            >
              <TriangleAlert className="h-4 w-4" aria-hidden />
              Needs attention
              <span className="tabular-nums">{attentionCount}</span>
            </Button>
            {showCascade && hasCascade && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setAll(true)}>Expand all</Button>
                <Button variant="ghost" size="sm" onClick={() => setAll(false)}>Collapse all</Button>
              </>
            )}
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(value) => value && setView(value as 'cascade' | 'list')}
              variant="outline"
              size="sm"
              aria-label="Rock Review layout"
            >
              <ToggleGroupItem value="cascade" aria-label="Cascade view">
                <ListTree className="mr-1.5 h-4 w-4" />
                Cascade
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <Rows3 className="mr-1.5 h-4 w-4" />
                List
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Quick status update only - On Track or Off Track. No discussion.
        </p>
      </div>

      <div className="space-y-3">
        <RockReviewPrompt />
        {/* Same scope-filtered set the review shows, so insights never reference
            a Rock this segment isn't displaying. */}
        <RocksInsights rocks={reviewRocks.map(r => ({ ...r, owner_user_id: r.owner_id }))} />
      </div>

      {counts.total > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <RockStatusSummary counts={counts} />
          <MilestoneSummary totals={milestoneTotals} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : reviewRocks.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No active rocks for {quarterLabel}
        </p>
      ) : (showCascade ? visibleRoots.length : visibleList.length) === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>Nothing needs attention in these Rocks.</p>
          <Button type="button" variant="link" size="sm" onClick={() => setAttentionOnly(false)}>Show all Rocks</Button>
        </div>
      ) : (
        <ul className="space-y-2" aria-label={showCascade ? 'Rock cascade' : 'Rocks under review'}>
          {showCascade
            ? visibleRoots.map(node => (
                <RockRow
                  key={node.rock.id}
                  node={node}
                  depth={0}
                  ownerNames={ownerNames}
                  showCascade
                  attentionOnly={attentionOnly}
                  isOpen={isOpen}
                  onToggle={toggle}
                  onOpenRock={rock => setViewingRockId(rock.id)}
                  onEditRock={onEditRock}
                />
              ))
            : visibleList.map(node => (
                <RockRow
                  key={node.rock.id}
                  node={node}
                  depth={0}
                  ownerNames={ownerNames}
                  showCascade={false}
                  attentionOnly={false}
                  isOpen={isOpen}
                  onToggle={toggle}
                  onOpenRock={rock => setViewingRockId(rock.id)}
                  onEditRock={onEditRock}
                  parentTitle={node.rock.parent_rock_id ? rocksById.get(node.rock.parent_rock_id)?.title : null}
                />
              ))}
        </ul>
      )}

      <RockDetailSheet
        rock={viewingRock}
        open={viewingRockId !== null}
        onOpenChange={(open) => {
          if (!open) setViewingRockId(null);
        }}
        parentRock={viewingParent}
        childRocks={viewingChildren}
        onEdit={(rock) => {
          setViewingRockId(null);
          onEditRock(rock);
        }}
        getUserInfo={getUserInfo}
        onOpenRock={setViewingRockId}
      />
    </Card>
  );
}
