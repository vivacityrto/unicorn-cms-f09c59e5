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
  User,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { RockProgressControl } from '@/components/eos/RockProgressControl';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import { OffTrackRockPrompt, RockReviewPrompt } from '@/components/eos/facilitator/FacilitatorPrompts';
import { RocksInsights } from '@/components/eos/facilitator/RocksInsights';
import { useEosRocksHierarchy } from '@/hooks/useEosRocksHierarchy';
import { cn } from '@/lib/utils';
import {
  buildMeetingRocksCascade,
  collectBranchIds,
  emptyCounts,
  type RockCascadeNode,
  type StatusCounts,
} from '@/utils/meetingRocksCascade';
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
  not_started: 'bg-gray-300 dark:bg-gray-600',
  complete: 'bg-blue-500',
};

const STATUS_DOT_COLOUR: Record<UiRockStatus, string> = {
  on_track: 'bg-green-500',
  at_risk: 'bg-amber-500',
  off_track: 'bg-red-500',
  not_started: 'bg-gray-400',
  complete: 'bg-blue-500',
};

function initialsOf(name: string): string {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function StatusSummary({ counts }: { counts: StatusCounts }) {
  if (counts.total === 0) return null;
  return (
    <div className="space-y-2">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={STATUS_ORDER.filter(s => counts[s] > 0)
          .map(s => `${counts[s]} ${getStatusConfig(s).label}`)
          .join(', ')}
      >
        {STATUS_ORDER.filter(s => counts[s] > 0).map(s => (
          <div key={s} className={STATUS_BAR_COLOUR[s]} style={{ width: `${(counts[s] / counts.total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {STATUS_ORDER.filter(s => counts[s] > 0).map(s => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_COLOUR[s])} aria-hidden />
            <span className="font-medium text-foreground">{counts[s]}</span>
            {getStatusConfig(s).label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DescendantChips({ counts }: { counts: StatusCounts }) {
  if (counts.total === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1">
        <GitBranch className="h-3 w-3" aria-hidden />
        {counts.total} cascaded
      </span>
      {STATUS_ORDER.filter(s => counts[s] > 0 && s !== 'on_track').map(s => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_COLOUR[s])} aria-hidden />
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
  isOpen: (id: string, depth: number) => boolean;
  onToggle: (id: string, depth: number) => void;
  onOpenRock: (rock: RockWithHierarchy) => void;
  onEditRock: (rock: RockWithHierarchy) => void;
  parentTitle?: string | null;
}

function RockRow({ node, depth, ownerNames, showCascade, isOpen, onToggle, onOpenRock, onEditRock, parentTitle }: RowProps) {
  const { rock, reviewable, children, descendants } = node;
  const status = dbToUiStatus(rock.status);
  const statusConfig = getStatusConfig(status);
  const level = LEVEL[rock.rock_level || 'company'];
  const LevelIcon = level.icon;
  const ownerName = rock.owner_id ? ownerNames[rock.owner_id] : undefined;
  const hasChildren = showCascade && children.length > 0;
  const open = hasChildren && isOpen(rock.id, depth);
  const overdue = !!rock.due_date && status !== 'complete' && isPast(new Date(rock.due_date));
  const milestones = rock.milestoneStats;

  return (
    <li>
      <Card
        className={cn(
          'p-3 transition-colors',
          reviewable ? 'bg-muted/20' : 'bg-card',
          status === 'off_track' && 'border-l-4 border-l-red-500',
          status === 'at_risk' && 'border-l-4 border-l-amber-500',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
            {showCascade && (
              hasChildren ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-expanded={open}
                  aria-label={`${open ? 'Collapse' : 'Expand'} cascade for ${rock.title}`}
                  onClick={() => onToggle(rock.id, depth)}
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
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open Rock: ${rock.title}`}
                  onClick={() => onOpenRock(rock)}
                >
                  {rock.title}
                </button>
                {rock.function?.name && (
                  <Badge variant="outline" className="text-xs">{rock.function.name}</Badge>
                )}
                {rock.client_tenant_id ? <ClientBadge clientId={rock.client_tenant_id} /> : null}
              </div>
              {parentTitle && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3 rotate-180" aria-hidden />
                  <span className="truncate">From {parentTitle}</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {ownerName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initialsOf(ownerName)}</AvatarFallback>
                    </Avatar>
                    {ownerName}
                  </span>
                ) : (
                  <span>No owner</span>
                )}
                <span className={cn(overdue && 'font-medium text-destructive')}>
                  {rock.due_date ? `${overdue ? 'Overdue · ' : 'Due '}${format(new Date(rock.due_date), 'd MMM')}` : 'No due date'}
                </span>
                {milestones && milestones.total > 0 && (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Progress
                      value={(milestones.complete / milestones.total) * 100}
                      className="h-1.5 w-16"
                      aria-label="Milestone progress"
                    />
                    {milestones.complete}/{milestones.total} milestones
                  </span>
                )}
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
          <div className="mt-3">
            <OffTrackRockPrompt rockTitle={rock.title} />
          </div>
        )}
      </Card>

      {open && (
        <ul className="ml-5 mt-2 space-y-2 border-l-2 border-muted pl-4">
          {children.map(child => (
            <RockRow
              key={child.rock.id}
              node={child}
              depth={depth + 1}
              ownerNames={ownerNames}
              showCascade={showCascade}
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
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [viewingRockId, setViewingRockId] = useState<string | null>(null);

  const { roots, reviewRocks, counts } = useMemo(
    () => buildMeetingRocksCascade(quarterRocks, scope, ownerNames),
    [quarterRocks, scope, ownerNames],
  );
  const branchIds = useMemo(() => collectBranchIds(roots), [roots]);
  const rocksById = useMemo(() => new Map(quarterRocks.map(r => [r.id, r])), [quarterRocks]);

  // Top level opens to show its direct cascade; deeper levels start collapsed.
  const isOpen = (id: string, depth: number) => overrides[id] ?? depth < 1;
  const toggle = (id: string, depth: number) =>
    setOverrides(current => ({ ...current, [id]: !(current[id] ?? depth < 1) }));
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(branchIds.map(id => [id, open])));

  const viewingRock = viewingRockId ? rocksById.get(viewingRockId) ?? null : null;
  const viewingParent = viewingRock?.parent_rock_id ? rocksById.get(viewingRock.parent_rock_id) ?? null : null;
  const viewingChildren = viewingRock ? quarterRocks.filter(r => r.parent_rock_id === viewingRock.id) : [];

  const quarterLabel = `Q${currentQuarter.quarter} ${currentQuarter.year}`;
  const hasCascade = branchIds.length > 0;
  const showCascade = view === 'cascade';

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

      <StatusSummary counts={counts} />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : reviewRocks.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No active rocks for {quarterLabel}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={showCascade ? 'Rock cascade' : 'Rocks under review'}>
          {showCascade
            ? roots.map(node => (
                <RockRow
                  key={node.rock.id}
                  node={node}
                  depth={0}
                  ownerNames={ownerNames}
                  showCascade
                  isOpen={isOpen}
                  onToggle={toggle}
                  onOpenRock={rock => setViewingRockId(rock.id)}
                  onEditRock={onEditRock}
                />
              ))
            : reviewRocks.map(rock => (
                <RockRow
                  key={rock.id}
                  node={{ rock, reviewable: true, children: [], descendants: emptyCounts() }}
                  depth={0}
                  ownerNames={ownerNames}
                  showCascade={false}
                  isOpen={isOpen}
                  onToggle={toggle}
                  onOpenRock={r => setViewingRockId(r.id)}
                  onEditRock={onEditRock}
                  parentTitle={rock.parent_rock_id ? rocksById.get(rock.parent_rock_id)?.title : null}
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
