/**
 * Format a bulk_document_jobs row's scope + filter arrays into a compact,
 * human-readable summary line for the jobs list.
 *
 * Examples:
 *   { scope: 'all', ... }                                  → "All clients"
 *   { scope: 'selected', tenant_ids: [1,2,3] }             → "3 clients"
 *   { scope: 'all', package_ids: [7,8], stage_ids: [4] }   → "All clients · 2 packages · 1 stage"
 *   { scope: 'selected', tenant_ids:[1], document_ids:[5]} → "1 client · 1 document"
 */
export function scopeSummary(job: {
  scope: string | null | undefined;
  tenant_ids?: number[] | null;
  package_ids?: number[] | null;
  stage_ids?: number[] | null;
  document_ids?: number[] | null;
}): string {
  const parts: string[] = [];
  const n = (a?: number[] | null) => (Array.isArray(a) ? a.length : 0);

  if (job.scope === "all") {
    parts.push("All clients");
  } else {
    const t = n(job.tenant_ids);
    parts.push(`${t} client${t === 1 ? "" : "s"}`);
  }

  const p = n(job.package_ids);
  if (p) parts.push(`${p} package${p === 1 ? "" : "s"}`);
  const s = n(job.stage_ids);
  if (s) parts.push(`${s} stage${s === 1 ? "" : "s"}`);
  const d = n(job.document_ids);
  if (d) parts.push(`${d} document${d === 1 ? "" : "s"}`);

  return parts.join(" · ");
}
