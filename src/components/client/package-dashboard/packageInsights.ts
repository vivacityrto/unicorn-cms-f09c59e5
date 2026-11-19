import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { formatHours } from './formatters';

export interface HoursPoint {
  activity_date: string;
  hours_on_day: number;
}

export type ForecastVerdict = 'no_hours' | 'used_up' | 'no_recent_work' | 'early' | 'on_pace' | 'spare';

export interface HoursForecast {
  verdict: ForecastVerdict;
  /** Hours a week at the pace of the last four weeks. */
  perWeek: number;
  /** When the hours would run out at that pace, as an ISO date. Null when there is no pace or nothing left. */
  runOutDate: string | null;
  /** Hours that would still be unused at the end date at that pace. Null without an end date. */
  unusedAtEnd: number | null;
  sentence: string;
}

const WINDOW_DAYS = 28;
const NEAR_DAYS = 14;
const day = (d: Date) => format(d, 'd MMM yyyy');

/**
 * Where a package's hours are heading, from the work recorded in the last four weeks.
 * It only describes the pace; it does not promise an outcome, and the sentence says so.
 */
export function hoursForecast(
  points: readonly HoursPoint[],
  hoursTotal: number,
  hoursUsed: number,
  endDate: string | null,
  today: Date = new Date(),
): HoursForecast {
  const empty = { perWeek: 0, runOutDate: null, unusedAtEnd: null };
  if (!(hoursTotal > 0)) return { verdict: 'no_hours', ...empty, sentence: 'This package has no consulting hours to track.' };
  const remaining = Math.max(0, hoursTotal - hoursUsed);
  if (remaining <= 0) return { verdict: 'used_up', ...empty, sentence: 'All of the hours in this package have been used.' };

  const since = addDays(today, -WINDOW_DAYS);
  const recent = points
    .filter((p) => {
      const d = parseISO(p.activity_date);
      return d >= since && d <= today;
    })
    .reduce((n, p) => n + (Number(p.hours_on_day) || 0), 0);
  const perDay = recent / WINDOW_DAYS;
  if (perDay <= 0) {
    return { verdict: 'no_recent_work', ...empty, sentence: 'No hours were recorded in the last four weeks, so there is no pace to project yet.' };
  }

  const perWeek = perDay * 7;
  const runOut = addDays(today, Math.ceil(remaining / perDay));
  const base = { perWeek, runOutDate: format(runOut, 'yyyy-MM-dd') };
  const pace = `At the pace of the last four weeks (${formatHours(perWeek)} a week)`;

  if (!endDate) {
    return { verdict: 'on_pace', ...base, unusedAtEnd: null, sentence: `${pace}, your hours would last until about ${day(runOut)}.` };
  }
  const end = parseISO(endDate);
  // Positive when the hours run out before the end date.
  const gap = differenceInCalendarDays(end, runOut);
  const daysToEnd = Math.max(0, differenceInCalendarDays(end, today));
  const unusedAtEnd = Math.max(0, remaining - perDay * daysToEnd);
  if (gap < -NEAR_DAYS) {
    return {
      verdict: 'spare', ...base, unusedAtEnd,
      sentence: `${pace}, you would reach ${day(end)} with about ${formatHours(unusedAtEnd)} unused. A good moment to plan how to use them.`,
    };
  }
  if (gap > NEAR_DAYS) {
    const weeks = Math.round(gap / 7);
    return {
      verdict: 'early', ...base, unusedAtEnd: 0,
      sentence: `${pace}, your hours would run out around ${day(runOut)}, about ${weeks} ${weeks === 1 ? 'week' : 'weeks'} before ${day(end)}. Worth a chat with your consultant about pacing.`,
    };
  }
  return { verdict: 'on_pace', ...base, unusedAtEnd, sentence: `${pace}, your hours would last almost exactly to ${day(end)}. You are on pace.` };
}

/** What each status pill means, in the words a client would use. */
export const STATUS_MEANING: Record<string, string> = {
  on_track: 'Work is moving and nothing is overdue.',
  drifting: 'Work has slowed, or hours or tasks are getting tight.',
  stuck: 'Nothing has moved for a month, or almost all hours are used.',
  on_hold: 'This package is paused for now.',
  complete: 'This package is finished.',
};
