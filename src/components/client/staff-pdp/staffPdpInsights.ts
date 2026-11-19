import { addMonths, differenceInCalendarDays, format, isSameMonth, parseISO, startOfMonth } from 'date-fns';
import type { WorkforcePdpRow } from '@/features/pdp/workforce';
import type { CurrencyStatus } from '@/features/pdp/types';

export const ALL_STATUSES: CurrencyStatus[] = ['overdue', 'at_risk', 'on_track', 'current'];
export const STATUS_RANK: Record<CurrencyStatus, number> = { overdue: 0, at_risk: 1, on_track: 2, current: 3 };
export const STATUS_LABEL: Record<CurrencyStatus, string> = { overdue: 'Overdue', at_risk: 'At risk', on_track: 'On track', current: 'Current' };

/** Staff more than this many percentage points behind where the clock says they should be count as behind pace. */
export const BEHIND_PACE_POINTS = 15;
/** The row has no cycle start date, so time elapsed assumes the usual 12-month cycle. */
const CYCLE_DAYS = 365;

/** A status filter from the URL, keeping only values we know (an unknown one used to hide every row). */
export function parseStatusParam(raw: string | null | undefined): CurrencyStatus[] {
  return (raw ?? '').split(',').filter((s): s is CurrencyStatus => (ALL_STATUSES as string[]).includes(s));
}

export const hasTarget = (r: Pick<WorkforcePdpRow, 'target_pd_hours'>) => Number(r.target_pd_hours) > 0;

/** Progress for display: a whole number held between 0 and 100 (the source can exceed 100 or be missing). */
export function pctClamped(r: Pick<WorkforcePdpRow, 'percent_complete'>): number {
  const n = Number(r.percent_complete);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

/** Hours still to do. Zero when there is no target, so a missing target never looks like a shortfall. */
export const hoursGap = (r: Pick<WorkforcePdpRow, 'target_pd_hours' | 'actual_pd_hours'>) =>
  hasTarget(r) ? Math.max(0, Number(r.target_pd_hours) - Number(r.actual_pd_hours || 0)) : 0;

/** Days until the cycle ends (negative once it has), or null when there is no end date. */
export function daysLeft(r: Pick<WorkforcePdpRow, 'days_until_cycle_end' | 'cycle_end_date'>, today: Date = new Date()): number | null {
  if (r.days_until_cycle_end != null && Number.isFinite(Number(r.days_until_cycle_end))) return Number(r.days_until_cycle_end);
  if (!r.cycle_end_date) return null;
  const end = parseISO(r.cycle_end_date);
  return Number.isNaN(end.getTime()) ? null : differenceInCalendarDays(end, today);
}

/** How far through the cycle the calendar is, 0 to 100, or null without an end date. Approximate (12-month cycle). */
export function elapsedPercent(r: Pick<WorkforcePdpRow, 'days_until_cycle_end' | 'cycle_end_date'>, today: Date = new Date()): number | null {
  const d = daysLeft(r, today);
  return d === null ? null : Math.min(100, Math.max(0, Math.round((1 - d / CYCLE_DAYS) * 100)));
}

/** Percentage points ahead (positive) or behind (negative) of the calendar. Null when it would mislead. */
export function paceGap(r: WorkforcePdpRow, today: Date = new Date()): number | null {
  if (!hasTarget(r)) return null;
  const elapsed = elapsedPercent(r, today);
  // Too early in a cycle for pace to mean anything.
  if (elapsed === null || elapsed < 8) return null;
  return pctClamped(r) - elapsed;
}

export const isBehindPace = (r: WorkforcePdpRow, today: Date = new Date()) => {
  const gap = paceGap(r, today);
  return gap !== null && gap < -BEHIND_PACE_POINTS && r.currency_status !== 'current';
};

/** Hours a week still needed to finish on time; null when the cycle is nearly over or done. */
export function hoursPerWeek(r: WorkforcePdpRow, today: Date = new Date()): number | null {
  const gap = hoursGap(r);
  const d = daysLeft(r, today);
  if (gap <= 0 || d === null || d < 7) return null;
  return Math.round((gap / (d / 7)) * 10) / 10;
}

export function compareRows(a: WorkforcePdpRow, b: WorkforcePdpRow): number {
  const r = STATUS_RANK[a.currency_status] - STATUS_RANK[b.currency_status];
  if (r !== 0) return r;
  return (a.cycle_end_date ?? '9999-12-31').localeCompare(b.cycle_end_date ?? '9999-12-31');
}

export interface ChaseItem {
  row: WorkforcePdpRow;
  reason: string;
}

const h = (n: number) => `${Math.round(n * 10) / 10} h`;

export interface StaffPdpSummary {
  total: number;
  counts: Record<CurrencyStatus, number>;
  needsAttention: number;
  /** Staff whose cycle has a target. */
  withTarget: number;
  teamGapHours: number;
  /** Total actual over total target, or null for fewer than three staff (one person swings it). */
  teamProgress: number | null;
  noTarget: number;
  behindPace: number;
  oldestOverdueDays: number | null;
  nextCycleEnd: { name: string; inDays: number } | null;
  chase: ChaseItem[];
  byAudience: Array<{ name: string; staff: number; target: number; actual: number; gap: number }>;
  cycleEnds: { ended: number; months: Array<{ label: string; count: number; risky: number }> };
}

export function summariseStaffPdps(rows: readonly WorkforcePdpRow[], today: Date = new Date()): StaffPdpSummary {
  const counts: Record<CurrencyStatus, number> = { overdue: 0, at_risk: 0, on_track: 0, current: 0 };
  for (const r of rows) counts[r.currency_status] += 1;

  const targeted = rows.filter(hasTarget);
  const totalTarget = targeted.reduce((n, r) => n + Number(r.target_pd_hours), 0);
  const totalActual = targeted.reduce((n, r) => n + Number(r.actual_pd_hours || 0), 0);

  const overdueDays = rows.filter((r) => r.currency_status === 'overdue').map((r) => daysLeft(r, today)).filter((d): d is number => d !== null && d < 0).map((d) => -d);
  const upcoming = rows
    .filter((r) => r.currency_status !== 'current' && r.currency_status !== 'overdue')
    .map((r) => ({ name: r.staff_name, inDays: daysLeft(r, today) }))
    .filter((x): x is { name: string; inDays: number } => x.inDays !== null && x.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays);

  const chase: ChaseItem[] = rows
    .filter((r) => r.currency_status === 'overdue' || r.currency_status === 'at_risk' || isBehindPace(r, today))
    .sort((a, b) => compareRows(a, b) || hoursGap(b) - hoursGap(a))
    .map((row) => {
      const d = daysLeft(row, today);
      const short = hoursGap(row) > 0 ? `, ${h(hoursGap(row))} short` : '';
      let reason: string;
      if (row.currency_status === 'overdue') reason = d !== null && d < 0 ? `Cycle ended ${-d} ${-d === 1 ? 'day' : 'days'} ago${short}` : `Cycle has ended${short}`;
      else if (row.currency_status === 'at_risk') reason = d !== null ? `${d} ${d === 1 ? 'day' : 'days'} left${short}` : `Running out of time${short}`;
      else reason = `Behind pace by ${Math.abs(paceGap(row, today) ?? 0)} points${short}`;
      return { row, reason };
    });

  const audiences = new Map<string, { staff: number; target: number; actual: number; gap: number }>();
  for (const r of targeted) {
    const key = r.audience_code ?? 'No audience';
    const a = audiences.get(key) ?? { staff: 0, target: 0, actual: 0, gap: 0 };
    a.staff += 1;
    a.target += Number(r.target_pd_hours);
    a.actual += Number(r.actual_pd_hours || 0);
    a.gap += hoursGap(r);
    audiences.set(key, a);
  }

  const start = startOfMonth(today);
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(start, i);
    return { month: m, label: format(m, 'MMM'), count: 0, risky: 0 };
  });
  let ended = 0;
  for (const r of rows) {
    if (!r.cycle_end_date) continue;
    const end = parseISO(r.cycle_end_date);
    if (Number.isNaN(end.getTime())) continue;
    if (end < start) {
      if (r.currency_status !== 'current') ended += 1;
      continue;
    }
    const bucket = months.find((m) => isSameMonth(m.month, end));
    if (!bucket) continue;
    bucket.count += 1;
    if (r.currency_status === 'overdue' || r.currency_status === 'at_risk') bucket.risky += 1;
  }

  return {
    total: rows.length,
    counts,
    needsAttention: counts.overdue + counts.at_risk,
    withTarget: targeted.length,
    teamGapHours: targeted.reduce((n, r) => n + hoursGap(r), 0),
    teamProgress: targeted.length >= 3 && totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null,
    noTarget: rows.length - targeted.length,
    // Only those the status still calls on track: the ones it would otherwise miss.
    behindPace: rows.filter((r) => r.currency_status === 'on_track' && isBehindPace(r, today)).length,
    oldestOverdueDays: overdueDays.length ? Math.max(...overdueDays) : null,
    nextCycleEnd: upcoming[0] ?? null,
    chase,
    byAudience: [...audiences.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name)),
    cycleEnds: { ended, months: months.map(({ label, count, risky }) => ({ label, count, risky })) },
  };
}
