/**
 * Formats decimal hours as `H:MM` (e.g. 36.5 -> "36:30").
 * Negative inputs clamp to 0. Shared between PackageStatTiles and CollapsedPackageRow.
 */
export function formatHours(decimalHours: number): string {
  const total = Math.max(0, decimalHours);
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/**
 * Convert a snake_case work_type or work_sub_type enum into a Title Case display string.
 * Internal values like 'compliance_health_check' or 'governance_meeting_mt' surface to
 * clients as 'Compliance Health Check' / 'Governance Meeting Mt'.
 *
 * Returns empty string for null/undefined/empty input — callers conditionally render
 * based on truthiness so '' safely produces no output.
 */
export function formatWorkType(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Sanitise a time_entries.notes string for client display.
 *
 * Hides notes that are purely internal source-tracking metadata. Entries auto-imported
 * from EOS L10 meetings carry an "Imported from meeting: …" prefix that describes
 * how the entry was created, not what work was delivered. These should not surface
 * to clients — the work_type ('meeting') and duration already convey the substance.
 *
 * Returns null for hidden notes — callers omit the note line entirely when null.
 */
export function cleanWorkNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (/^Imported from meeting:/i.test(trimmed)) return null;
  return trimmed;
}
