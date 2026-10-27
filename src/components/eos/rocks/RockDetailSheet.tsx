import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import {
  AlertTriangle,
  Armchair,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  Flag,
  GitBranch,
  ListChecks,
  Pencil,
  Target,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CompanyMilestoneDeliveryBlock,
  DeliverySummaryStrip,
  SupportedMilestonesBlock,
} from '@/components/eos/rocks/MilestoneDelivery';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useMilestoneDelivery } from '@/hooks/useMilestoneDelivery';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { companyMilestoneDelivery, rockDeliverySummary, supportedCompanyMilestones } from '@/utils/milestoneDelivery';
import {
  sortMilestoneTasks,
  summarizeMilestoneTasks,
  TASK_STATUS_LABEL,
  type MilestoneTaskLink,
} from '@/utils/rockMilestoneTasks';
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

interface DetailMilestone {
  id: string;
  title: string;
  status: RockMilestoneStatus;
  priority?: string | null;
  ownerId?: string | null;
  dueDate?: string | null;
  exitCriteria?: string | null;
  evidenceUrl?: string | null;
}

const LEVEL_STYLES: Record<RockLevel, { label: string; className: string }> = {
  company: { label: 'Company', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  team: { label: 'Team', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  individual: { label: 'Individual', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function milestoneStatusOf(value: string | null | undefined, completed?: boolean): RockMilestoneStatus {
  if (value && value in MILESTONE_STATUS) return value as RockMilestoneStatus;
  return completed ? 'complete' : 'not_started';
}

/** Legacy milestones live as JSON on the Rock until they are migrated to eos_rock_milestones. */
function legacyMilestones(rock: RockWithHierarchy): DetailMilestone[] {
  if (!Array.isArray(rock.milestones)) return [];
  return (rock.milestones as unknown as Array<Record<string, unknown>>).map((m, index) => ({
    id: typeof m.id === 'string' ? m.id : `legacy-${index}`,
    title: typeof m.text === 'string' ? m.text : '',
    status: milestoneStatusOf(typeof m.status === 'string' ? m.status : null, m.completed === true),
    priority: typeof m.priority === 'string' ? m.priority : null,
    ownerId: typeof m.owner_id === 'string' ? m.owner_id : null,
    dueDate: typeof m.due_date === 'string' && m.due_date ? m.due_date : null,
    exitCriteria: typeof m.exit_criteria === 'string' && m.exit_criteria ? m.exit_criteria : null,
    evidenceUrl: typeof m.evidence_url === 'string' && m.evidence_url ? m.evidence_url : null,
  })).filter(m => m.title.trim());
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatDate(value: string | null | undefined, pattern = 'd MMM yyyy'): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

function PersonChip({ info, fallbackName }: { info?: UserInfo | null; fallbackName?: string }) {
  const name = info?.name || fallbackName;
  if (!name) return <span className="text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar className="h-6 w-6 shrink-0">
        {info?.avatarUrl && <AvatarImage src={info.avatarUrl} alt={name} />}
        <AvatarFallback className="text-[10px]">{info?.initials || <Users className="h-3 w-3" />}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof Calendar; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground min-w-0">{children}</dd>
    </div>
  );
}

function NarrativeBlock({ label, text }: { label: string; text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">{text}</p>
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
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', level.className)}>{level.label}</Badge>
          {ownerInfo && <span className="truncate">{ownerInfo.name}</span>}
        </div>
      </div>
      <Badge variant="outline" className={cn('shrink-0 text-xs', status.color, status.bgColor, status.borderColor)}>
        {status.label}
      </Badge>
    </li>
  );
}

function MilestoneTasks({ tasks, milestoneStatus }: { tasks: MilestoneTaskLink[]; milestoneStatus: RockMilestoneStatus }) {
  if (tasks.length === 0) return null;
  const summary = summarizeMilestoneTasks(tasks, milestoneStatus);
  return (
    <div className="ml-6 space-y-1.5 rounded-md border bg-muted/30 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Tasks · {summary.closed} of {summary.total} closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          {summary.blocked > 0 && (
            <Badge variant="outline" className="border-transparent bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {summary.blocked} blocked
            </Badge>
          )}
          {summary.readyForReview && (
            <Badge variant="outline" className="border-transparent bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Ready for review
            </Badge>
          )}
        </span>
      </div>
      <ul className="space-y-1">
        {sortMilestoneTasks(tasks).map(task => {
          const href = safeExternalUrl(task.external_url);
          const closed = task.task_state === 'closed';
          const due = formatDate(task.due_date, 'd MMM');
          return (
            <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
              <span className="min-w-0 flex-1 basis-48 break-words">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn('rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', closed && 'text-muted-foreground line-through')}
                  >
                    {task.title}
                  </a>
                ) : (
                  <span className={cn(closed && 'text-muted-foreground line-through')}>{task.title}</span>
                )}
              </span>
              <span className="inline-flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <span className={cn(task.task_status === 'blocked' && !closed && 'font-medium text-destructive')}>
                  {TASK_STATUS_LABEL[task.task_status] ?? task.task_status}
                </span>
                {task.assignees.length > 0 && <span>{task.assignees.join(', ')}</span>}
                {due && !closed && <span>Due {due}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {summary.readyForReview && (
        <p className="text-xs text-muted-foreground">
          Every linked task is closed. Review the evidence, then mark this milestone complete in Unicorn.
        </p>
      )}
    </div>
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
  const deliveryQuery = useMilestoneDelivery({
    rockId,
    milestoneIds: normalizedIds,
    enabled: !!profile && open,
  });
  const deliveryData = deliveryQuery.data;

  // GitHub tasks linked by the rock-task-sync webhook. Tolerates the table not
  // existing yet so the panel still opens if the frontend deploys first.
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

  if (!rock) return null;

  const tasksByMilestone = new Map<string, MilestoneTaskLink[]>();
  for (const task of tasksQuery.data || []) {
    const list = tasksByMilestone.get(task.milestone_id) || [];
    list.push(task);
    tasksByMilestone.set(task.milestone_id, list);
  }

  const milestones: DetailMilestone[] = normalized && normalized.length > 0
    ? normalized.map(m => ({
        id: m.id,
        title: m.title,
        status: milestoneStatusOf(m.status),
        priority: m.priority,
        ownerId: m.owner_id,
        dueDate: m.due_date,
        exitCriteria: m.exit_criteria,
        evidenceUrl: m.evidence_url,
      }))
    : legacyMilestones(rock);

  const completedMilestones = milestones.filter(m => m.status === 'complete').length;
  const milestoneProgress = milestones.length > 0
    ? Math.round((completedMilestones / milestones.length) * 100)
    : 0;

  const uiStatus = dbToUiStatus(rock.rollupStatus || rock.status);
  const statusConfig = getStatusConfig(uiStatus);
  const level = LEVEL_STYLES[rock.rock_level || 'company'];
  const ownerInfo = rock.owner_id && getUserInfo ? getUserInfo(rock.owner_id) : null;

  const hasStatusMismatch = milestones.length > 0 && (
    (uiStatus === 'complete' && milestoneProgress < 100) ||
    (milestoneProgress === 100 && uiStatus !== 'complete')
  );

  const dueLabel = formatDate(rock.due_date);
  const daysToDue = rock.due_date ? differenceInCalendarDays(new Date(rock.due_date), new Date()) : null;
  const isOverdue = daysToDue !== null && daysToDue < 0 && uiStatus !== 'complete';
  const dueHint = uiStatus === 'complete' || daysToDue === null
    ? null
    : daysToDue < 0
      ? `${Math.abs(daysToDue)} ${Math.abs(daysToDue) === 1 ? 'day' : 'days'} overdue`
      : daysToDue === 0
        ? 'Due today'
        : `${daysToDue} ${daysToDue === 1 ? 'day' : 'days'} left`;

  const seatName = rock.seat?.seat_name;
  const functionName = rock.function?.name;
  const hasNarrative = !!(rock.description?.trim() || rock.issue?.trim() || rock.outcome?.trim());
  const hasAlignment = !!parentRock || childRocks.length > 0;
  const createdLabel = formatDate(rock.created_at);
  const updatedLabel = formatDate(rock.updated_at);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b px-4 py-5 pr-12 text-left sm:px-6">
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
          <SheetTitle className="text-xl font-semibold leading-snug break-words">{rock.title}</SheetTitle>
          <SheetDescription className="sr-only">
            Read-only details for this Rock, including milestones and alignment.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Fact icon={Users} label="Owner">
              <PersonChip info={ownerInfo} />
            </Fact>
            <Fact icon={Calendar} label="Due">
              <span>{dueLabel || 'No due date'}</span>
              {dueHint && (
                <span className={cn('block text-xs font-normal', isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                  {dueHint}
                </span>
              )}
            </Fact>
            {functionName && (
              <Fact icon={Target} label="Team">
                <span className="break-words">{functionName}</span>
              </Fact>
            )}
            {seatName && (
              <Fact icon={Armchair} label="Seat">
                <span className="break-words">{seatName}</span>
              </Fact>
            )}
          </dl>

          {rock.childStats && rock.childStats.total > 0 && (
            <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/40 text-center">
              <div className="p-3">
                <div className="text-lg font-semibold">{rock.childStats.total}</div>
                <div className="text-xs text-muted-foreground">Cascaded</div>
              </div>
              <div className="p-3">
                <div className="text-lg font-semibold text-green-600">{rock.childStats.complete}</div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
              <div className="p-3">
                <div className={cn('text-lg font-semibold', rock.childStats.offTrack > 0 && 'text-red-600')}>
                  {rock.childStats.offTrack}
                </div>
                <div className="text-xs text-muted-foreground">Off track</div>
              </div>
            </div>
          )}

          {hasNarrative && (
            <>
              <Separator />
              <div className="space-y-5">
                <NarrativeBlock label="Description" text={rock.description} />
                <NarrativeBlock label="Issue this Rock addresses" text={rock.issue} />
                <NarrativeBlock label="The problem this solves" text={rock.outcome} />
              </div>
            </>
          )}

          <Separator />
          <section className="space-y-3" aria-labelledby="rock-milestones-heading">
            <div className="flex items-center justify-between">
              <h3 id="rock-milestones-heading" className="flex items-center gap-2 text-sm font-semibold">
                <Flag className="h-4 w-4 text-muted-foreground" />
                Milestones
              </h3>
              {milestones.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {completedMilestones} of {milestones.length} {rock.rock_level === 'company' ? 'signed off' : 'complete'}
                </span>
              )}
            </div>

            {milestonesQuery.isLoading ? (
              <div className="space-y-2">
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
                <Progress
                  value={milestoneProgress}
                  className="h-2"
                  aria-label={rock.rock_level === 'company' ? 'Milestones signed off' : 'Milestone progress'}
                />
                {rock.rock_level === 'company' && deliveryData && (
                  <DeliverySummaryStrip summary={rockDeliverySummary(milestones.map(m => m.id), deliveryData)} />
                )}
                {deliveryQuery.isError && (
                  <p className="text-xs text-muted-foreground">Milestone relationships could not be loaded.</p>
                )}
                {tasksQuery.isError && (
                  <p className="text-xs text-muted-foreground">Linked tasks could not be loaded.</p>
                )}
                {hasStatusMismatch && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Rock status doesn't match milestone progress ({milestoneProgress}% complete).</span>
                  </div>
                )}
                <ol className="space-y-2">
                  {milestones.map(milestone => {
                    const style = MILESTONE_STATUS[milestone.status];
                    const done = milestone.status === 'complete';
                    const owner = milestone.ownerId && getUserInfo ? getUserInfo(milestone.ownerId) : null;
                    const due = formatDate(milestone.dueDate, 'd MMM');
                    const evidenceHref = milestone.evidenceUrl ? safeExternalUrl(milestone.evidenceUrl) : null;
                    const hasRows = !!normalized && normalized.length > 0;
                    return (
                      <li key={milestone.id} className="space-y-2 rounded-lg border bg-card p-3">
                        <div className="flex items-start gap-2.5">
                          {done
                            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                            : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className={cn('text-sm font-medium break-words', done && 'text-muted-foreground line-through')}>
                              {milestone.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <Badge variant="outline" className={cn('border-transparent text-[10px] px-1.5 py-0', style.className)}>
                                {style.label}
                              </Badge>
                              {milestone.priority && PRIORITY_LABEL[milestone.priority] && (
                                <span>{PRIORITY_LABEL[milestone.priority]} priority</span>
                              )}
                              {due && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" aria-hidden />
                                  {due}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <Users className="h-3 w-3 shrink-0" aria-hidden />
                                <span className="truncate">{owner?.name || (milestone.ownerId ? 'Assigned' : 'Rock owner')}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                        {milestone.exitCriteria && (
                          <p className="ml-6 text-xs text-muted-foreground break-words">
                            <span className="font-medium text-foreground">Done when: </span>
                            {milestone.exitCriteria}
                          </p>
                        )}
                        {evidenceHref && (
                          <a
                            href={evidenceHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-6 inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            Evidence
                          </a>
                        )}
                        {deliveryData && hasRows && rock.rock_level === 'company' && (
                          <CompanyMilestoneDeliveryBlock
                            delivery={companyMilestoneDelivery(milestone.id, deliveryData)}
                            getUserInfo={getUserInfo}
                          />
                        )}
                        {deliveryData && hasRows && rock.rock_level === 'individual' && (
                          <SupportedMilestonesBlock
                            supported={supportedCompanyMilestones(milestone.id, deliveryData)}
                            onOpenRock={onOpenRock}
                          />
                        )}
                        <MilestoneTasks tasks={tasksByMilestone.get(milestone.id) || []} milestoneStatus={milestone.status} />
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </section>

          {hasAlignment && (
            <>
              <Separator />
              <section className="space-y-3" aria-labelledby="rock-alignment-heading">
                <h3 id="rock-alignment-heading" className="flex items-center gap-2 text-sm font-semibold">
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

          {(createdLabel || updatedLabel) && (
            <p className="pt-2 text-xs text-muted-foreground">
              {createdLabel && <>Created {createdLabel}</>}
              {createdLabel && updatedLabel && ' · '}
              {updatedLabel && <>Updated {updatedLabel}</>}
            </p>
          )}
        </div>

        {(onEdit || (onViewCascade && rock.rock_level !== 'individual')) && (
          <SheetFooter className="gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between sm:space-x-0 sm:px-6">
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
            {onEdit && (
              <Button onClick={() => onEdit(rock)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Rock
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
