/**
 * Regulatory stream tag for a package.
 * Mirrors the server-side public.fn_package_stream(package_id) helper so the
 * UI can pre-empt duplicate-package errors before the round-trip.
 */
export type PackageStream = "rto" | "cricos" | "gto" | "generic";

export const STREAM_LABELS: Record<PackageStream, string> = {
  rto: "RTO",
  cricos: "CRICOS",
  gto: "GTO",
  generic: "",
};

/**
 * Derive the regulatory stream from package name and slug, matching the
 * SQL helper's parsing rules.
 *
 * Detection order (matches DB):
 *   1. GTO token
 *   2. CRICOS / CRI token, or membership suffix tier+C (M-RC, M-DC, M-GC, M-SAC)
 *   3. RTO token, or membership suffix tier+R (M-RR, M-DR, M-GR, M-SAR)
 *   4. Otherwise generic
 */
export function getPackageStream(
  name: string | null | undefined,
  slug: string | null | undefined,
): PackageStream {
  const nm = (name || "").toUpperCase();
  if (!nm) return "generic";
  const sl = (slug || "").toUpperCase();
  const norm = `${nm} ${sl}`;

  if (/(^|[-_/ ])GTO([-_/ ]|$)/.test(norm)) return "gto";

  if (
    /(^|[-_/ ])CRICOS([-_/ ]|$)/.test(norm) ||
    /(^|[-_/ ])CRI([-_/ ]|$)/.test(norm) ||
    /^M-[A-Z]+C$/.test(nm)
  ) {
    return "cricos";
  }

  if (/(^|[-_/ ])RTO([-_/ ]|$)/.test(norm) || /^M-[A-Z]+R$/.test(nm)) {
    return "rto";
  }

  return "generic";
}

/**
 * Returns true when a new package would conflict with an existing active
 * package of the same package_type, per the duplicate-type guard rules.
 *
 * Conflict iff:
 *   - same package_type, AND
 *   - either side is 'generic' OR both share the same regulatory stream.
 */
export function streamsConflict(
  existing: PackageStream,
  next: PackageStream,
): boolean {
  return existing === "generic" || next === "generic" || existing === next;
}
