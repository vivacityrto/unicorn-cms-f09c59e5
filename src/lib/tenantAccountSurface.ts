export type TenantAccountType = "rto" | "academy_solo";
export type VivacityAcademyTier = "solo" | "team" | "elite";

export const VIVACITY_ACADEMY_TIER_LABELS: Record<VivacityAcademyTier, string> = {
  solo: "Solo",
  team: "Team",
  elite: "Elite",
};

export const VIVACITY_ACADEMY_TIER_SEATS: Record<VivacityAcademyTier, number | null> = {
  solo: 1,
  team: 10,
  elite: null, // unlimited
};

export const VIVACITY_ACADEMY_TIER_PRICE: Record<VivacityAcademyTier, string> = {
  solo: "$45/month",
  team: "$295/month",
  elite: "$495/month",
};

function academySoloMeta(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const academySolo = (metadata as Record<string, unknown>).academy_solo;
  if (!academySolo || typeof academySolo !== "object" || Array.isArray(academySolo)) {
    return null;
  }
  return academySolo as Record<string, unknown>;
}

export function isAcademySoloTenant(metadata: unknown): boolean {
  return academySoloMeta(metadata) !== null;
}

/**
 * Returns the tenant's Vivacity Academy tier, or null if it isn't a
 * Vivacity Academy tenant at all. Every tenant tagged before the Solo/Team/
 * Elite tier model existed is backfilled server-side to tier='solo' (see
 * 20260925061256_vivacity_academy_tiers.sql), but this also falls back to
 * 'solo' defensively for any stale client cache read before that backfill.
 */
export function getAcademyTier(metadata: unknown): VivacityAcademyTier | null {
  const solo = academySoloMeta(metadata);
  if (!solo) return null;
  const tier = solo.tier;
  if (tier === "solo" || tier === "team" || tier === "elite") return tier;
  return "solo";
}

export function getTenantAccountType(metadata: unknown): TenantAccountType {
  return isAcademySoloTenant(metadata) ? "academy_solo" : "rto";
}
