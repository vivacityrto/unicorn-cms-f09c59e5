export type KpiStatus = "on" | "risk" | "below" | "none";

/**
 * Generic percentage → status thresholds.
 * `on` when pct >= onThreshold, `risk` when pct >= riskThreshold, else `below`.
 */
export function pctStatus(
  pct: number | null,
  onThreshold: number,
  riskThreshold: number,
): KpiStatus {
  if (pct == null) return "none";
  if (pct >= onThreshold) return "on";
  if (pct >= riskThreshold) return "risk";
  return "below";
}

/**
 * Retention status uses special banding:
 *  - 100%  → On target
 *  - ≥90%  → At risk
 *  - <90%  → Below target
 */
export function retentionStatus(pct: number | null): KpiStatus {
  if (pct == null) return "none";
  if (pct >= 100) return "on";
  if (pct >= 90) return "risk";
  return "below";
}
