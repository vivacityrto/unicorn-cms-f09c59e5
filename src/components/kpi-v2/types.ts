import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  subMonths,
  subQuarters,
  format,
} from "date-fns";

export type KpiV2Period =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter";

export const KPI_V2_PERIOD_LABEL: Record<KpiV2Period, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  last_quarter: "Last Quarter",
};

export const KPI_V2_PERIOD_ORDER: KpiV2Period[] = [
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
];

/**
 * Resolve a KPI period key to an inclusive [start, end] ISO date range
 * (yyyy-MM-dd) usable with `.gte("period_start", …).lte("period_start", …)`.
 */
export function getPeriodRange(period: KpiV2Period): {
  startIso: string;
  endIso: string;
} {
  const now = new Date();
  let start: Date;
  let end: Date;
  switch (period) {
    case "this_month":
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case "last_month": {
      const prev = subMonths(now, 1);
      start = startOfMonth(prev);
      end = endOfMonth(prev);
      break;
    }
    case "this_quarter":
      start = startOfQuarter(now);
      end = endOfQuarter(now);
      break;
    case "last_quarter": {
      const prev = subQuarters(now, 1);
      start = startOfQuarter(prev);
      end = endOfQuarter(prev);
      break;
    }
  }
  return {
    startIso: format(start, "yyyy-MM-dd"),
    endIso: format(end, "yyyy-MM-dd"),
  };
}
