// Pure rules for the SuperAdmin "adjust hours" action on a package card. The
// server function adjust_package_allowance() re-enforces every hard rule here
// (this file only drives the preview and disables Save early) -- never treat a
// client-side pass as authorization.
//
// The adjustment is a signed number of hours added to the package's allowance
// (package_instances.included_minutes). It is deliberately a delta, not a new
// total, so it reads as "added 161 hours" and a stale screen cannot overwrite a
// change made by someone else in the meantime.

/** Mirrored in the SQL function. */
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;
/** Largest single adjustment, in hours (either direction). */
export const MAX_ADJUSTMENT_HOURS = 1000;
/** Largest resulting allowance, in hours. */
export const MAX_ALLOWANCE_HOURS = 2000;
/** A consult day, used only for the "= N days" helper text. */
export const HOURS_PER_DAY = 7;
/** Tag on the pinned note the server function maintains. */
export const ALLOWANCE_NOTE_TAG = 'allowance-adjustment';

export type AllowanceWarningCode = 'below_used';

export interface AllowanceWarning {
  code: AllowanceWarningCode;
  message: string;
}

export interface AllowanceAssessmentInput {
  /** Total hours shown on the card today (base allowance + added + carried over). */
  currentHours: number;
  /** Hours already used. */
  usedHours: number;
  /** What was typed in the hours box. */
  deltaInput: string;
}

export interface AllowanceAssessment {
  valid: boolean;
  /** Why it can't be saved; null while nothing has been typed. */
  error: string | null;
  /** The adjustment in hours, rounded to whole minutes, when it parsed. */
  deltaHours: number | null;
  /** The card total after the adjustment. */
  newTotalHours: number | null;
  /** "= 23 days of 7 h" when the adjustment is a whole number of days. */
  daysLabel: string | null;
  warnings: AllowanceWarning[];
}

/** Parses the hours box. Returns null for empty or non-numeric input. */
export function parseHoursInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return null;
  if (!/^[+-]?\d*\.?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const fmtHours = (h: number) => `${Math.round(h * 100) / 100}`;

export function assessAllowanceAdjustment({
  currentHours,
  usedHours,
  deltaInput,
}: AllowanceAssessmentInput): AllowanceAssessment {
  const empty: AllowanceAssessment = {
    valid: false,
    error: null,
    deltaHours: null,
    newTotalHours: null,
    daysLabel: null,
    warnings: [],
  };

  if (deltaInput.trim() === '') return empty;

  const parsed = parseHoursInput(deltaInput);
  if (parsed === null) {
    return { ...empty, error: 'Enter a number of hours, for example 161 or -7.' };
  }

  // The server works in whole minutes.
  const deltaMinutes = Math.round(parsed * 60);
  const deltaHours = deltaMinutes / 60;

  if (deltaMinutes === 0) {
    return { ...empty, error: 'Enter a non-zero number of hours.' };
  }

  if (Math.abs(deltaHours) > MAX_ADJUSTMENT_HOURS) {
    return {
      ...empty,
      deltaHours,
      error: `A single adjustment can be at most ${MAX_ADJUSTMENT_HOURS} hours.`,
    };
  }

  const newTotalHours = currentHours + deltaHours;

  if (newTotalHours <= 0) {
    return {
      ...empty,
      deltaHours,
      newTotalHours,
      error: 'This would leave the allowance at zero or below.',
    };
  }

  if (newTotalHours > MAX_ALLOWANCE_HOURS) {
    return {
      ...empty,
      deltaHours,
      newTotalHours,
      error: `The allowance can be at most ${MAX_ALLOWANCE_HOURS} hours.`,
    };
  }

  const warnings: AllowanceWarning[] = [];
  if (newTotalHours < usedHours) {
    warnings.push({
      code: 'below_used',
      message: `The new allowance (${fmtHours(newTotalHours)} h) is lower than the hours already used (${fmtHours(usedHours)} h), so the package will show as over its hours.`,
    });
  }

  const wholeDays = deltaHours / HOURS_PER_DAY;
  const daysLabel =
    Math.abs(deltaHours) >= HOURS_PER_DAY && Number.isInteger(wholeDays)
      ? `= ${wholeDays} day${Math.abs(wholeDays) === 1 ? '' : 's'} of ${HOURS_PER_DAY} h`
      : null;

  return { valid: true, error: null, deltaHours, newTotalHours, daysLabel, warnings };
}
