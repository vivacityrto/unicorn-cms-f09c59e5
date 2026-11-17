// Week keys for scorecard entries.
//
// Every manual entry, and the L10 entry grid, key a scorecard week by the
// Monday that starts it (stored in eos_scorecard_entries.week_ending). The
// CST weekly snapshot (cst_scorecard_weekly_snapshot) keys a week by the
// Sunday that ends it. These helpers keep the two aligned so a refresh
// updates the existing entry instead of creating a second one beside it.

const SYDNEY = 'Australia/Sydney';

/** Today's date in Sydney as yyyy-mm-dd. */
export function sydneyDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday (yyyy-mm-dd) of the most recent week that has fully ended, in Sydney time. */
export function lastCompletedWeekKey(now: Date = new Date()): string {
  const today = sydneyDate(now);
  const [y, m, d] = today.split('-').map(Number);
  const isoDow = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; // Mon=1 .. Sun=7
  // Back to this week's Monday, then one more week: that week has ended.
  return addDays(today, -(isoDow - 1) - 7);
}

/**
 * The Sunday that ends the scorecard week keyed by `weekKey`.
 * A Monday key (the app convention) maps to the Sunday six days later.
 * Any other date is returned unchanged, so a caller that already passes a
 * Sunday keeps working.
 */
export function snapshotWeekEnding(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  const isMonday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
  return isMonday ? addDays(weekKey, 6) : weekKey;
}
