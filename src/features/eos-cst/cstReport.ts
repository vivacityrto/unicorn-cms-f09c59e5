/**
 * CST scorecard report: types and pure helpers.
 * Definitions: docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md
 * Data comes from the get_cst_report RPC (Vivacity staff only).
 */

export type CstPeriod = 'week' | 'month' | 'year' | 'days28';

export const CST_PERIOD_OPTIONS: { value: CstPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'days28', label: 'Last 28 days' },
];

export interface CstReportRto {
  tenant_id: number;
  tenant_name: string;
  client_users: number;
  active_users: number;
  never_signed_in: number;
  certificates: number;
  prior_certificates: number;
}

export interface CstReportTotals {
  live_rtos: number;
  client_users: number;
  active_users: number;
  rtos_active: number;
  rtos_with_users: number;
  never_signed_in: number;
  certificates: number;
  prior_certificates: number;
}

export interface CstReportCsc extends CstReportTotals {
  csc_user_id: string | null;
  csc_name: string;
  rtos: CstReportRto[];
}

export interface CstReport {
  period: CstPeriod;
  start: string;
  end: string;
  prior_start: string;
  prior_end: string;
  generated_at: string;
  totals: CstReportTotals;
  csc: CstReportCsc[];
}

const TZ = 'Australia/Sydney';

/** Whole-number percentage, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export function formatPercent(part: number, whole: number): string {
  const p = percent(part, whole);
  return p === null ? '–' : `${p}%`;
}

/** Signed difference against the prior period, or null when the year has no prior data to compare. */
export function certificateDelta(
  period: CstPeriod,
  current: number,
  prior: number,
): { delta: number; direction: 'up' | 'down' | 'flat' } | null {
  // Academy certificates start in 2026, so a prior year has nothing to compare against.
  if (period === 'year' && prior === 0) return null;
  const delta = current - prior;
  return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

/** Last instant of an exclusive-end window, so labels never show the next period's first day. */
function inclusiveEnd(endIso: string): Date {
  return new Date(new Date(endIso).getTime() - 1);
}

export function periodLabel(period: CstPeriod, startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = inclusiveEnd(endIso);
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  if (period === 'month') {
    return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, month: 'long', year: 'numeric' }).format(start);
  }
  if (period === 'year') {
    return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, year: 'numeric' }).format(start);
  }
  if (period === 'week') {
    return `Week ending ${day.format(end)}`;
  }
  return `${day.format(start)} to ${day.format(end)}`;
}

/** Move the anchor date by one period. Returns yyyy-mm-dd. Rolling 28 days does not navigate. */
export function shiftAnchor(anchor: string, period: CstPeriod, direction: -1 | 1): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (period === 'week') date.setUTCDate(date.getUTCDate() + 7 * direction);
  else if (period === 'month') date.setUTCMonth(date.getUTCMonth() + direction, 1);
  else if (period === 'year') date.setUTCFullYear(date.getUTCFullYear() + direction, 0, 1);
  return date.toISOString().slice(0, 10);
}

/** Today's date in Sydney as yyyy-mm-dd. */
export function sydneyToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // Neutralise spreadsheet formulas in text taken from tenant or user names.
  const safe = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per RTO, with its primary CSC. Meant for the Export CSV button. */
export function reportToCsv(report: CstReport): string {
  const header = [
    'Primary CSC',
    'RTO',
    'Client users',
    'Active users',
    'Activity rate %',
    'Never signed in',
    'Certificates issued',
    'Prior period certificates',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const csc of report.csc) {
    for (const rto of csc.rtos) {
      lines.push(
        [
          csc.csc_name,
          rto.tenant_name,
          rto.client_users,
          rto.active_users,
          percent(rto.active_users, rto.client_users),
          rto.never_signed_in,
          rto.certificates,
          rto.prior_certificates,
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return lines.join('\r\n');
}

export function csvFilename(report: CstReport): string {
  return `cst-report-${report.period}-${report.start.slice(0, 10)}.csv`;
}
