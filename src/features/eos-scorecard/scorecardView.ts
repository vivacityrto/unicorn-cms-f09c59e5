/**
 * Plain-language view of the EOS scorecard, shared by the Scorecard page and the L10
 * Scorecard discussion deck. A measure is described the way a person would say it:
 * a number, an aim, and one status in words.
 *
 * Weeks are keyed by the Monday that starts them (the convention every manual entry and the
 * L10 grid already use). The week under review is the last one that has fully ended, in Sydney time.
 */
import { calculateStatus } from '@/types/scorecard';
import type { MetricDirection, ScorecardEntry, ScorecardMetric } from '@/types/scorecard';

export type PlainStatus = 'on_track' | 'nearly' | 'off_track' | 'waiting';

export const STATUS_LABEL: Record<PlainStatus, string> = {
  on_track: 'On track',
  nearly: 'Nearly there',
  off_track: 'Off track',
  waiting: 'Needs a number',
};

/** A symbol as well as a colour, so the status never relies on colour alone. */
export const STATUS_MARK: Record<PlainStatus, string> = {
  on_track: '✓',
  nearly: '!',
  off_track: '✕',
  waiting: '…',
};

/** Worst first. */
export const STATUS_ORDER: readonly PlainStatus[] = ['off_track', 'nearly', 'waiting', 'on_track'];

export const HISTORY_WEEKS = 8;

// ---------------------------------------------------------------- weeks

const TZ = 'Australia/Sydney';

export function sydneyDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday (yyyy-mm-dd) of the most recent week that has fully ended, in Sydney time. */
export function lastCompletedWeekKey(now: Date = new Date()): string {
  const today = sydneyDate(now);
  const [y, m, d] = today.split('-').map(Number);
  const isoDow = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; // Mon=1 .. Sun=7
  return addDays(today, -(isoDow - 1) - 7);
}

export function shiftWeek(weekKey: string, weeks: number): string {
  return addDays(weekKey, weeks * 7);
}

/** "9 to 15 November 2026", or "28 October to 3 November 2026" across a month. */
export function weekLabel(weekKey: string): string {
  const end = addDays(weekKey, 6);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...opts }).format(new Date(`${iso}T00:00:00Z`));
  const sameMonth = weekKey.slice(0, 7) === end.slice(0, 7);
  const sameYear = weekKey.slice(0, 4) === end.slice(0, 4);
  if (sameMonth) return `${fmt(weekKey, { day: 'numeric' })} to ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (sameYear) return `${fmt(weekKey, { day: 'numeric', month: 'long' })} to ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return `${fmt(weekKey, { day: 'numeric', month: 'long', year: 'numeric' })} to ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** "26 October" from yyyy-mm-dd. */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

// ------------------------------------------------------------ numbers

export interface Measure {
  id: string;
  metric: ScorecardMetric;
  name: string;
  /** One plain sentence on what is counted. Empty when the metric has none. */
  description: string;
  category: string;
  ownerId: string | null;
  target: number;
  unit: string;
  direction: MetricDirection;
  source: ScorecardMetric['metric_source'];
  /** The number for the week under review, or null when none has been recorded. */
  value: number | null;
  status: PlainStatus;
  /** The last HISTORY_WEEKS weeks, oldest first, ending with the week under review. Null where nothing was recorded. */
  history: (number | null)[];
  /** The most recent number ever recorded, for "last number: 1 on 26 October". */
  lastEntry: { value: number; weekEnding: string } | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function plainNumber(n: number): string {
  const r = round1(n);
  return Number.isInteger(r) ? r.toLocaleString('en-AU') : r.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatValue(unit: string, value: number | null): string {
  if (value === null || Number.isNaN(value)) return '–';
  if (unit === '$') return `$${Math.round(value).toLocaleString('en-AU')}`;
  if (unit === '%') return `${plainNumber(value)}%`;
  if (unit === 'Hours') return `${plainNumber(value)} hours`;
  if (unit === 'Days') return `${plainNumber(value)} days`;
  return plainNumber(value);
}

export function aimText(m: Pick<Measure, 'unit' | 'target' | 'direction'>): string {
  const a = formatValue(m.unit, m.target);
  if (m.direction === 'lower_is_better') return m.unit === '$' ? `${a} or less` : `${a} or fewer`;
  if (m.direction === 'equals_target') return `exactly ${a}`;
  return `${a} or more`;
}

/** One sentence on how far the number is from the aim. */
export function gapText(m: Pick<Measure, 'unit' | 'target' | 'direction' | 'value'>): string {
  if (m.value === null) return 'No number recorded for this week.';
  const diff = Math.abs(m.value - m.target);
  const limit = m.direction === 'lower_is_better';
  if (diff === 0) return limit ? 'Right on the limit' : 'Right on the aim';
  const amount = m.unit === '$' ? `$${Math.round(diff).toLocaleString('en-AU')}` : `${plainNumber(diff)}${m.unit === '%' ? ' points' : ''}`;
  if (m.direction === 'equals_target') return `${amount} away from the aim`;
  if (m.direction === 'lower_is_better') return m.value <= m.target ? `${amount} under the limit` : `${amount} over the limit`;
  return m.value >= m.target ? `${amount} above the aim` : `${amount} below the aim`;
}

/** "Up 3 points on last week", from the two most recent weeks that have a number. */
export function changeText(m: Pick<Measure, 'unit' | 'history'>): string | null {
  const h = m.history;
  const current = h[h.length - 1];
  if (current === null || current === undefined) return null;
  let previous: number | null = null;
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i] !== null) {
      previous = h[i];
      break;
    }
  }
  if (previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return 'Same as last week';
  const amount = m.unit === '$' ? `$${Math.round(Math.abs(diff)).toLocaleString('en-AU')}` : `${plainNumber(Math.abs(diff))}${m.unit === '%' ? ' points' : ''}`;
  return `${diff > 0 ? 'Up' : 'Down'} ${amount} on last week`;
}

export function statusOf(value: number | null, target: number, direction: MetricDirection): PlainStatus {
  if (value === null || Number.isNaN(value)) return 'waiting';
  const s = calculateStatus(value, target, direction);
  if (s === 'green') return 'on_track';
  if (s === 'amber') return 'nearly';
  if (s === 'red') return 'off_track';
  return 'waiting';
}

/** Accepts "$1,200", "12 %", " 7 "; returns null when it is not a usable number. */
export function parseNumberInput(text: string): number | null {
  const cleaned = text.replace(/[$,%\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ----------------------------------------------------- building measures

function entryValue(e: Pick<ScorecardEntry, 'value' | 'actual_value'>): number {
  return Number(e.actual_value ?? e.value);
}

/** The latest entry whose week_ending falls in the week starting weekKey (tolerates a Sunday-keyed entry). */
function valueForWeek(entries: readonly ScorecardEntry[], weekKey: string): number | null {
  const end = addDays(weekKey, 6);
  let best: ScorecardEntry | null = null;
  for (const e of entries) {
    const day = e.week_ending.slice(0, 10);
    if (day >= weekKey && day <= end && (!best || day > best.week_ending.slice(0, 10))) best = e;
  }
  return best ? entryValue(best) : null;
}

export function buildMeasures(metrics: readonly ScorecardMetric[], weekKey: string): Measure[] {
  return metrics.map((metric) => {
    const entries = metric.recentEntries ?? [];
    const value = valueForWeek(entries, weekKey);
    const history: (number | null)[] = [];
    for (let i = HISTORY_WEEKS - 1; i >= 0; i--) history.push(valueForWeek(entries, shiftWeek(weekKey, -i)));
    let last: ScorecardEntry | null = null;
    for (const e of entries) {
      if (!last || e.week_ending.slice(0, 10) > last.week_ending.slice(0, 10)) last = e;
    }
    return {
      id: metric.id,
      metric,
      name: metric.name,
      description: metric.description?.trim() ?? '',
      category: metric.category,
      ownerId: metric.owner_id ?? null,
      target: Number(metric.target_value),
      unit: metric.unit,
      direction: metric.direction,
      source: metric.metric_source,
      value,
      status: statusOf(value, Number(metric.target_value), metric.direction),
      history,
      lastEntry: last ? { value: entryValue(last), weekEnding: last.week_ending.slice(0, 10) } : null,
    };
  });
}

// ----------------------------------------------------------- summaries

export interface StatusCounts {
  total: number;
  on_track: number;
  nearly: number;
  off_track: number;
  waiting: number;
}

export function countStatuses(measures: readonly Pick<Measure, 'status'>[]): StatusCounts {
  const counts: StatusCounts = { total: measures.length, on_track: 0, nearly: 0, off_track: 0, waiting: 0 };
  for (const m of measures) counts[m.status] += 1;
  return counts;
}

/** "1 of 14 measures is on track. 4 need attention. 9 are waiting for a number." */
export function headlineSentence(c: StatusCounts): string {
  if (c.total === 0) return 'There are no measures on the scorecard yet.';
  const attention = c.off_track + c.nearly;
  if (c.on_track === c.total) return c.total === 1 ? 'The one measure is on track.' : `All ${c.total} measures are on track.`;
  const parts = [`${c.on_track} of ${c.total} ${c.total === 1 ? 'measure is' : 'measures are'} on track.`];
  if (attention > 0) parts.push(`${attention} ${attention === 1 ? 'needs' : 'need'} attention.`);
  if (c.waiting > 0) parts.push(`${c.waiting} ${c.waiting === 1 ? 'is' : 'are'} waiting for a number.`);
  return parts.join(' ');
}

export function worstStatus(measures: readonly Pick<Measure, 'status'>[]): PlainStatus {
  let worst: PlainStatus = 'on_track';
  for (const m of measures) if (STATUS_ORDER.indexOf(m.status) < STATUS_ORDER.indexOf(worst)) worst = m.status;
  return worst;
}

export function sortWorstFirst<T extends Pick<Measure, 'status'>>(measures: readonly T[]): T[] {
  return measures
    .map((m, index) => ({ m, index }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.m.status) - STATUS_ORDER.indexOf(b.m.status) || a.index - b.index)
    .map(({ m }) => m);
}

// ---------------------------------------------------------------- areas

/** The category the scorecard stores, said the way people say it. */
const AREA_NAME: Record<string, string> = { CST: 'Client engagement' };
const AREA_WHO: Record<string, string> = { CST: 'Customer Success Team' };
const AREA_ORDER = ['CST', 'Sales', 'Marketing', 'Finance', 'Compliance', 'Delivery', 'Product', 'Team'];

export interface Area {
  category: string;
  name: string;
  who: string | null;
  measures: Measure[];
  worst: PlainStatus;
}

export function areaName(category: string): string {
  return AREA_NAME[category] ?? category;
}

export function groupAreas(measures: readonly Measure[]): Area[] {
  const byCategory = new Map<string, Measure[]>();
  for (const m of measures) byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m]);
  const rank = (c: string) => (AREA_ORDER.includes(c) ? AREA_ORDER.indexOf(c) : AREA_ORDER.length);
  return [...byCategory.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      name: areaName(category),
      who: AREA_WHO[category] ?? null,
      measures: sortWorstFirst(list),
      worst: worstStatus(list),
    }));
}

/** An area needs the room when something in it is off track or nearly there. Missing numbers are handled separately. */
export function areaNeedsRoom(area: Pick<Area, 'worst'>): boolean {
  return area.worst === 'off_track' || area.worst === 'nearly';
}

/** The facilitator's question for an area, read from the numbers in it. */
export function areaCue(area: Pick<Area, 'measures'>): string {
  const c = countStatuses(area.measures);
  const n = c.total;
  const sentences: string[] = [];
  if (c.off_track > 0) {
    sentences.push(`${c.off_track === n ? (n === 1 ? 'The measure is' : `All ${n} measures are`) : `${c.off_track} of ${n} measures ${c.off_track === 1 ? 'is' : 'are'}`} off track. What is getting in the way?`);
  } else if (c.nearly > 0) {
    sentences.push(`${c.nearly} ${c.nearly === 1 ? 'measure is' : 'measures are'} nearly there. Is anything at risk of slipping?`);
  }
  if (c.waiting > 0) {
    sentences.push(`${c.waiting === n ? (n === 1 ? 'There is no number for this week.' : `There are no numbers for ${n === 2 ? 'either' : 'any'} of these.`) : `${c.waiting} ${c.waiting === 1 ? 'number is' : 'numbers are'} missing.`} Who is entering ${c.waiting === 1 ? 'it' : 'them'}, and by when?`);
  }
  if (sentences.length === 0) sentences.push('Everything here is on track. Does the room need to know anything?');
  return sentences.join(' ');
}

// ------------------------------------------------------------ IDS draft

export interface IssueDraft {
  title: string;
  description: string;
}

/** The issue raised for IDS, drafted from the numbers so nobody has to retype them. */
export function issueDraft(m: Measure, weekKey: string, note = '', ownerName: string | null = null): IssueDraft {
  const titleBase =
    m.status === 'waiting'
      ? `No number for ${m.name}`
      : `${m.status === 'nearly' ? 'Nearly there' : 'Off track'}: ${m.name} is ${formatValue(m.unit, m.value)} (aim ${aimText(m)})`;
  const recent = m.history.map((v) => (v === null ? '–' : formatValue(m.unit, v))).join(', ');
  const lines = [
    `Scorecard measure: ${m.name}`,
    `Week: ${weekLabel(weekKey)}`,
    `This week: ${m.value === null ? 'no number recorded' : formatValue(m.unit, m.value)}`,
    `Aim: ${aimText(m)}`,
    `Status: ${STATUS_LABEL[m.status]}`,
    `Last ${HISTORY_WEEKS} weeks (oldest first): ${recent}`,
  ];
  if (ownerName) lines.push(`Owner: ${ownerName}`);
  if (note.trim()) lines.push('', `For the room to decide: ${note.trim()}`);
  return { title: titleBase.slice(0, 140), description: lines.join('\n') };
}
