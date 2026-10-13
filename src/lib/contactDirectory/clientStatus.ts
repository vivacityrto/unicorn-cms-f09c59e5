/**
 * Client (tenant) status helpers for the Contact Directory.
 *
 * A person's own status (active/archived/disabled) says nothing about their
 * client. The directory defaults to people at ACTIVE clients only; every other
 * client status (cancelled, inactive, on hold, ...) is hidden until chosen.
 */

export const ACTIVE_CLIENT_STATUS = 'active';

export interface ClientStatusLabelSource {
  value: string;
  description: string;
}

/** "In Arears" / "on_hold" -> a readable label, preferring the configured description. */
export function clientStatusLabel(value: string | null | undefined, known: ClientStatusLabelSource[] = []): string {
  if (!value) return 'Unknown';
  const described = known.find((k) => k.value === value)?.description;
  if (described) return described;
  const spaced = value.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The client statuses actually present in the directory: Active first, then A-Z by label. */
export function clientStatusOptions(
  rows: Array<{ tenant_status: string | null }>,
  known: ClientStatusLabelSource[] = [],
): Array<{ value: string; label: string }> {
  const present = new Set<string>();
  for (const row of rows) if (row.tenant_status) present.add(row.tenant_status);
  present.add(ACTIVE_CLIENT_STATUS);
  return [...present]
    .map((value) => ({ value, label: clientStatusLabel(value, known) }))
    .sort((a, b) => {
      if (a.value === ACTIVE_CLIENT_STATUS) return -1;
      if (b.value === ACTIVE_CLIENT_STATUS) return 1;
      return a.label.localeCompare(b.label, 'en-AU', { sensitivity: 'base' });
    });
}

export function matchesClientStatus(rowStatus: string | null | undefined, filter: string): boolean {
  return filter === 'all' || rowStatus === filter;
}
