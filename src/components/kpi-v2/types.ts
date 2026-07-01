export type KpiV2Period = "weekly" | "monthly" | "quarterly";

export const KPI_V2_PERIOD_LABEL: Record<KpiV2Period, string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
};
