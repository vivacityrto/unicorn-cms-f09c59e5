/**
 * Week-on-week comparison for the automatic client measures in the scorecard Full Report: each CSC's own number for
 * each week, and each client's. Built from the same weekly snapshot rows as the measure itself, so the totals agree.
 */
import type { MetricDirection } from '@/types/scorecard';
import { metricFromRows, type BreakdownKind, type CstClientRow } from './cstBreakdown';
import type { GroupSeries } from './comparison';

type RowsByWeek = Readonly<Record<string, readonly CstClientRow[]>>;

/** The week endings to compare, oldest first, never more than `count`. */
export function compareWeeks(byWeek: RowsByWeek, count = 8): string[] {
  return Object.keys(byWeek).sort().slice(-count);
}

/** Each CSC's measure for each week. A CSC with no clients that week has a gap there. */
export function cscWeekSeries(kind: BreakdownKind, byWeek: RowsByWeek, weeks: readonly string[]): GroupSeries[] {
  const names = new Set<string>();
  for (const w of weeks) for (const r of byWeek[w] ?? []) names.add(r.cscName);
  return [...names].map((name) => ({
    name,
    series: weeks.map((w) => {
      const rows = (byWeek[w] ?? []).filter((r) => r.cscName === name);
      return rows.length === 0 ? null : metricFromRows(kind, rows);
    }),
  }));
}

/** How a client is judged for each kind of measure: a share for activity, a count for the other two. */
export function clientDirection(kind: BreakdownKind): MetricDirection {
  return kind === 'never_signed_in' ? 'lower_is_better' : 'higher_is_better';
}

export function clientUnit(kind: BreakdownKind): string {
  return kind === 'never_signed_in' || kind === 'certificates' ? '' : '%';
}

/** The one number that describes a client for this kind of measure, or null when it has no users to measure. */
export function clientNumber(kind: BreakdownKind, r: CstClientRow): number | null {
  if (kind === 'never_signed_in') return r.neverSignedIn;
  if (kind === 'certificates') return r.certificates;
  return r.clientUsers > 0 ? Math.round((r.activeUsers * 1000) / r.clientUsers) / 10 : null;
}

/** Each client's number for each week, named from the latest week, so a client that left is not listed. */
export function clientWeekSeries(kind: BreakdownKind, byWeek: RowsByWeek, weeks: readonly string[]): GroupSeries[] {
  const latest = byWeek[weeks[weeks.length - 1]] ?? [];
  const perWeek = weeks.map((w) => new Map((byWeek[w] ?? []).map((r) => [r.tenantId, r] as const)));
  return latest.map((row) => ({
    name: row.name,
    series: perWeek.map((m) => {
      const found = m.get(row.tenantId);
      return found ? clientNumber(kind, found) : null;
    }),
  }));
}
