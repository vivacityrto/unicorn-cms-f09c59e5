import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Armchair,
  Ban,
  Calendar,
  ChevronDown,
  ChevronRight,
  CornerUpRight,
  Flag,
  GitBranch,
  Maximize2,
  Minimize2,
  Pencil,
  Target,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BlockerDetails, ResolvedBlockerList, type DependencyTarget } from '@/components/eos/rocks/blockers/BlockerDetails';
import { BlockerDialog } from '@/components/eos/rocks/blockers/BlockerDialog';
import { ResolveBlockerDialog } from '@/components/eos/rocks/blockers/ResolveBlockerDialog';
import { CarryForwardDialog } from '@/components/eos/rocks/carryover/CarryForwardDialog';
import { CarryoverLinks } from '@/components/eos/rocks/carryover/CarryoverLinks';
import { IndividualRocksSection } from '@/components/eos/rocks/contribution/IndividualRocksSection';
import { RockNotesPanel } from '@/components/eos/rocks/notes/RockNotesPanel';
import { RockTodoList } from '@/components/eos/rocks/todos/RockTodoList';
import { useRockTodos } from '@/hooks/useRockTodos';
import { splitTodosByMilestone } from '@/utils/rockTodos';
import { LinkMilestoneDialog } from '@/components/eos/rocks/linking/LinkMilestoneDialog';
import { MilestoneHero } from '@/components/eos/rocks/detail/MilestoneHero';
import { MilestoneTable } from '@/components/eos/rocks/detail/MilestoneTable';
import { RockHistory } from '@/components/eos/rocks/detail/RockHistory';
import { useAuth } from '@/hooks/useAuth';
import { useMilestoneDelivery } from '@/hooks/useMilestoneDelivery';
import { useRockBlockers } from '@/hooks/useRockBlockers';
import { useRockCarryover } from '@/hooks/useRockCarryover';
import { useEditorRocks } from '@/hooks/useRockEditorData';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { todayLocalIso } from '@/utils/localDate';
import { deliveryAttentionIds, deliveryByRock, rockDeliverySummary } from '@/utils/milestoneDelivery';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { formatDate, relativeDays } from '@/utils/rockPanelFormat';
import {
  daysBetween,
  milestoneMetrics,
  parseMilestoneTitle,
  type PanelMilestone,
} from '@/utils/rockPanelMetrics';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';
import type { MilestoneTaskLink } from '@/utils/rockMilestoneTasks';
import { openBlocker, resolvedBlockers, type BlockerSubject } from '@/utils/rockBlocker';
import { formatQuarter } from '@/utils/rockCarryover';
import { linkTargetRocksFor } from '@/utils/rockLinking';
import { dbToUiStatus, getStatusConfig } from '@/utils/rockStatusUtils';
import type {
  EosRock,
  EosRockMilestone,
  RockLevel,
  RockMilestoneStatus,
  RockWithHierarchy,
} from '@/types/eos';

interface UserInfo {
  name: string;
  initials: string;
  avatarUrl?: string | null;
}

interface RockDetailSheetProps {
  rock: RockWithHierarchy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentRock?: EosRock | null;
  childRocks?: EosRock[];
  onEdit?: (rock: RockWithHierarchy) => void;
  onViewCascade?: (rock: RockWithHierarchy) => void;
  getUserInfo?: (userId: string) => UserInfo | null;
  /** Switch the panel to another Rock, e.g. from an Individual milestone to the Company Rock it supports. */
  onOpenRock?: (rockId: string) => void;
}

const LEVEL_STYLES: Record<RockLevel, { label: string; className: string }> = {
  company: { label: 'Company', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  team: { label: 'Team', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  individual: { label: 'Individual', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

const WIDE_KEY = 'eos-rock-panel-wide';

/** The viewer's preferred panel width, remembered per browser. Falls back quietly if storage is blocked. */
function useWidePreference() {
  const [wide, setWide] = useState(() => {
    try {
      return localStorage.getItem(WIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const update = (value: boolean) => {
    setWide(value);
    try {
      localStorage.setItem(WIDE_KEY, value ? '1' : '0');
    } catch {
      /* storage unavailable: the choice just doesn't persist */
    }
  };
  return [wide, update] as const;
}

function milestoneStatusOf(value: string | null | undefined, completed?: boolean): RockMilestoneStatus {
  if (value && value in MILESTONE_STATUS) return value as RockMilestoneStatus;
  return completed ? 'complete' : 'not_started';
}

function toPanelMilestone(
  base: Omit<PanelMilestone, 'label' | 'number'>,
): PanelMilestone {
  return { ...base, ...parseMilestoneTitle(base.title) };
}

/** Legacy milestones live as JSON on the Rock until they are migrated to eos_rock_milestones. */
function legacyMilestones(rock: RockWithHierarchy): PanelMilestone[] {
  if (!Array.isArray(rock.milestones)) return [];
  return (rock.milestones as unknown as Array<Record<string, unknown>>)
    .map((m, index) =>
      toPanelMilestone({
        id: typeof m.id === 'string' ? m.id : `legacy-${index}`,
        title: typeof m.text === 'string' ? m.text : '',
        status: milestoneStatusOf(typeof m.status === 'string' ? m.status : null, m.completed === true),
        priority: typeof m.priority === 'string' ? m.priority : null,
        ownerId: typeof m.owner_id === 'string' ? m.owner_id : null,
        dueDate: typeof m.due_date === 'string' && m.due_date ? m.due_date : null,
        exitCriteria: typeof m.exit_criteria === 'string' && m.exit_criteria ? m.exit_criteria : null,
        evidenceUrl: typeof m.evidence_url === 'string' && m.evidence_url ? m.evidence_url : null,
        order: index,
      }),
    )
    .filter(m => m.title.trim());
}

function PersonChip({ info }: { info?: UserInfo | null }) {
  if (!info?.name) return <span className="text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar className="h-6 w-6 shrink-0">
        {info.avatarUrl && <AvatarImage src={info.avatarUrl} alt={info.name} />}
        <AvatarFallback className="text-[10px]">{info.initials || <Users className="h-3 w-3" />}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium">{info.name}</span>
    </span>
  );
}

function NarrativeBlock({ label, text }: { label: string; text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{text}</p>
    </section>
  );
}

function RelatedRockRow({ rock, ownerInfo }: { rock: EosRock; ownerInfo?: UserInfo | null }) {
  const status = getStatusConfig(rock.status);
  const level = LEVEL_STYLES[rock.rock_level || 'company'];
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">{rock.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', level.className)}>{level.label}</Badge>
          {ownerInfo && <span className="truncate">{ownerInfo.name}</span>}
        </div>
      </div>
      <Badge variant="outline" className={cn('shrink-0 text-xs', status.color, status.bgColor, status.borderColor)}>
        {status.label}
      </Badge>
    </li>
  );
}

export function RockDetailSheet({
  rock,
  open,
  onOpenChange,
  parentRock,
  childRocks = [],
  onEdit,
  onViewCascade,
  getUserInfo,
  onOpenRock,
}: RockDetailSheetProps) {
  const { profile } = useAuth();
  const rockId = rock?.id;
  const [wide, setWide] = useWidePreference();
  const [contextOpen, setContextOpen] = useState(false);
  const [blockerTarget, setBlockerTarget] = useState<{ subject: BlockerSubject; id: string; label: string; mode: 'record' | 'resolve' } | null>(null);
  const [carryOpen, setCarryOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ id: string; title: string } | null>(null);

  const milestonesQuery = useQuery({
    queryKey: ['eos-rock-milestones', rockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('*')
        .eq('rock_id', rockId!)
        .order('sort_order', { ascending: true });
      if (error) {
        // Table not deployed yet: fall back to the legacy JSON on the Rock.
        if (isRockMilestoneSchemaUnavailable(error)) return [] as EosRockMilestone[];
        throw error;
      }
      return data as EosRockMilestone[];
    },
    enabled: !!profile && open && !!rockId,
  });

  const normalized = milestonesQuery.data;
  const normalizedIds = (normalized || []).map(m => m.id);

  // Both directions of the Company <-> Individual milestone links, with the
  // contributors and Rocks needed to name and measure them.
  const deliveryQuery = useMilestoneDelivery({ rockId, milestoneIds: normalizedIds, enabled: !!profile && open });
  const deliveryData = deliveryQuery.data;

  // GitHub tasks linked to milestones (static snapshots since the rock-task-sync webhook was retired on 2026-10-28). Tolerates the table not
  // existing yet so the panel still opens if the frontend deploys first.
  // To-Dos linked to the Rock or its milestones: live, unlike the outside-tracker snapshots below.
  // (A hook, so it stays above the early return.)
  const todosQuery = useRockTodos(rockId, open);

  const tasksQuery = useQuery({
    queryKey: ['eos-rock-milestone-tasks', rockId, normalizedIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rock_milestone_task_links')
        .select('id, milestone_id, external_key, external_url, title, task_state, task_status, priority, due_date, assignees, last_synced_at')
        .in('milestone_id', normalizedIds);
      if (error) {
        if (isRockMilestoneSchemaUnavailable(error)) return [] as MilestoneTaskLink[];
        throw error;
      }
      return data as MilestoneTaskLink[];
    },
    enabled: !!profile && open && normalizedIds.length > 0,
  });

  const blockersQuery = useRockBlockers(rockId, normalizedIds, !!profile && open);
  const carryoverQuery = useRockCarryover(rockId, open);
  const { data: people } = useVivacityTeamUsers();
  const editorRocksQuery = useEditorRocks(open && !!profile);

  if (!rock) return null;

  // Recording, editing and resolving blockers and carrying work forward are changes, so they
  // follow the same gate as editing the Rock. The database repeats the staff check.
  const canManage = !!onEdit;
  // Which Rocks above this one its milestones can be mapped up to: the Team and/or Company Rock (Individual and Team Rocks only).
  const linkRoot = rock.rock_level === 'individual' || rock.rock_level === 'team'
    ? linkTargetRocksFor(
        { id: rock.id, title: rock.title, level: rock.rock_level ?? null, parentId: rock.parent_rock_id ?? null },
        new Map((editorRocksQuery.data ?? []).map(r => [r.id, { id: r.id, title: r.title, level: r.level, parentId: r.parentId }])),
      )
    : null;
  const nameOf = (userId: string | null) => (userId && getUserInfo ? getUserInfo(userId)?.name ?? null : null);
  const blockers = blockersQuery.data ?? [];
  const rockBlocker = openBlocker(blockers, 'rock', rock.id);
  const rockResolved = resolvedBlockers(blockers, 'rock', rock.id);
  const isArchived = !!rock.archived_at;
  const rockIsComplete = dbToUiStatus(rock.status) === 'complete';

  const hasRows = !!normalized && normalized.length > 0;
  const milestones: PanelMilestone[] = hasRows
    ? normalized.map((m, index) =>
        toPanelMilestone({
          id: m.id,
          title: m.title,
          status: milestoneStatusOf(m.status),
          priority: m.priority,
          ownerId: m.owner_id ?? null,
          dueDate: m.due_date ?? null,
          exitCriteria: m.exit_criteria ?? null,
          evidenceUrl: m.evidence_url ?? null,
          order: m.sort_order ?? index,
        }),
      )
    : legacyMilestones(rock);

  const dependencyFor = (blocker: { depends_on_rock_id: string | null; depends_on_milestone_id: string | null }): DependencyTarget | null => {
    if (blocker.depends_on_rock_id) {
      const target = editorRocksQuery.data?.find(r => r.id === blocker.depends_on_rock_id);
      return {
        kind: 'Rock',
        label: target ? `${target.title} (${formatQuarter({ year: target.quarterYear, quarter: target.quarterNumber })})` : 'Another Rock',
        onOpen: onOpenRock ? () => onOpenRock(blocker.depends_on_rock_id as string) : undefined,
      };
    }
    if (blocker.depends_on_milestone_id) {
      const target = milestones.find(m => m.id === blocker.depends_on_milestone_id);
      return { kind: 'Milestone', label: target ? target.label : 'A milestone on another Rock' };
    }
    return null;
  };
  const personOptions = (people ?? []).map(u => ({
    id: u.user_uuid,
    label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
  }));
  const rockPickOptions = (editorRocksQuery.data ?? [])
    .filter(r => r.id !== rock.id && !r.archived)
    .map(r => ({ id: r.id, label: `${formatQuarter({ year: r.quarterYear, quarter: r.quarterNumber })} · ${r.title}` }));
  const milestonePickOptions = (excludeId?: string) =>
    milestones.filter(m => m.id !== excludeId).map(m => ({ id: m.id, label: m.label }));

  const { byMilestone: todosByMilestone, rockLevel: rockLevelTodos } = splitTodosByMilestone(todosQuery.data ?? []);

  const tasks = tasksQuery.data ?? [];
  const tasksByMilestone = new Map<string, MilestoneTaskLink[]>();
  for (const task of tasks) {
    const list = tasksByMilestone.get(task.milestone_id) || [];
    list.push(task);
    tasksByMilestone.set(task.milestone_id, list);
  }

  const todayIso = todayLocalIso();
  const metrics = milestoneMetrics(milestones, tasks, todayIso, todosQuery.data ?? []);
  const isCompany = rock.rock_level === 'company';
  const companyDelivery = isCompany && deliveryData && hasRows
    ? {
        summary: rockDeliverySummary(milestones.map(m => m.id), deliveryData),
        shares: deliveryByRock(milestones.map(m => m.id), deliveryData),
      }
    : null;

  // What to discuss: the milestones' own problems, plus (for a Company Rock) any
  // milestone whose delivery is blocked, at risk or has nothing behind it.
  const attentionIds = new Set(metrics.attentionIds);
  if (isCompany && deliveryData && hasRows) {
    for (const id of deliveryAttentionIds(milestones.map(m => m.id), deliveryData)) attentionIds.add(id);
  }

  const uiStatus = dbToUiStatus(rock.rollupStatus || rock.status);
  const statusConfig = getStatusConfig(uiStatus);
  const level = LEVEL_STYLES[rock.rock_level || 'company'];
  const ownerInfo = rock.owner_id && getUserInfo ? getUserInfo(rock.owner_id) : null;

  const hasStatusMismatch = metrics.percentComplete !== null && (
    (uiStatus === 'complete' && metrics.percentComplete < 100) ||
    (metrics.percentComplete === 100 && uiStatus !== 'complete')
  );

  const dueLabel = formatDate(rock.due_date);
  const dueDays = rock.due_date && uiStatus !== 'complete'
    ? daysBetween(todayIso, rock.due_date.slice(0, 10))
    : null;

  const seatName = rock.seat?.seat_name;
  const functionName = rock.function?.name;
  const hasNarrative = !!(rock.description?.trim() || rock.issue?.trim() || rock.outcome?.trim());
  const hasAlignment = !!parentRock || childRocks.length > 0;
  const createdLabel = formatDate(rock.created_at);
  const updatedLabel = formatDate(rock.updated_at);
  const preview = (rock.description || rock.issue || rock.outcome || '').trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          'flex w-full max-w-none flex-col gap-0 p-0 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 sm:max-w-none',
          wide ? 'lg:w-[min(1320px,96vw)]' : 'lg:w-[min(960px,92vw)]',
        )}
        // Focus the panel itself, not its first button, so no control opens looking selected.
        onOpenAutoFocus={event => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader className="space-y-2 border-b px-4 py-3 pr-24 text-left sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('text-xs', level.className)}>{level.label}</Badge>
              <Badge variant="outline" className="text-xs">Q{rock.quarter_number} {rock.quarter_year}</Badge>
              <Badge
                variant="outline"
                className={cn('text-xs font-semibold', statusConfig.color, statusConfig.bgColor, statusConfig.borderColor)}
              >
                {statusConfig.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <PersonChip info={ownerInfo} />
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="font-medium">{dueLabel ? `Due ${dueLabel}` : 'No due date'}</span>
                {dueDays !== null && (
                  <span className={cn('text-xs', dueDays < 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {relativeDays(dueDays)}
                  </span>
                )}
              </span>
              {functionName && (
                <span className="inline-flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {functionName}
                </span>
              )}
              {seatName && (
                <span className="inline-flex items-center gap-1.5">
                  <Armchair className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {seatName}
                </span>
              )}
            </div>
          </div>
          <SheetTitle className="line-clamp-2 text-lg font-semibold leading-snug break-words lg:text-xl" title={rock.title}>
            {rock.title}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Read-only details for this Rock, led by its milestones, with context and alignment below.
          </SheetDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-12 top-3 hidden h-8 w-8 lg:inline-flex"
            aria-label={wide ? 'Make the panel narrower' : 'Make the panel wider'}
            aria-pressed={wide}
            onClick={() => setWide(!wide)}
          >
            {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          {rockBlocker ? (
            <BlockerDetails
              blocker={rockBlocker}
              todayIso={todayLocalIso()}
              nameOf={nameOf}
              dependency={dependencyFor(rockBlocker)}
              canManage={canManage}
              onEdit={() => setBlockerTarget({ subject: 'rock', id: rock.id, label: rock.title, mode: 'record' })}
              onResolve={() => setBlockerTarget({ subject: 'rock', id: rock.id, label: rock.title, mode: 'resolve' })}
            />
          ) : dbToUiStatus(rock.status) === 'blocked' && !blockersQuery.isLoading ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950/30">
              <span className="flex items-center gap-2 text-violet-900 dark:text-violet-200">
                <Ban className="h-4 w-4" aria-hidden />
                This Rock is blocked, but no reason was recorded.
              </span>
              {canManage && (
                <Button type="button" size="sm" onClick={() => setBlockerTarget({ subject: 'rock', id: rock.id, label: rock.title, mode: 'record' })}>
                  Record the reason
                </Button>
              )}
            </div>
          ) : null}
          {blockersQuery.isError && <p className="text-xs text-muted-foreground">Blocker details could not be loaded.</p>}
          {rockResolved.length > 0 && (
            <Collapsible className="space-y-2">
              <CollapsibleTrigger className="flex items-center gap-1 rounded text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                Past blockers ({rockResolved.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ResolvedBlockerList blockers={rockResolved} nameOf={nameOf} />
              </CollapsibleContent>
            </Collapsible>
          )}

          <CarryoverLinks
            data={carryoverQuery.data}
            isLoading={carryoverQuery.isLoading}
            isError={carryoverQuery.isError}
            nameOf={nameOf}
            onOpenRock={onOpenRock}
          />

          <section className="space-y-4" aria-labelledby="rock-milestones-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="rock-milestones-heading" className="flex items-center gap-2 text-base font-semibold">
                <Flag className="h-4 w-4 text-muted-foreground" aria-hidden />
                Milestones
                {metrics.total > 0 && <span className="text-sm font-normal text-muted-foreground tabular-nums">{metrics.total}</span>}
              </h3>
              {metrics.total > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {metrics.complete} of {metrics.active} {isCompany ? 'signed off' : 'complete'}
                </span>
              )}
            </div>

            {milestonesQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : milestonesQuery.isError ? (
              <p className="text-sm text-destructive">Milestones could not be loaded. Close and reopen to retry.</p>
            ) : milestones.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No milestones have been added to this Rock yet.
              </p>
            ) : (
              <>
                {hasStatusMismatch && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Rock status doesn't match milestone progress ({metrics.percentComplete}% complete).</span>
                  </div>
                )}
                {deliveryQuery.isError && (
                  <p className="text-xs text-muted-foreground">Milestone relationships could not be loaded.</p>
                )}
                {tasksQuery.isError && (
                  <p className="text-xs text-muted-foreground">Linked tasks could not be loaded.</p>
                )}
                <MilestoneHero
                  isCompany={isCompany}
                  quarter={{ year: rock.quarter_year, quarter: rock.quarter_number }}
                  todayIso={todayIso}
                  milestones={milestones}
                  metrics={metrics}
                  delivery={companyDelivery}
                  deliveryPending={isCompany && deliveryQuery.isLoading}
                  getUserInfo={getUserInfo}
                />
                <MilestoneTable
                  milestones={milestones}
                  attentionIds={attentionIds}
                  tasksByMilestone={tasksByMilestone}
                  todosByMilestone={todosByMilestone}
                  todoSupport={hasRows ? { rock: { id: rock.id, title: rock.title }, canManage } : undefined}
                  deliveryData={deliveryData}
                  rockLevel={rock.rock_level}
                  hasRows={hasRows}
                  rockOwnerId={rock.owner_id}
                  todayIso={todayIso}
                  getUserInfo={getUserInfo}
                  onOpenRock={onOpenRock}
                  linkSupport={
                    hasRows && (rock.rock_level === 'individual' || rock.rock_level === 'team')
                      ? {
                          canManage,
                          root: linkRoot,
                          onLink: (id, title) => setLinkTarget({ id, title }),
                          onEditRock: onEdit ? () => onEdit(rock) : undefined,
                        }
                      : undefined
                  }
                  blockerSupport={
                    hasRows
                      ? {
                          blockers,
                          canManage,
                          nameOf,
                          dependencyFor,
                          onRecord: (id, label) => setBlockerTarget({ subject: 'milestone', id, label, mode: 'record' }),
                          onResolve: (id, label) => setBlockerTarget({ subject: 'milestone', id, label, mode: 'resolve' }),
                        }
                      : undefined
                  }
                />
              </>
            )}
          </section>

          {(canManage || rockLevelTodos.length > 0) && (
            <>
              <Separator />
              <RockTodoList rock={{ id: rock.id, title: rock.title }} todos={rockLevelTodos} canManage={canManage} />
            </>
          )}

          {canManage && (
            <>
              <Separator />
              <RockNotesPanel key={rock.id} rock={{ id: rock.id, title: rock.title, tenant_id: rock.tenant_id }} />
            </>
          )}

          {isCompany && (
            <>
              <Separator />
              <IndividualRocksSection
                companyRockId={rock.id}
                getUserInfo={getUserInfo}
                onOpenRock={onOpenRock}
                canLink={canManage}
                defaultOpen
              />
            </>
          )}

          {hasNarrative && (
            <>
              <Separator />
              <Collapsible open={contextOpen} onOpenChange={setContextOpen} className="space-y-3">
                <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 space-y-1">
                    <span className="block text-base font-semibold">Context</span>
                    {!contextOpen && preview && (
                      <span className="line-clamp-2 text-sm text-muted-foreground">{preview}</span>
                    )}
                  </span>
                  <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    {contextOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    {contextOpen ? 'Hide' : 'Show description, issue and outcome'}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-5">
                  <NarrativeBlock label="Description" text={rock.description} />
                  <NarrativeBlock label="Issue this Rock addresses" text={rock.issue} />
                  <NarrativeBlock label="The problem this solves" text={rock.outcome} />
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {hasAlignment && (
            <>
              <Separator />
              <section className="space-y-3" aria-labelledby="rock-alignment-heading">
                <h3 id="rock-alignment-heading" className="flex items-center gap-2 text-base font-semibold">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  Alignment
                </h3>
                {parentRock && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cascades from</p>
                    <ul>
                      <RelatedRockRow
                        rock={parentRock}
                        ownerInfo={parentRock.owner_id && getUserInfo ? getUserInfo(parentRock.owner_id) : null}
                      />
                    </ul>
                  </div>
                )}
                {childRocks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cascades to ({childRocks.length})
                    </p>
                    <ul className="space-y-2">
                      {childRocks.map(child => (
                        <RelatedRockRow
                          key={child.id}
                          rock={child}
                          ownerInfo={child.owner_id && getUserInfo ? getUserInfo(child.owner_id) : null}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </>
          )}

          <RockHistory rockId={rock.id} nameOf={id => (id && getUserInfo?.(id)?.name) || 'Someone'} />

          {(createdLabel || updatedLabel) && (
            <p className="pt-2 text-xs text-muted-foreground">
              {createdLabel && <>Created {createdLabel}</>}
              {createdLabel && updatedLabel && ' · '}
              {updatedLabel && <>Last activity {updatedLabel}</>}
            </p>
          )}
        </div>

        {(onEdit || (onViewCascade && rock.rock_level !== 'individual')) && (
          <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2 space-x-0 border-t px-4 py-3 sm:space-x-0 sm:px-6">
            {onViewCascade && rock.rock_level !== 'individual' ? (
              <Button
                variant="ghost"
                onClick={() => {
                  onOpenChange(false);
                  onViewCascade(rock);
                }}
              >
                View cascade
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : <span />}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canManage && !isArchived && !rockIsComplete && !rockBlocker && dbToUiStatus(rock.status) !== 'blocked' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBlockerTarget({ subject: 'rock', id: rock.id, label: rock.title, mode: 'record' })}
                >
                  <Ban className="mr-2 h-4 w-4" aria-hidden />
                  Mark as blocked
                </Button>
              )}
              {canManage && !isArchived && !rockIsComplete && (
                <Button type="button" variant="outline" size="sm" onClick={() => setCarryOpen(true)}>
                  <CornerUpRight className="mr-2 h-4 w-4" aria-hidden />
                  Carry forward
                </Button>
              )}
              {onEdit && (
                <Button onClick={() => onEdit(rock)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Rock
                </Button>
              )}
            </div>
          </SheetFooter>
        )}
      </SheetContent>

      {blockerTarget && blockerTarget.mode === 'record' && (
        <BlockerDialog
          open
          onOpenChange={next => !next && setBlockerTarget(null)}
          subject={blockerTarget.subject}
          subjectId={blockerTarget.id}
          subjectLabel={blockerTarget.label}
          existing={openBlocker(blockers, blockerTarget.subject, blockerTarget.id)}
          people={personOptions}
          rockOptions={rockPickOptions}
          milestoneOptions={milestonePickOptions(blockerTarget.subject === 'milestone' ? blockerTarget.id : undefined)}
        />
      )}
      {blockerTarget && blockerTarget.mode === 'resolve' && (
        <ResolveBlockerDialog
          open
          onOpenChange={next => !next && setBlockerTarget(null)}
          subject={blockerTarget.subject}
          subjectId={blockerTarget.id}
          subjectLabel={blockerTarget.label}
          blocker={openBlocker(blockers, blockerTarget.subject, blockerTarget.id)}
        />
      )}
      {linkTarget && linkRoot?.status === 'ok' && (
        <LinkMilestoneDialog
          open
          onOpenChange={next => !next && setLinkTarget(null)}
          targetRocks={linkRoot.rocks}
          milestone={linkTarget}
          rockTitle={rock.title}
        />
      )}
      <CarryForwardDialog
        open={carryOpen}
        onOpenChange={setCarryOpen}
        rock={{
          id: rock.id,
          title: rock.title,
          level: rock.rock_level ?? null,
          quarterYear: rock.quarter_year,
          quarterNumber: rock.quarter_number,
          parentRockId: rock.parent_rock_id ?? null,
        }}
        milestones={hasRows ? milestones.map(m => ({ id: m.id, title: m.title, status: m.status, dueDate: m.dueDate })) : []}
        carriedMilestoneIds={new Set(carryoverQuery.data?.carriedSourceMilestoneIds ?? [])}
        carriedToRockIds={new Set(carryoverQuery.data?.carriedToRockIds ?? [])}
        onOpenRock={onOpenRock}
      />
    </Sheet>
  );
}
