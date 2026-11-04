import { addYears, differenceInCalendarDays, isSameDay, parseISO, startOfDay } from 'date-fns';

// Pure rules for the SuperAdmin "edit anniversary date" widget. The server
// function set_package_anniversary_date() re-enforces every hard rule here
// (this file only drives the preview and disables Save early) -- never treat
// a client-side pass as authorization.
//
// Why the preview matters: package_instances.next_renewal_date is the END of
// the package's hours window. Usage, burndown, the client portal and the
// usage alerts all count time entries from the period start up to that date,
// so moving it changes the hours-used figure and the renewal-due state, not
// just a label.

/** Hard bound, mirrored in the SQL function: at most this many years after the period start. */
export const MAX_PERIOD_YEARS = 3;
/** Minimum characters for the audit reason, mirrored in the SQL function. */
export const MIN_REASON_LENGTH = 5;

export interface AnniversaryAssessmentInput {
  /** Start of the CURRENT period: start_renewal_date, falling back to start_date. */
  periodStart: Date;
  /** The stored anniversary (next_renewal_date). */
  currentAnniversary: Date;
  /** The date being proposed, or undefined while nothing is picked. */
  proposed: Date | undefined;
  today?: Date;
}

export type AnniversaryWarningCode = 'non_standard_length' | 'renewal_due_now';

export interface AnniversaryWarning {
  code: AnniversaryWarningCode;
  message: string;
}

export interface AnniversaryAssessment {
  /** Whether the proposed date may be saved. */
  valid: boolean;
  /** Why it can't be saved, when valid is false and a date was picked. */
  error: string | null;
  unchanged: boolean;
  /** Length of the period if the proposed date is applied. */
  periodDays: number | null;
  warnings: AnniversaryWarning[];
}

/** The standard anniversary for a period: exactly one year after it starts. */
export function defaultAnniversary(periodStart: Date): Date {
  return addYears(periodStart, 1);
}

/** True when the period is not a standard 365/366-day year (a "Custom" anniversary). */
export function isCustomPeriod(periodStart: Date, anniversary: Date): boolean {
  const days = differenceInCalendarDays(anniversary, periodStart);
  return days !== 365 && days !== 366;
}

export function parseDateOnly(value: string): Date {
  return parseISO(value);
}

export function assessAnniversaryChange({
  periodStart,
  currentAnniversary,
  proposed,
  today = new Date(),
}: AnniversaryAssessmentInput): AnniversaryAssessment {
  if (!proposed) {
    return { valid: false, error: null, unchanged: false, periodDays: null, warnings: [] };
  }

  const start = startOfDay(periodStart);
  const next = startOfDay(proposed);
  const periodDays = differenceInCalendarDays(next, start);
  const unchanged = isSameDay(next, currentAnniversary);

  if (periodDays <= 0) {
    return {
      valid: false,
      error: 'The anniversary must be after the period start.',
      unchanged,
      periodDays,
      warnings: [],
    };
  }

  const latest = addYears(start, MAX_PERIOD_YEARS);
  if (next > latest) {
    return {
      valid: false,
      error: `The anniversary can be at most ${MAX_PERIOD_YEARS} years after the period start.`,
      unchanged,
      periodDays,
      warnings: [],
    };
  }

  const warnings: AnniversaryWarning[] = [];
  if (isCustomPeriod(start, next)) {
    warnings.push({
      code: 'non_standard_length',
      message: `This period will run ${periodDays} days instead of a standard year. The included hours are not pro-rated, so usage is counted across the whole window.`,
    });
  }
  if (next <= startOfDay(today)) {
    warnings.push({
      code: 'renewal_due_now',
      message: 'This date is today or in the past, so the package will show as due for renewal immediately.',
    });
  }

  return { valid: !unchanged, error: null, unchanged, periodDays, warnings };
}
