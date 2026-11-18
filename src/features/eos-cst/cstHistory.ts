/**
 * Comparing a Client activity report period with the ones before it. The report function already takes any date, so
 * the earlier periods are the same report asked for earlier dates: nothing new in the database.
 */
import type { MetricDirection } from '@/types/scorecard';
import { addDays } from '@/features/eos-scorecard/scorecardView';
import { percent, shiftAnchor, type CstPeriod, type CstReport, type CstReportCsc, type CstReportRto, type CstReportTotals } from './cstReport';
import { flattenRtos } from './cstInsights';

/** How many periods are compared, the one on screen included. */
export const HISTORY_COUNT: Record<CstPeriod, number> = { week: 8, month: 6, year: 3, days28: 6 };

export const PERIOD_NOUN: Record<CstPeriod, string> = { week: 'week', month: 'month', year: 'year', days28: 'period' };

/** A date inside the period `steps` before the one that contains `anchor`. */
export function stepAnchor(anchor: string, period: CstPeriod, steps: number): string {
  if (steps === 0) return anchor;
  if (period === 'days28') return addDays(anchor, -28 * steps);
  let out = anchor;
  for (let i = 0; i < steps; i++) out = shiftAnchor(out, period, -1);
  return out;
}

/** One date per period to compare, oldest first, ending with the anchor itself. */
export function historyAnchors(period: CstPeriod, anchor: string, count: number = HISTORY_COUNT[period]): string[] {
  return Array.from({ length: count }, (_, i) => stepAnchor(anchor, period, count - 1 - i));
}

export type CstSeriesKey = 'portal' | 'clients' | 'certificates' | 'never';

export interface CstSeriesDef {
  key: CstSeriesKey;
  label: string;
  /** One short phrase for where the number comes from. */
  hint: string;
  unit: string;
  direction: MetricDirection;
  /**
   * The number is counted as of today whatever period is on screen, so earlier periods would repeat today's count and
   * look falsely steady. Only the latest period is kept; the rest are gaps.
   */
  asOfToday?: boolean;
  /** The number for a whole report or for one CSC. Null when there is nothing to divide by. */
  total: (t: CstReportTotals) => number | null;
  /** The same number for one client. */
  client: (r: CstReportRto) => number | null;
}

export const CST_SERIES: readonly CstSeriesDef[] = [
  {
    key: 'portal',
    label: 'Client users using the portal',
    hint: 'Share of client users who did something in the period.',
    unit: '%',
    direction: 'higher_is_better',
    total: (t) => percent(t.active_users, t.client_users),
    client: (r) => percent(r.active_users, r.client_users),
  },
  {
    key: 'clients',
    label: 'Clients with someone active',
    hint: 'Share of clients with users where at least one person used the portal.',
    unit: '%',
    direction: 'higher_is_better',
    total: (t) => percent(t.rtos_active, t.rtos_with_users),
    client: (r) => (r.client_users > 0 ? (r.active_users > 0 ? 100 : 0) : null),
  },
  {
    key: 'certificates',
    label: 'Certificates issued',
    hint: 'Course certificates earned in the period.',
    unit: '',
    direction: 'higher_is_better',
    total: (t) => t.certificates,
    client: (r) => r.certificates,
  },
  {
    key: 'never',
    label: 'Users who never signed in',
    hint: 'Invited people with no sign-in, as of today.',
    unit: '',
    direction: 'lower_is_better',
    asOfToday: true,
    total: (t) => t.never_signed_in,
    client: (r) => r.never_signed_in,
  },
];

export const seriesDef = (key: CstSeriesKey): CstSeriesDef => CST_SERIES.find((s) => s.key === key) ?? CST_SERIES[0];

/** A report counts as empty when it has no Live Clients, such as a period before the data starts. */
const hasData = (r: CstReport | undefined): r is CstReport => !!r && r.totals.live_rtos > 0;

/** The measure for each period, oldest first. A period that could not be loaded or has no clients is a gap. */
export function totalSeries(def: CstSeriesDef, reports: readonly (CstReport | undefined)[]): (number | null)[] {
  return latestOnly(def, reports.map((r) => (hasData(r) ? def.total(r.totals) : null)));
}

/** For a number counted as of today, every period but the latest is a gap, because it has no history of its own. */
function latestOnly(def: CstSeriesDef, series: (number | null)[]): (number | null)[] {
  return def.asOfToday ? series.map((v, i) => (i === series.length - 1 ? v : null)) : series;
}

/** Each CSC's number for each period, oldest first. A CSC missing from a period is a gap there. */
export function cscSeriesByName(def: CstSeriesDef, reports: readonly (CstReport | undefined)[]): { name: string; series: (number | null)[] }[] {
  const names = new Set<string>();
  for (const r of reports) if (hasData(r)) for (const c of r.csc) names.add(c.csc_name);
  return [...names].map((name) => ({
    name,
    series: latestOnly(
      def,
      reports.map((r) => {
        const group: CstReportCsc | undefined = hasData(r) ? r.csc.find((c) => c.csc_name === name) : undefined;
        return group ? def.total(group) : null;
      }),
    ),
  }));
}

/** Each client's number for each period, oldest first, keyed by client. */
export function clientSeries(def: CstSeriesDef, reports: readonly (CstReport | undefined)[]): { name: string; cscName: string; tenantId: number; series: (number | null)[] }[] {
  const latest = [...reports].reverse().find(hasData);
  if (!latest) return [];
  const perReport = reports.map((r) => new Map(hasData(r) ? flattenRtos(r).map((row) => [row.tenant_id, row] as const) : []));
  return flattenRtos(latest).map((row) => ({
    name: row.tenant_name,
    cscName: row.cscName,
    tenantId: row.tenant_id,
    series: latestOnly(
      def,
      perReport.map((m) => {
        const found = m.get(row.tenant_id);
        return found ? def.client(found) : null;
      }),
    ),
  }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A short label for the axis: "22 Nov" for a week or 28 days (the day it ends), "Nov" for a month, "2026" for a year. */
export function shortPeriodLabel(period: CstPeriod, report: Pick<CstReport, 'start' | 'end'>): string {
  const last = new Date(new Date(report.end).getTime() - 1);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(last);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const month = MONTHS[Number(get('month')) - 1] ?? '';
  if (period === 'year') return get('year');
  if (period === 'month') return month;
  return `${Number(get('day'))} ${month}`;
}
