import { addYears, format, parseISO, subYears } from 'date-fns';

export interface RenewalWindow {
  /** End of the current/open renewal period (exclusive) -- the package's
   * next_renewal_date, or a computed fallback if that isn't set yet. */
  currentRenewal: Date;
  /** Start of the current/open renewal period -- exactly one year before
   * currentRenewal. */
  periodStart: Date;
  /** The date the package will renew to if renewed now -- exactly one year
   * after currentRenewal. */
  newRenewalDate: Date;
}

export interface RenewalWindowInput {
  next_renewal_date: string | null;
  start_date: string;
}

// Single source of truth for a package instance's current renewal-year
// window. Previously duplicated independently in RenewalConfirmDialog.tsx
// (date-fns) and ClientTimeTab.tsx's PackageBurndownCards (native
// Date/setFullYear) -- both computed the same concept from the same
// underlying package_instances fields, but disagreed on one edge case (see
// below). This is not a data-repair function: if next_renewal_date is
// already anomalous (e.g. the 2026-07-06 "farsta" incident, a 730-day gap
// from start_date instead of 365), this function trusts it as given and
// computes the window from it -- garbage-in-garbage-out is a data-quality
// problem, not something a pure date function should try to silently fix.
//
// Leap-day fallback (Carl decision, 2026-09-11): when next_renewal_date is
// not yet set, the window falls back to one year after start_date. For a
// start_date of exactly 29 February, date-fns's addYears clips to 28
// February in a non-leap target year -- this is the standardized behavior.
// (The other duplicate used native Date.setFullYear, which rolls to 1
// March instead; that was an unintentional artifact of not using a date
// library, not a deliberate alternative design, and no real package
// instance currently has a 29 Feb start_date or next_renewal_date --
// verified live, 2026-09-11, 0 of 1,052 rows.)
export function computeRenewalWindow({ next_renewal_date, start_date }: RenewalWindowInput): RenewalWindow {
  const currentRenewal = next_renewal_date
    ? parseISO(next_renewal_date)
    : addYears(parseISO(start_date), 1);
  const periodStart = subYears(currentRenewal, 1);
  const newRenewalDate = addYears(currentRenewal, 1);
  return { currentRenewal, periodStart, newRenewalDate };
}

// The Date objects returned above are local-midnight (parseISO's
// interpretation of a date-only string). Calling `.toISOString()` directly
// on one converts local midnight to UTC, which shifts the calendar date by
// a day in any positive-UTC-offset timezone (e.g. AEST/AEDT) -- a real
// regression found while extracting ClientTimeTab.tsx's original `new
// Date(dateString).toISOString()` usage (UTC-midnight parse), which this
// reproduces exactly regardless of the caller's local timezone. Use this
// whenever a renewal-window date needs to become a UTC-anchored ISO
// timestamp for storage or UTC-string comparison, rather than calling
// `.toISOString()` on the Date directly.
export function toUtcMidnightIso(date: Date): string {
  return `${format(date, 'yyyy-MM-dd')}T00:00:00.000Z`;
}
