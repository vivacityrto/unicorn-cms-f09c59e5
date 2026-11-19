import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';

/** The slice of a package row the Home page reads. */
export type HomePackage = Pick<
  ClientPackageDashboardRow,
  | 'package_instance_id'
  | 'package_name'
  | 'is_complete'
  | 'hours_total'
  | 'hours_used'
  | 'hours_remaining'
  | 'stages_total'
  | 'stages_complete'
  | 'current_stage_shortname'
  | 'open_tasks'
  | 'overdue_tasks'
  | 'last_activity_at'
  | 'end_date'
  | 'status_pill'
>;

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.max(0, Math.round((part / whole) * 100))) : 0);

export const stagePercent = (p: HomePackage) => pct(num(p.stages_complete), num(p.stages_total));
export const hoursPercent = (p: HomePackage) => pct(num(p.hours_used), num(p.hours_total));

/** Active packages only; finished ones belong on the Packages page. */
export const activePackages = (rows: readonly HomePackage[]) => rows.filter((r) => !r.is_complete);

export interface HomeTotals {
  packages: number;
  hoursTotal: number;
  hoursUsed: number;
  hoursRemaining: number;
  hoursPercent: number;
  stagesTotal: number;
  stagesComplete: number;
  stagesPercent: number;
  openTasks: number;
  overdueTasks: number;
  /** The soonest package end date that is still ahead of today, as an ISO date. */
  nextEnd: string | null;
}

export function totalsOf(rows: readonly HomePackage[], today: Date = new Date()): HomeTotals {
  const active = activePackages(rows);
  const sum = (pick: (p: HomePackage) => number) => active.reduce((n, p) => n + num(pick(p)), 0);
  const hoursTotal = sum((p) => p.hours_total);
  const hoursUsed = sum((p) => p.hours_used);
  const stagesTotal = sum((p) => p.stages_total);
  const stagesComplete = sum((p) => p.stages_complete);
  const todayIso = today.toISOString().slice(0, 10);
  const ends = active.map((p) => p.end_date?.slice(0, 10)).filter((d): d is string => !!d && d >= todayIso).sort();
  return {
    packages: active.length,
    hoursTotal,
    hoursUsed,
    hoursRemaining: Math.max(0, hoursTotal - hoursUsed),
    hoursPercent: pct(hoursUsed, hoursTotal),
    stagesTotal,
    stagesComplete,
    stagesPercent: pct(stagesComplete, stagesTotal),
    openTasks: sum((p) => p.open_tasks),
    overdueTasks: sum((p) => p.overdue_tasks),
    nextEnd: ends[0] ?? null,
  };
}

/**
 * Why a package is drifting or stuck, in plain words. Mirrors the rules the status pill is computed from
 * (no activity for 30 / 14 days, 95% / 75% of hours used, overdue tasks) so the reason always agrees with the pill.
 * Returns null when the package is on track, on hold or complete.
 */
export function statusReason(p: HomePackage, today: Date = new Date()): string | null {
  if (p.status_pill !== 'stuck' && p.status_pill !== 'drifting') return null;
  const reasons: string[] = [];
  const hoursShare = num(p.hours_total) > 0 ? num(p.hours_used) / num(p.hours_total) : 0;
  const quiet = p.last_activity_at ? differenceInCalendarDays(today, parseISO(p.last_activity_at)) : null;
  const stuck = p.status_pill === 'stuck';
  if (quiet !== null && quiet >= (stuck ? 30 : 14)) reasons.push(`no activity for ${quiet} days`);
  if (hoursShare >= (stuck ? 0.95 : 0.75)) reasons.push(`${Math.round(hoursShare * 100)}% of hours used`);
  if (num(p.overdue_tasks) > 0) reasons.push(`${p.overdue_tasks} overdue ${p.overdue_tasks === 1 ? 'task' : 'tasks'}`);
  if (reasons.length === 0) return null;
  const text = reasons.join(' and ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A few plain sentences that say where things stand, built only from the numbers above. */
export function summaryLines(rows: readonly HomePackage[], today: Date = new Date()): string[] {
  const active = activePackages(rows);
  if (active.length === 0) return ['You have no active packages right now.'];
  const t = totalsOf(rows, today);
  const lines: string[] = [];
  if (t.stagesTotal > 0) {
    lines.push(`${t.stagesComplete} of ${t.stagesTotal} stages are complete across your ${t.packages === 1 ? 'package' : `${t.packages} packages`}.`);
  }
  if (t.hoursTotal > 0) {
    const left = Math.round(t.hoursRemaining * 10) / 10;
    lines.push(`You have used ${t.hoursPercent}% of your consulting hours, with ${left} ${left === 1 ? 'hour' : 'hours'} left.`);
  }
  if (t.overdueTasks > 0) {
    lines.push(`${t.overdueTasks} ${t.overdueTasks === 1 ? 'task is' : 'tasks are'} overdue and worth clearing first.`);
  } else if (t.openTasks > 0) {
    lines.push(`${t.openTasks} ${t.openTasks === 1 ? 'task is' : 'tasks are'} open and none are overdue.`);
  } else {
    lines.push('There are no open tasks.');
  }
  const flagged = active.filter((p) => statusReason(p, today));
  if (flagged.length > 0) {
    lines.push(`${flagged.length === 1 ? flagged[0].package_name ?? 'One package' : `${flagged.length} packages`} may need a check-in with your consultant.`);
  }
  return lines;
}
