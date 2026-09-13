export interface PortfolioBurnForecastRow {
  tenant_id: number;
  burn_risk_status: string | null;
}

export type PortfolioBurnSourceStatus = "reported" | "unavailable";

const BURN_STATUS_PRIORITY: Record<string, number> = {
  on_track: 0,
  normal: 0,
  warning: 1,
  accelerated: 1,
  critical: 2,
};

function isKnownBurnStatus(status: string | null): status is string {
  return status !== null && Object.hasOwn(BURN_STATUS_PRIORITY, status);
}

/**
 * Resolve the most severe readable burn status for one tenant without
 * exposing whether an inaccessible source row exists.
 */
export function resolvePortfolioBurnStatus(
  tenantId: number,
  sourceRows: PortfolioBurnForecastRow[],
  sourceStatus: PortfolioBurnSourceStatus,
): string {
  if (sourceStatus === "unavailable") return "unavailable";

  return sourceRows
    .filter((row) => row.tenant_id === tenantId && isKnownBurnStatus(row.burn_risk_status))
    .sort((a, b) =>
      (BURN_STATUS_PRIORITY[b.burn_risk_status ?? ""] ?? -1)
      - (BURN_STATUS_PRIORITY[a.burn_risk_status ?? ""] ?? -1)
    )[0]?.burn_risk_status ?? "unavailable";
}

export function applyPortfolioBurnAvailability<
  T extends { tenant_id: number; burn_risk_status: string | null },
>(
  rows: T[],
  sourceRows: PortfolioBurnForecastRow[],
  sourceStatus: PortfolioBurnSourceStatus,
): T[] {
  return rows.map((row) => ({
    ...row,
    burn_risk_status: resolvePortfolioBurnStatus(row.tenant_id, sourceRows, sourceStatus),
  }));
}
