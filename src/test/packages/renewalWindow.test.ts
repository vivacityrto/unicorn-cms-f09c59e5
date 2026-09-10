import { describe, it, expect } from 'vitest';
import { format, parseISO } from 'date-fns';
import { computeRenewalWindow, toUtcMidnightIso } from '@/features/packages/renewalWindow';

// Assertions use date-fns's own `format` (local time) rather than
// `.toISOString()` (UTC) -- date-fns's `parseISO` treats a date-only
// string as local midnight, so converting to UTC before comparing can
// shift the date by a day depending on the test runner's timezone.
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

describe('computeRenewalWindow', () => {
  it('uses next_renewal_date as the window end when set, with a one-year period start', () => {
    const { currentRenewal, periodStart, newRenewalDate } = computeRenewalWindow({
      next_renewal_date: '2026-06-13',
      start_date: '2025-06-13',
    });

    expect(ymd(currentRenewal)).toBe('2026-06-13');
    expect(ymd(periodStart)).toBe('2025-06-13');
    expect(ymd(newRenewalDate)).toBe('2027-06-13');
  });

  it('falls back to start_date + 1 year when next_renewal_date is not set', () => {
    const { currentRenewal, periodStart, newRenewalDate } = computeRenewalWindow({
      next_renewal_date: null,
      start_date: '2025-03-10',
    });

    expect(ymd(currentRenewal)).toBe('2026-03-10');
    expect(ymd(periodStart)).toBe('2025-03-10');
    expect(ymd(newRenewalDate)).toBe('2027-03-10');
  });

  it('clips a 29 February start_date to 28 February in the fallback path (date-fns standard, Carl decision 2026-09-11)', () => {
    const { currentRenewal } = computeRenewalWindow({
      next_renewal_date: null,
      start_date: '2028-02-29', // 2028 is a leap year
    });

    // 2029 is not a leap year -- addYears clips to 28 Feb rather than rolling to 1 Mar.
    expect(ymd(currentRenewal)).toBe('2029-02-28');
  });

  it('does not repair an anomalous gap between next_renewal_date and start_date (garbage-in-garbage-out is a data problem, not a window-calc problem)', () => {
    // The real 2026-07-06 "farsta" incident shape: a 730-day gap instead of 365.
    const { currentRenewal, periodStart } = computeRenewalWindow({
      next_renewal_date: '2027-06-13',
      start_date: '2025-06-13',
    });

    expect(ymd(currentRenewal)).toBe('2027-06-13');
    // periodStart is always exactly one year before currentRenewal, regardless
    // of what start_date says -- this function trusts next_renewal_date as
    // the authoritative window end when it's set.
    expect(ymd(periodStart)).toBe('2026-06-13');
  });
});

describe('toUtcMidnightIso', () => {
  it('reproduces the calendar date as a UTC-midnight timestamp regardless of the value being local-midnight', () => {
    // parseISO('2026-06-13') is local midnight, not UTC midnight -- this is
    // exactly the shape computeRenewalWindow's Date objects have.
    const localMidnight = parseISO('2026-06-13');
    expect(toUtcMidnightIso(localMidnight)).toBe('2026-06-13T00:00:00.000Z');
  });

  it('matches the pre-extraction ClientTimeTab.tsx behavior (new Date(dateOnlyString).toISOString())', () => {
    // The original implementation parsed a date-only string with the native
    // Date constructor, which the spec defines as UTC midnight -- confirm
    // toUtcMidnightIso(computeRenewalWindow(...).currentRenewal) matches
    // that exactly, so the extraction doesn't silently shift the stored
    // window boundary by a day in a positive-UTC-offset timezone.
    const { currentRenewal } = computeRenewalWindow({ next_renewal_date: '2026-06-13', start_date: '2025-06-13' });
    const originalBehavior = new Date('2026-06-13').toISOString();
    expect(toUtcMidnightIso(currentRenewal)).toBe(originalBehavior);
  });
});
