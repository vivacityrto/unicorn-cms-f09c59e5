export type TenantAccountType = "rto" | "academy_solo";

export function isAcademySoloTenant(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const academySolo = (metadata as Record<string, unknown>).academy_solo;
  return Boolean(academySolo && typeof academySolo === "object" && !Array.isArray(academySolo));
}

export function getTenantAccountType(metadata: unknown): TenantAccountType {
  return isAcademySoloTenant(metadata) ? "academy_solo" : "rto";
}
