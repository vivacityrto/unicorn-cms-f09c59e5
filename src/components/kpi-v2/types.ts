import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  addWeeks,
  addMonths,
  addQuarters,
  format,
  getQuarter,
  getYear,
} from "date-fns";

export type KpiGranularity = "week" | "month" | "quarter";

export interface KpiV2Period {
  granularity: KpiGranularity;
  /** ISO date (yyyy-MM-dd) — any date within the period. */
  anchorDate: string;
}

const WEEK_OPTS = { weekStartsOn: 1 as const }; // Monday

function parseAnchor(anchorDate: string): Date {
  // Parse as local date to avoid TZ shifts on yyyy-MM-dd strings.
  const [y, m, d] = anchorDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function defaultPeriod(): KpiV2Period {
  return { granularity: "month", anchorDate: todayIso() };
}

function bounds(period: KpiV2Period): { start: Date; end: Date } {
  const anchor = parseAnchor(period.anchorDate);
  switch (period.granularity) {
    case "week":
      return { start: startOfWeek(anchor, WEEK_OPTS), end: endOfWeek(anchor, WEEK_OPTS) };
    case "month":
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "quarter":
      return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
  }
}

/**
 * Resolve a KPI period to an inclusive [start, end] ISO date range
 * (yyyy-MM-dd). `fetchers.tsRange()` extends `endIso` by a day to form
 * the half-open [p_start, p_end) window the RPCs expect.
 */
export function getPeriodRange(period: KpiV2Period): {
  startIso: string;
  endIso: string;
} {
  const { start, end } = bounds(period);
  return {
    startIso: format(start, "yyyy-MM-dd"),
    endIso: format(end, "yyyy-MM-dd"),
  };
}

export function getPeriodLabel(period: KpiV2Period): string {
  const { start, end } = bounds(period);
  switch (period.granularity) {
    case "week": {
      const sameMonth = start.getMonth() === end.getMonth();
      const sameYear = start.getFullYear() === end.getFullYear();
      const startFmt = sameMonth
        ? format(start, "d")
        : sameYear
          ? format(start, "d MMM")
          : format(start, "d MMM yyyy");
      return `Week of ${startFmt} – ${format(end, "d MMM yyyy")}`;
    }
    case "month":
      return format(start, "MMMM yyyy");
    case "quarter": {
      const q = getQuarter(start);
      const monthsRange = `${format(start, "MMM")}–${format(end, "MMM")}`;
      return `Q${q} ${getYear(start)} (${monthsRange})`;
    }
  }
}

/** Move the anchor by one unit of the selected granularity. */
export function stepPeriod(period: KpiV2Period, direction: 1 | -1): KpiV2Period {
  const anchor = parseAnchor(period.anchorDate);
  let next: Date;
  switch (period.granularity) {
    case "week":
      next = addWeeks(anchor, direction);
      break;
    case "month":
      next = addMonths(anchor, direction);
      break;
    case "quarter":
      next = addQuarters(anchor, direction);
      break;
  }
  return { granularity: period.granularity, anchorDate: format(next, "yyyy-MM-dd") };
}

/** True when stepping forward one unit would move the period start into the future. */
export function canStepForward(period: KpiV2Period): boolean {
  const nextStart = bounds(stepPeriod(period, 1)).start;
  return nextStart.getTime() <= Date.now();
}

/** True when the current period contains today. */
export function isCurrentPeriod(period: KpiV2Period): boolean {
  const { start, end } = bounds(period);
  const now = Date.now();
  return now >= start.getTime() && now <= end.getTime() + 24 * 60 * 60 * 1000 - 1;
}
