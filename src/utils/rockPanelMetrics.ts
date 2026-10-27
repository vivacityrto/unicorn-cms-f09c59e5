import type { RockMilestoneStatus } from '@/types/eos';
import type { MilestoneTaskLink } from '@/utils/rockMilestoneTasks';

/**
 * View-model logic for the Rock details panel's milestone section: short
 * references, headline metrics, quarter timeline geometry, filtering and sorting.
 * Pure, so every number on screen can be tested.
 */

export interface PanelMilestone {
  id: string;
  title: string;
  /** Title without a leading "Milestone 3 -" prefix. */
  label: string;
  /** The "3" from "Milestone 3 - …", else null. */
  number: number | null;
  status: RockMilestoneStatus;
  priority: string | null;
  ownerId: string | null;
  dueDate: string | null;
  exitCriteria: string | null;
  evidenceUrl: string | null;
  order: number;
}

const TITLE_PREFIX = /^\s*(?:milestone|m)\s*(\d{1,3})\s*[-–—:.]\s*(.+)$/i;

export function parseMilestoneTitle(title: string): { number: number | null; label: string } {
  const match = TITLE_PREFIX.exec(title);
  if (!match) return { number: null, label: title.trim() };
  return { number: Number(match[1]), label: match[2].trim() };
}

/** A short reference such as "M3", or a trimmed title when the milestone is not numbered. */
export function milestoneRef(milestone: { number: number | null; label: string }, max = 28): string {
  if (milestone.number !== null) return `M${milestone.number}`;
  return milestone.label.length > max ? `${milestone.label.slice(0, max - 1)}…` : milestone.label;
}

const dateOnly = (value: string) => value.slice(0, 10);

/** Days from `today` (YYYY-MM-DD) to `due` (YYYY-MM-DD); negative when past. */
export function daysBetween(todayIso: string, dueIso: string): number {
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [dy, dm, dd] = dueIso.split('-').map(Number);
  return Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

export function isOpen(status: RockMilestoneStatus): boolean {
  return status !== 'complete' && status !== 'deferred';
}

export function isOverdueMilestone(milestone: PanelMilestone, todayIso: string): boolean {
  return isOpen(milestone.status) && !!milestone.dueDate && daysBetween(todayIso, dateOnly(milestone.dueDate)) < 0;
}

export interface MilestoneMetrics {
  /** Every milestone, deferred included. */
  total: number;
  /** Milestones still in play: everything except deferred. */
  active: number;
  complete: number;
  inProgress: number;
  blocked: number;
  offTrack: number;
  notStarted: number;
  deferred: number;
  overdue: number;
  /** Complete share of active milestones, 0 to 100; null when none are active. */
  percentComplete: number | null;
  /** The earliest due date among open milestones, which may already be overdue. */
  nextDue: { id: string; label: string; ref: string; dueDate: string; days: number } | null;
  tasks: { total: number; closed: number; blocked: number };
  /** Blocked, off track, overdue, or holding an open blocked task: what to discuss. */
  attentionIds: ReadonlySet<string>;
}

export function milestoneMetrics(
  milestones: readonly PanelMilestone[],
  tasks: readonly MilestoneTaskLink[],
  todayIso: string,
): MilestoneMetrics {
  const blockedTaskMilestones = new Set(
    tasks.filter(t => t.task_state !== 'closed' && t.task_status === 'blocked').map(t => t.milestone_id),
  );
  const attention = new Set<string>();
  let nextDue: MilestoneMetrics['nextDue'] = null;
  const counts = { complete: 0, inProgress: 0, blocked: 0, offTrack: 0, notStarted: 0, deferred: 0, overdue: 0 };

  for (const m of milestones) {
    if (m.status === 'deferred') counts.deferred += 1;
    else if (m.status === 'complete') counts.complete += 1;
    else if (m.status === 'in_progress') counts.inProgress += 1;
    else if (m.status === 'blocked') counts.blocked += 1;
    else if (m.status === 'off_track') counts.offTrack += 1;
    else counts.notStarted += 1;

    const overdue = isOverdueMilestone(m, todayIso);
    if (overdue) counts.overdue += 1;
    if (m.status === 'blocked' || m.status === 'off_track' || overdue || blockedTaskMilestones.has(m.id)) {
      if (isOpen(m.status)) attention.add(m.id);
    }

    if (isOpen(m.status) && m.dueDate) {
      const due = dateOnly(m.dueDate);
      if (!nextDue || due < nextDue.dueDate) {
        nextDue = { id: m.id, label: m.label, ref: milestoneRef(m), dueDate: due, days: daysBetween(todayIso, due) };
      }
    }
  }

  const active = milestones.length - counts.deferred;
  const closed = tasks.filter(isClosedTask).length;
  return {
    total: milestones.length,
    active,
    ...counts,
    percentComplete: active > 0 ? Math.round((counts.complete / active) * 100) : null,
    nextDue,
    tasks: {
      total: tasks.length,
      closed,
      blocked: tasks.filter(t => !isClosedTask(t) && t.task_status === 'blocked').length,
    },
    attentionIds: attention,
  };
}

function isClosedTask(task: MilestoneTaskLink) {
  return task.task_state === 'closed';
}

/* ---------- quarter timeline ---------- */

export interface TimelinePoint {
  id: string;
  ref: string;
  label: string;
  dueDate: string;
  /** Position along the quarter, 0 to 100. */
  pct: number;
  status: RockMilestoneStatus;
  overdue: boolean;
  /** Vertical lane, so markers that fall close together do not overlap. */
  lane: number;
  /** Due outside the quarter: pinned to the nearest edge. */
  clamped: boolean;
}

export interface TimelineModel {
  startIso: string;
  endIso: string;
  months: Array<{ label: string; pct: number }>;
  /** Today's position, or null when today falls outside the quarter. */
  todayPct: number | null;
  points: TimelinePoint[];
  /** Milestones with no due date, which cannot be placed. */
  undated: number;
  lanes: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function quarterBounds(year: number, quarter: number): { startIso: string; endIso: string } {
  const q = Math.min(4, Math.max(1, Math.round(quarter)));
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { startIso: `${year}-${pad(startMonth)}-01`, endIso: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_GAP_PCT = 3.2;
const MAX_LANES = 4;

export function timelineModel(
  milestones: readonly PanelMilestone[],
  quarter: { year: number; quarter: number },
  todayIso: string,
): TimelineModel {
  const { startIso, endIso } = quarterBounds(quarter.year, quarter.quarter);
  const span = Math.max(1, daysBetween(startIso, endIso));
  const position = (iso: string) => (daysBetween(startIso, iso) / span) * 100;

  const months = [0, 1, 2].map(i => {
    const month = (quarter.quarter - 1) * 3 + i;
    return { label: MONTH_LABELS[month], pct: position(`${quarter.year}-${pad(month + 1)}-01`) };
  });

  const todayPosition = position(todayIso);
  const todayPct = todayPosition >= 0 && todayPosition <= 100 ? todayPosition : null;

  const dated = milestones
    .filter((m): m is PanelMilestone & { dueDate: string } => !!m.dueDate)
    .map(m => {
      const raw = position(dateOnly(m.dueDate));
      return { m, raw, pct: Math.min(100, Math.max(0, raw)) };
    })
    .sort((a, b) => a.pct - b.pct || a.m.order - b.m.order);

  const laneEnds: number[] = [];
  const points: TimelinePoint[] = dated.map(({ m, raw, pct }) => {
    let lane = laneEnds.findIndex(end => pct - end >= MIN_GAP_PCT);
    if (lane === -1) lane = laneEnds.length < MAX_LANES ? laneEnds.length : laneEnds.length - 1;
    laneEnds[lane] = pct;
    return {
      id: m.id,
      ref: milestoneRef(m),
      label: m.label,
      dueDate: dateOnly(m.dueDate!),
      pct,
      status: m.status,
      overdue: isOverdueMilestone(m, todayIso),
      lane,
      clamped: raw < 0 || raw > 100,
    };
  });

  return {
    startIso,
    endIso,
    months,
    todayPct,
    points,
    undated: milestones.length - dated.length,
    lanes: Math.max(1, laneEnds.length),
  };
}

/* ---------- filtering and sorting ---------- */

export type MilestoneFilter = 'all' | 'attention' | 'in_progress' | 'not_started' | 'done';
export type MilestoneSort = 'plan' | 'due';

export interface FilterContext {
  attentionIds: ReadonlySet<string>;
  ownerNames?: ReadonlyMap<string, string>;
}

export function filterMilestones(
  milestones: readonly PanelMilestone[],
  filter: MilestoneFilter,
  query: string,
  context: FilterContext,
): PanelMilestone[] {
  const needle = query.trim().toLowerCase();
  return milestones.filter(m => {
    if (filter === 'attention' && !context.attentionIds.has(m.id)) return false;
    if (filter === 'in_progress' && m.status !== 'in_progress') return false;
    if (filter === 'not_started' && m.status !== 'not_started') return false;
    if (filter === 'done' && m.status !== 'complete') return false;
    if (!needle) return true;
    const owner = m.ownerId ? context.ownerNames?.get(m.ownerId) ?? '' : '';
    return [m.title, m.exitCriteria ?? '', owner].some(text => text.toLowerCase().includes(needle));
  });
}

export function filterCounts(
  milestones: readonly PanelMilestone[],
  context: FilterContext,
): Record<MilestoneFilter, number> {
  return {
    all: milestones.length,
    attention: milestones.filter(m => context.attentionIds.has(m.id)).length,
    in_progress: milestones.filter(m => m.status === 'in_progress').length,
    not_started: milestones.filter(m => m.status === 'not_started').length,
    done: milestones.filter(m => m.status === 'complete').length,
  };
}

/** Plan order as written, or by due date (undated last, ties kept in plan order). */
export function sortMilestones(milestones: readonly PanelMilestone[], sort: MilestoneSort): PanelMilestone[] {
  const byPlan = (a: PanelMilestone, b: PanelMilestone) => a.order - b.order;
  if (sort === 'plan') return [...milestones].sort(byPlan);
  return [...milestones].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return byPlan(a, b);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return dateOnly(a.dueDate).localeCompare(dateOnly(b.dueDate)) || byPlan(a, b);
  });
}
