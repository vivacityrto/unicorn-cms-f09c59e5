import { useMemo, useState, type MouseEvent } from 'react';
import { Ban, ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CompanyMilestoneDeliveryBlock,
  SupportedMilestonesBlock,
} from '@/components/eos/rocks/MilestoneDelivery';
import { BlockerDetails, type DependencyTarget } from '@/components/eos/rocks/blockers/BlockerDetails';
import { MilestoneTasks } from '@/components/eos/rocks/detail/MilestoneTasks';
import { StatusBar } from '@/components/eos/rocks/detail/StatusBar';
import {
  companyMilestoneDelivery,
  supportedCompanyMilestones,
  type DeliveryData,
} from '@/utils/milestoneDelivery';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { formatDate, relativeDays, safeExternalUrl } from '@/utils/rockPanelFormat';
import {
  daysBetween,
  filterCounts,
  filterMilestones,
  isOpen,
  milestoneRef,
  parseMilestoneTitle,
  sortMilestones,
  type MilestoneFilter,
  type MilestoneSort,
  type PanelMilestone,
} from '@/utils/rockPanelMetrics';
import { summarizeMilestoneTasks, type MilestoneTaskLink } from '@/utils/rockMilestoneTasks';
import { openBlocker, type BlockerRow } from '@/utils/rockBlocker';
import { todayLocalIso } from '@/utils/localDate';

interface UserInfo {
  name: string;
  initials: string;
}

const PRIORITY: Record<string, { label: string; dot: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500' },
  high: { label: 'High', dot: 'bg-amber-500' },
  medium: { label: 'Medium', dot: 'bg-blue-400' },
  low: { label: 'Low', dot: 'bg-muted-foreground/50' },
};

const FILTERS: ReadonlyArray<{ key: MilestoneFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'not_started', label: 'Not started' },
  { key: 'done', label: 'Done' },
];

const COLUMNS =
  'grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 lg:grid-cols-[2.75rem_minmax(0,1fr)_6rem_7.25rem_5.5rem_8.5rem] lg:items-center';

/** What the table needs to show and change milestone blockers. Absent for legacy (JSON) milestones, which have no ids to attach a blocker to. */
export interface MilestoneBlockerSupport {
  blockers: BlockerRow[];
  canManage: boolean;
  nameOf: (userId: string | null) => string | null;
  dependencyFor: (blocker: BlockerRow) => DependencyTarget | null;
  onRecord: (milestoneId: string, label: string) => void;
  onResolve: (milestoneId: string, label: string) => void;
}

interface MilestoneTableProps {
  milestones: PanelMilestone[];
  /** Milestones to discuss: the metrics' own, plus delivery problems for a Company Rock. */
  attentionIds: ReadonlySet<string>;
  tasksByMilestone: ReadonlyMap<string, MilestoneTaskLink[]>;
  deliveryData?: DeliveryData;
  rockLevel: string | undefined;
  /** True when milestones come from the milestone table, so links and tasks can apply. */
  hasRows: boolean;
  rockOwnerId: string | null | undefined;
  todayIso: string;
  getUserInfo?: (userId: string) => UserInfo | null;
  onOpenRock?: (rockId: string) => void;
  blockerSupport?: MilestoneBlockerSupport;
}

function OwnerCell({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarFallback className="text-[9px]">
          {name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function MilestoneTable({
  milestones,
  attentionIds,
  tasksByMilestone,
  deliveryData,
  rockLevel,
  hasRows,
  rockOwnerId,
  todayIso,
  getUserInfo,
  onOpenRock,
  blockerSupport,
}: MilestoneTableProps) {
  const [filter, setFilter] = useState<MilestoneFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MilestoneSort>('plan');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const isCompany = rockLevel === 'company';
  const isIndividual = rockLevel === 'individual';

  const ownerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of [...milestones.map(m => m.ownerId), rockOwnerId]) {
      const name = id && getUserInfo ? getUserInfo(id)?.name : undefined;
      if (id && name) map.set(id, name);
    }
    return map;
  }, [milestones, rockOwnerId, getUserInfo]);

  const context = { attentionIds, ownerNames };
  const planPosition = new Map(sortMilestones(milestones, 'plan').map((m, index) => [m.id, index + 1]));
  const counts = filterCounts(milestones, context);
  const visible = sortMilestones(filterMilestones(milestones, filter, query, context), sort);
  const filtering = filter !== 'all' || query.trim() !== '';

  const toggle = (id: string) =>
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label="Milestone list" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter milestones" className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? 'default' : 'outline'}
              aria-pressed={filter === key}
              aria-label={`${label} ${counts[key]}`}
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setFilter(key)}
            >
              {label}
              <span className={cn('tabular-nums', filter === key ? 'opacity-90' : 'text-muted-foreground')}>{counts[key]}</span>
            </Button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {milestones.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search milestones"
                aria-label="Search milestones"
                className="h-7 w-44 pl-7 text-xs"
              />
            </div>
          )}
          <div role="group" aria-label="Sort milestones" className="flex rounded-md border">
            {(['plan', 'due'] as const).map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={sort === key}
                onClick={() => setSort(key)}
                className={cn(
                  'px-2 py-1 text-xs first:rounded-l-md last:rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  sort === key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                {key === 'plan' ? 'Plan order' : 'Due date'}
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded(new Set(visible.map(m => m.id)))}>
            Expand all
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
        </div>
      </div>

      {/* column headings, wide screens only */}
      <div className={cn('hidden px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid', COLUMNS)} aria-hidden>
        <span>Ref</span>
        <span>Milestone</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Due</span>
        <span>{isCompany ? 'Delivery' : 'Tasks'}</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>No milestones match{filtering ? ' these filters' : ''}.</p>
          {filtering && (
            <Button type="button" variant="link" size="sm" onClick={() => { setFilter('all'); setQuery(''); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {visible.map(milestone => {
            const open = expanded.has(milestone.id);
            const style = MILESTONE_STATUS[milestone.status];
            const needsAttention = attentionIds.has(milestone.id);
            const priority = milestone.priority ? PRIORITY[milestone.priority] : undefined;
            const ownerName = milestone.ownerId && getUserInfo
              ? getUserInfo(milestone.ownerId)?.name ?? null
              : rockOwnerId && getUserInfo ? getUserInfo(rockOwnerId)?.name ?? null : null;
            const days = milestone.dueDate && isOpen(milestone.status) ? daysBetween(todayIso, milestone.dueDate.slice(0, 10)) : null;
            const evidenceHref = milestone.evidenceUrl ? safeExternalUrl(milestone.evidenceUrl) : null;
            const tasks = tasksByMilestone.get(milestone.id) ?? [];
            const taskSummary = summarizeMilestoneTasks(tasks, milestone.status);
            const delivery = hasRows && isCompany && deliveryData ? companyMilestoneDelivery(milestone.id, deliveryData) : null;
            const supported = hasRows && isIndividual && deliveryData ? supportedCompanyMilestones(milestone.id, deliveryData) : [];
            const supportRefs = supported.map(s => milestoneRef({ ...parseMilestoneTitle(s.milestone.title) }));
            const detailsId = `milestone-details-${milestone.id}`;
            const blocker = blockerSupport ? openBlocker(blockerSupport.blockers, 'milestone', milestone.id) : null;

            const onRowClick = (event: MouseEvent<HTMLDivElement>) => {
              if (event.target instanceof Element && event.target.closest('button, a, input')) return;
              toggle(milestone.id);
            };

            return (
              <li
                key={milestone.id}
                className={cn(
                  'overflow-hidden rounded-lg border bg-card',
                  needsAttention && 'border-l-4 border-l-red-500',
                  milestone.status === 'complete' && 'bg-muted/20',
                )}
              >
                <div className={cn('grid cursor-pointer px-3 py-2.5 hover:bg-muted/40', COLUMNS)} onClick={onRowClick}>
                  <span className="inline-flex h-6 min-w-[2rem] items-center justify-center self-start rounded bg-muted px-1.5 font-mono text-xs font-semibold lg:self-center">
                    {milestone.number !== null ? `M${milestone.number}` : `#${planPosition.get(milestone.id) ?? ''}`}
                  </span>

                  <div className="min-w-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailsId}
                      onClick={() => toggle(milestone.id)}
                      className="group flex w-full items-start gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {open
                        ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className={cn('min-w-0 text-sm font-medium leading-snug break-words', milestone.status === 'complete' && 'text-muted-foreground line-through')}>
                        {milestone.label}
                      </span>
                    </button>
                    <p className="ml-[1.375rem] mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                      {priority && (
                        <span className="inline-flex items-center gap-1">
                          <span className={cn('h-1.5 w-1.5 rounded-full', priority.dot)} aria-hidden />
                          {priority.label}
                        </span>
                      )}
                      {supportRefs.length > 0 && <span>Supports {supportRefs.join(' · ')}</span>}
                    </p>
                    {blocker && (
                      <p className="ml-[1.375rem] mt-1 flex items-start gap-1.5 text-[11px] text-violet-900 dark:text-violet-200">
                        <Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words"><span className="font-medium">Blocked:</span> {blocker.reason}</span>
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 ml-[2.75rem] flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:contents">
                    <Badge variant="outline" className={cn('w-fit border-transparent px-1.5 py-0 text-[10px]', style.className)}>
                      {style.label}
                    </Badge>
                    <div className="min-w-0"><OwnerCell name={ownerName} /></div>
                    <div className="text-xs">
                      {milestone.dueDate ? (
                        <>
                          <span className="font-medium tabular-nums">{formatDate(milestone.dueDate, 'd MMM')}</span>
                          {days !== null && (
                            <span className={cn('block text-[11px]', days < 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                              {relativeDays(days)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No date</span>
                      )}
                    </div>
                    <div className="min-w-0 text-xs">
                      {delivery ? (
                        delivery.state === 'uncovered' ? (
                          <span className="font-medium text-amber-700 dark:text-amber-300">Nothing delivering</span>
                        ) : (
                          <div className="space-y-1">
                            <StatusBar
                              size="sm"
                              label={`${milestone.label}: delivery`}
                              total={delivery.counts.active}
                              counts={{ complete: delivery.counts.complete, inProgress: delivery.counts.inProgress, blocked: delivery.counts.blocked, offTrack: delivery.counts.offTrack }}
                            />
                            <span className="tabular-nums">
                              {delivery.counts.complete}/{delivery.counts.active} done
                              {delivery.counts.blocked > 0 && <span className="ml-1.5 font-medium text-destructive">{delivery.counts.blocked} blocked</span>}
                            </span>
                          </div>
                        )
                      ) : taskSummary.total > 0 ? (
                        <div className="space-y-1">
                          <StatusBar
                            size="sm"
                            label={`${milestone.label}: tasks`}
                            total={taskSummary.total}
                            counts={{ complete: taskSummary.closed, blocked: taskSummary.blocked }}
                          />
                          <span className="tabular-nums">
                            {taskSummary.closed}/{taskSummary.total} tasks
                            {taskSummary.blocked > 0 && <span className="ml-1.5 font-medium text-destructive">{taskSummary.blocked} blocked</span>}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {open && (
                  <div id={detailsId} className="grid gap-3 border-t bg-muted/20 p-3 lg:grid-cols-2">
                    <div className="space-y-2 text-xs">
                      {milestone.exitCriteria && (
                        <p className="break-words text-muted-foreground">
                          <span className="font-medium text-foreground">Done when: </span>
                          {milestone.exitCriteria}
                        </p>
                      )}
                      {evidenceHref && (
                        <a
                          href={evidenceHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          Evidence
                        </a>
                      )}
                      {!milestone.exitCriteria && !evidenceHref && (
                        <p className="text-muted-foreground">No exit criteria or evidence recorded.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {blocker && blockerSupport ? (
                        <BlockerDetails
                          compact
                          blocker={blocker}
                          todayIso={todayLocalIso()}
                          nameOf={blockerSupport.nameOf}
                          dependency={blockerSupport.dependencyFor(blocker)}
                          canManage={blockerSupport.canManage}
                          onEdit={() => blockerSupport.onRecord(milestone.id, milestone.label)}
                          onResolve={() => blockerSupport.onResolve(milestone.id, milestone.label)}
                        />
                      ) : blockerSupport?.canManage && milestone.status !== 'complete' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => blockerSupport.onRecord(milestone.id, milestone.label)}
                        >
                          <Ban className="mr-1 h-3 w-3" aria-hidden />
                          {milestone.status === 'blocked' ? 'Record the reason' : 'Mark as blocked'}
                        </Button>
                      ) : null}
                      {delivery && <CompanyMilestoneDeliveryBlock delivery={delivery} getUserInfo={getUserInfo} className="" />}
                      {isIndividual && hasRows && <SupportedMilestonesBlock supported={supported} onOpenRock={onOpenRock} className="" />}
                      <MilestoneTasks tasks={tasks} milestoneStatus={milestone.status} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
