import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { formatWorkType } from './formatters';

/** What get_client_package_activity returns. Aggregated only: no consultant, no note text. */
export interface PackageActivity {
  window: { start: string; end: string } | null;
  daily: Array<{ day: string; work_type: string; minutes: number; entries: number }>;
  touchpoints: Array<{ week_start: string; kind: TouchKind; count: number }>;
  tasks: Array<{ week_start: string; created: number; completed: number }>;
  documents: Array<{ week_start: string; count: number }>;
}

export type TouchKind = 'email' | 'meeting' | 'call' | 'follow_up';
export const TOUCH_LABEL: Record<TouchKind, string> = { email: 'Email', meeting: 'Meeting', call: 'Call', follow_up: 'Follow-up' };

export type Shape = 'circle' | 'square' | 'diamond' | 'triangle';

export interface WorkTypeStyle {
  key: string;
  label: string;
  /** Tailwind classes that work in light and dark. */
  bg: string;
  fill: string;
  text: string;
  /** Shape on the timeline, so type is never told by colour alone. */
  shape: Shape;
}

const STYLES: Record<string, Omit<WorkTypeStyle, 'key' | 'label'>> = {
  meeting: { bg: 'bg-emerald-500', fill: 'fill-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', shape: 'circle' },
  consultation: { bg: 'bg-teal-500', fill: 'fill-teal-500', text: 'text-teal-700 dark:text-teal-300', shape: 'circle' },
  general: { bg: 'bg-blue-500', fill: 'fill-blue-500', text: 'text-blue-700 dark:text-blue-300', shape: 'square' },
  document_review: { bg: 'bg-amber-500', fill: 'fill-amber-500', text: 'text-amber-800 dark:text-amber-300', shape: 'diamond' },
  document_development: { bg: 'bg-violet-500', fill: 'fill-violet-500', text: 'text-violet-700 dark:text-violet-300', shape: 'diamond' },
  support: { bg: 'bg-cyan-500', fill: 'fill-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', shape: 'triangle' },
  admin: { bg: 'bg-slate-400', fill: 'fill-slate-400', text: 'text-slate-600 dark:text-slate-300', shape: 'square' },
};
const OTHER: Omit<WorkTypeStyle, 'key' | 'label'> = { bg: 'bg-zinc-400', fill: 'fill-zinc-400', text: 'text-zinc-600 dark:text-zinc-300', shape: 'triangle' };

/** One look per kind of work, shared by every chart on the page so the same work is always the same colour and shape. */
export function workTypeStyle(type: string): WorkTypeStyle {
  const key = type.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return { key, label: formatWorkType(key) || 'Other', ...(STYLES[key] ?? OTHER) };
}

const MAX_TYPES = 5;

export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** The Monday of the week a date falls in, as yyyy-mm-dd (weeks run Monday to Sunday, as the database groups them). */
export function weekOf(day: string): string {
  return format(startOfWeek(parseISO(day), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export interface WeekBin {
  week: string;
  minutes: number;
  entries: number;
  /** The kind of work that took most of this week. */
  dominant: string;
  byType: Record<string, number>;
  cumulativeHours: number;
}

/** Hours grouped into weeks with a running total, only for weeks that had activity. */
export function weekBins(daily: PackageActivity['daily']): WeekBin[] {
  const map = new Map<string, WeekBin>();
  for (const d of daily) {
    const wk = weekOf(d.day);
    const b = map.get(wk) ?? { week: wk, minutes: 0, entries: 0, dominant: d.work_type, byType: {}, cumulativeHours: 0 };
    b.minutes += d.minutes;
    b.entries += d.entries;
    b.byType[d.work_type] = (b.byType[d.work_type] ?? 0) + d.minutes;
    map.set(wk, b);
  }
  const bins = [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
  let running = 0;
  for (const b of bins) {
    b.dominant = Object.entries(b.byType).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
    running += b.minutes;
    b.cumulativeHours = Math.round((running / 60) * 100) / 100;
  }
  return bins;
}

/** The work types shown as their own row (the biggest few) and everything else folded into "Other". */
export function topTypes(daily: PackageActivity['daily']): string[] {
  const totals = new Map<string, number>();
  for (const d of daily) totals.set(d.work_type, (totals.get(d.work_type) ?? 0) + d.minutes);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  return ranked.length > MAX_TYPES ? [...ranked.slice(0, MAX_TYPES), 'Other'] : ranked;
}

export interface HeatmapData {
  types: string[];
  weeks: string[];
  /** minutes[typeIndex][weekIndex] */
  minutes: number[][];
  maxMinutes: number;
}

/** Hours by week and work type over every week from the first to the last with activity, so quiet weeks show as gaps. */
export function heatmap(daily: PackageActivity['daily'], through: Date = new Date()): HeatmapData {
  const types = topTypes(daily);
  if (daily.length === 0) return { types, weeks: [], minutes: [], maxMinutes: 0 };
  const first = weekOf(daily.map((d) => d.day).sort()[0]);
  const lastActive = weekOf(daily.map((d) => d.day).sort().slice(-1)[0]);
  const thisWeek = format(startOfWeek(through, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const last = lastActive > thisWeek ? lastActive : thisWeek;
  const weeks: string[] = [];
  for (let w = parseISO(first); format(w, 'yyyy-MM-dd') <= last; w = addDays(w, 7)) weeks.push(format(w, 'yyyy-MM-dd'));
  const known = new Set(types);
  const minutes = types.map(() => weeks.map(() => 0));
  for (const d of daily) {
    const row = types.indexOf(known.has(d.work_type) ? d.work_type : 'Other');
    const col = weeks.indexOf(weekOf(d.day));
    if (row >= 0 && col >= 0) minutes[row][col] += d.minutes;
  }
  return { types, weeks, minutes, maxMinutes: Math.max(0, ...minutes.flat()) };
}

export interface MonthMix {
  month: string;
  totalMinutes: number;
  shares: Array<{ type: string; minutes: number; percent: number }>;
}

/** Share of each month's hours by work type, for a 100% stacked bar per month. */
export function mixByMonth(daily: PackageActivity['daily']): MonthMix[] {
  const types = topTypes(daily);
  const known = new Set(types);
  const months = new Map<string, Map<string, number>>();
  for (const d of daily) {
    const m = d.day.slice(0, 7);
    const t = known.has(d.work_type) ? d.work_type : 'Other';
    const row = months.get(m) ?? new Map<string, number>();
    row.set(t, (row.get(t) ?? 0) + d.minutes);
    months.set(m, row);
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, row]) => {
      const total = [...row.values()].reduce((n, v) => n + v, 0);
      return {
        month,
        totalMinutes: total,
        shares: types.filter((t) => row.has(t)).map((type) => ({ type, minutes: row.get(type)!, percent: total ? Math.round((row.get(type)! / total) * 100) : 0 })),
      };
    });
}

export interface Snapshot {
  weekStart: string;
  hoursThisWeek: number;
  hoursLastWeek: number;
  entriesThisWeek: number;
  topTypeThisWeek: string | null;
  touchpointsThisWeek: number;
  tasksClosedThisWeek: number;
  documentsThisWeek: number;
  daysSinceLastEntry: number | null;
  /** Plain sentences a person could forward as they are. */
  lines: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** This week against last week, from the aggregated figures only. */
export function weeklySnapshot(a: PackageActivity, today: Date = new Date()): Snapshot {
  const thisWeek = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const lastWeek = format(addDays(parseISO(thisWeek), -7), 'yyyy-MM-dd');
  const inWeek = (w: string) => a.daily.filter((d) => weekOf(d.day) === w);
  const mins = (w: string) => inWeek(w).reduce((n, d) => n + d.minutes, 0);
  const thisRows = inWeek(thisWeek);
  const byType = new Map<string, number>();
  for (const d of thisRows) byType.set(d.work_type, (byType.get(d.work_type) ?? 0) + d.minutes);
  const top = [...byType.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

  const days = a.daily.map((d) => d.day).sort();
  const lastEntry = days.length ? days[days.length - 1] : null;
  const s: Snapshot = {
    weekStart: thisWeek,
    hoursThisWeek: hoursOf(mins(thisWeek)),
    hoursLastWeek: hoursOf(mins(lastWeek)),
    entriesThisWeek: thisRows.reduce((n, d) => n + d.entries, 0),
    topTypeThisWeek: top,
    touchpointsThisWeek: a.touchpoints.filter((t) => t.week_start === thisWeek).reduce((n, t) => n + t.count, 0),
    tasksClosedThisWeek: a.tasks.filter((t) => t.week_start === thisWeek).reduce((n, t) => n + t.completed, 0),
    documentsThisWeek: a.documents.filter((t) => t.week_start === thisWeek).reduce((n, t) => n + t.count, 0),
    daysSinceLastEntry: lastEntry ? Math.max(0, differenceInCalendarDays(today, parseISO(lastEntry))) : null,
    lines: [],
  };

  if (a.daily.length === 0) {
    s.lines = ['No hours have been recorded on this package yet.'];
    return s;
  }
  if (s.hoursThisWeek === 0 && s.hoursLastWeek === 0) {
    s.lines.push(s.daysSinceLastEntry !== null ? `Nothing has been logged for two weeks. The last entry was ${plural(s.daysSinceLastEntry, 'day')} ago.` : 'Nothing has been logged for two weeks.');
  } else {
    const diff = Math.round((s.hoursThisWeek - s.hoursLastWeek) * 10) / 10;
    const trend = diff === 0 ? 'the same as last week' : diff > 0 ? `${diff} hours more than last week` : `${Math.abs(diff)} hours fewer than last week`;
    s.lines.push(`${s.hoursThisWeek} hours logged this week across ${plural(s.entriesThisWeek, 'entry', 'entries')}, ${trend}.`);
    if (s.topTypeThisWeek) s.lines.push(`Most of it was ${formatWorkType(s.topTypeThisWeek).toLowerCase()}.`);
  }
  const bits: string[] = [];
  if (s.touchpointsThisWeek > 0) bits.push(`${plural(s.touchpointsThisWeek, 'touchpoint')} with your Vivacity team`);
  if (s.tasksClosedThisWeek > 0) bits.push(`${plural(s.tasksClosedThisWeek, 'task')} closed`);
  if (s.documentsThisWeek > 0) bits.push(`${plural(s.documentsThisWeek, 'document')} generated`);
  if (bits.length) s.lines.push(`Also this week: ${bits.join(', ')}.`);
  return s;
}

export interface ActivityFacts {
  busiestMonth: { label: string; hours: number } | null;
  activeWeeks: number;
  totalWeeks: number;
  longestQuietDays: number;
  sentence: string;
}

/** A few facts about the whole package's rhythm, and one sentence that says them. */
export function activityFacts(a: PackageActivity): ActivityFacts {
  const bins = weekBins(a.daily);
  if (bins.length === 0) return { busiestMonth: null, activeWeeks: 0, totalWeeks: 0, longestQuietDays: 0, sentence: 'Once hours are recorded, the rhythm of the work will show here.' };
  const months = new Map<string, number>();
  for (const d of a.daily) months.set(d.day.slice(0, 7), (months.get(d.day.slice(0, 7)) ?? 0) + d.minutes);
  const [bm, bmMinutes] = [...months.entries()].sort((x, y) => y[1] - x[1])[0];
  const days = [...new Set(a.daily.map((d) => d.day))].sort();
  let gap = 0;
  for (let i = 1; i < days.length; i += 1) gap = Math.max(gap, differenceInCalendarDays(parseISO(days[i]), parseISO(days[i - 1])) - 1);
  const first = parseISO(bins[0].week);
  const last = parseISO(bins[bins.length - 1].week);
  const totalWeeks = Math.round(differenceInCalendarDays(last, first) / 7) + 1;
  const label = format(parseISO(`${bm}-01`), 'MMMM yyyy');
  return {
    busiestMonth: { label, hours: hoursOf(bmMinutes) },
    activeWeeks: bins.length,
    totalWeeks,
    longestQuietDays: gap,
    sentence: `Work happened in ${bins.length} of ${totalWeeks} weeks. The busiest month was ${label} with ${hoursOf(bmMinutes)} hours${gap >= 14 ? `, and the longest quiet stretch was ${gap} days` : ''}.`,
  };
}
