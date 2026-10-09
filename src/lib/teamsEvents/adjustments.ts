/**
 * Event-only changes for a Teams event registration: people added for THIS
 * event without joining the Contact Directory Group (extras), and Group members
 * left out of THIS event only (skips). The browser only ever sends their keys
 * (`user:12`, `contact:5`); the server re-resolves and re-checks every one.
 */
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';

/** An extra person, with just enough to display them without a directory lookup. */
export interface ExtraPerson {
  /** Directory key, e.g. `contact:42`. */
  key: string;
  name: string;
  email: string;
  clientName: string;
}

export interface EventAdjustments {
  extras: ExtraPerson[];
  /** Keys of Group members skipped for this event only. */
  skippedKeys: string[];
}

export const noAdjustments: EventAdjustments = { extras: [], skippedKeys: [] };

export function extraFromDirectory(person: DirectoryPerson): ExtraPerson {
  return {
    key: person.row_key,
    name: `${person.first_name} ${person.last_name ?? ''}`.trim(),
    email: person.email,
    clientName: person.tenant_name,
  };
}

export function addExtra(adjustments: EventAdjustments, extra: ExtraPerson): EventAdjustments {
  if (adjustments.extras.some((e) => e.key === extra.key)) return adjustments;
  return { ...adjustments, extras: [...adjustments.extras, extra] };
}

export function removeExtra(adjustments: EventAdjustments, key: string): EventAdjustments {
  return { ...adjustments, extras: adjustments.extras.filter((e) => e.key !== key) };
}

export function skipMember(adjustments: EventAdjustments, key: string): EventAdjustments {
  if (adjustments.skippedKeys.includes(key)) return adjustments;
  return { ...adjustments, skippedKeys: [...adjustments.skippedKeys, key] };
}

export function unskipMember(adjustments: EventAdjustments, key: string): EventAdjustments {
  return { ...adjustments, skippedKeys: adjustments.skippedKeys.filter((k) => k !== key) };
}

/** The request body fields the Edge Functions expect. */
export function toRequestKeys(adjustments: EventAdjustments): { extraKeys: string[]; skippedKeys: string[] } {
  return { extraKeys: adjustments.extras.map((e) => e.key), skippedKeys: [...adjustments.skippedKeys] };
}

/** "2 added for this event · 1 skipped for this event", or null when there are none. */
export function adjustmentsSummary(counts: { extras?: number; skipped?: number } | undefined): string | null {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.extras) parts.push(`${counts.extras} added for this event`);
  if (counts.skipped) parts.push(`${counts.skipped} skipped for this event`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
