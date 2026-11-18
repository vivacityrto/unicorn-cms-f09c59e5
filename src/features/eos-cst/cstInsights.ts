/**
 * Pure helpers behind the "why" panels on the Client activity report: what the headline numbers are made of, split
 * every useful way, from the same get_cst_report data. No fetching here.
 */
import type { CstClientRow } from '@/features/eos-scorecard/cstBreakdown';
import { addDays, shortDate, sydneyDate } from '@/features/eos-scorecard/scorecardView';
import { percent, type CstReport, type CstReportRto, type CstReportTotals } from './cstReport';

export interface RtoRow extends CstReportRto {
  cscId: string | null;
  cscName: string;
}

/** Every Live Client in the report with the CSC it belongs to. */
export const flattenRtos = (report: CstReport): RtoRow[] =>
  report.csc.flatMap((c) => c.rtos.map((r) => ({ ...r, cscId: c.csc_user_id, cscName: c.csc_name })));

/** The first and last Sydney calendar days the report covers, inclusive. The report's end is exclusive. */
export function periodDates(report: Pick<CstReport, 'start' | 'end'>): { from: string; to: string } {
  return { from: sydneyDate(new Date(report.start)), to: sydneyDate(new Date(new Date(report.end).getTime() - 1)) };
}

export const userSplit = (t: Pick<CstReportTotals, 'client_users' | 'active_users'>) => ({ active: t.active_users, quiet: Math.max(0, t.client_users - t.active_users) });

export interface ClientBuckets {
  /** Has users, none active. */
  nobody: number;
  /** More than none, up to a quarter of its users. */
  quarter: number;
  /** More than a quarter, up to half. */
  half: number;
  /** More than half. */
  most: number;
  /** No client users at all, so there is nothing to be active. */
  noUsers: number;
}

/** How clients are spread by the share of their own users who were active. */
export function clientBuckets(rows: readonly Pick<CstReportRto, 'client_users' | 'active_users'>[]): ClientBuckets {
  const b: ClientBuckets = { nobody: 0, quarter: 0, half: 0, most: 0, noUsers: 0 };
  for (const r of rows) {
    if (r.client_users <= 0) b.noUsers += 1;
    else if (r.active_users <= 0) b.nobody += 1;
    else {
      const share = r.active_users / r.client_users;
      if (share <= 0.25) b.quarter += 1;
      else if (share <= 0.5) b.half += 1;
      else b.most += 1;
    }
  }
  return b;
}

export interface CscRate {
  name: string;
  clients: number;
  users: number;
  active: number;
  neverSignedIn: number;
  certificates: number;
  /** Null when the CSC's clients have no users. */
  pct: number | null;
}

/** One row per CSC, best use of the portal first, those with nobody to measure last. */
export function cscRates(report: CstReport): CscRate[] {
  return report.csc
    .map((c) => ({
      name: c.csc_name,
      clients: c.live_rtos,
      users: c.client_users,
      active: c.active_users,
      neverSignedIn: c.never_signed_in,
      certificates: c.certificates,
      pct: percent(c.active_users, c.client_users),
    }))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.users - a.users || a.name.localeCompare(b.name));
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Counts per day for a window of up to five weeks, per month for anything longer, with empty days and months kept in
 * so a quiet stretch looks quiet. Days are Sydney days.
 */
export function bucketByTime(timestamps: readonly string[], from: string, to: string): Bucket[] {
  const days = timestamps.map((t) => sydneyDate(new Date(t))).filter((d) => d >= from && d <= to);
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (span <= 35) {
    const out: Bucket[] = [];
    for (let i = 0; i < span; i++) {
      const day = addDays(from, i);
      out.push({ key: day, label: shortDate(day), count: days.filter((d) => d === day).length });
    }
    return out;
  }
  const out: Bucket[] = [];
  let cursor = `${from.slice(0, 7)}-01`;
  while (cursor <= to) {
    const key = cursor.slice(0, 7);
    out.push({ key, label: MONTHS[Number(key.slice(5, 7)) - 1], count: days.filter((d) => d.startsWith(key)).length });
    const next = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return out;
}

/** The report row in the shape the client drill-down expects. */
export const toClientRow = (r: RtoRow): CstClientRow => ({
  tenantId: r.tenant_id,
  name: r.tenant_name,
  cscId: r.cscId,
  cscName: r.cscName,
  clientUsers: r.client_users,
  activeUsers: r.active_users,
  neverSignedIn: r.never_signed_in,
  certificates: r.certificates,
  lastActiveAt: r.last_active_at,
});

export interface LabelledCount {
  label: string;
  count: number;
  /** A second number shown with it, such as how many were finished. */
  second?: number;
}

/** The top rows by a count, biggest first, ties by name. Zeros are dropped. */
export function topCounts<T>(rows: readonly T[], label: (r: T) => string, count: (r: T) => number, n = 8): LabelledCount[] {
  return rows
    .map((r) => ({ label: label(r), count: count(r) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}
