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
