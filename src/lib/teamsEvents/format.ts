/**
 * Display helpers for the Teams event registration modal.
 *
 * Timestamps are stored and exchanged in UTC and only formatted here, always
 * as Australia/Sydney in en-AU, e.g. "20 October 2026 at 10:00 am".
 */
import type { ItemResultStatus } from '@/services/teamsEventsService';

const SYDNEY = 'Australia/Sydney';

const dateFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const zoneFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY,
  timeZoneName: 'short',
});

/** ICU versions differ on am/PM casing and use a narrow no-break space. */
function tidyTime(value: string): string {
  return value
    .split(String.fromCharCode(0x202f))
    .join(' ')
    .split(String.fromCharCode(0xa0))
    .join(' ')
    .replace(/\bAM\b/, 'am')
    .replace(/\bPM\b/, 'pm');
}

export function formatEventDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatEventTime(iso: string): string {
  return tidyTime(timeFormat.format(new Date(iso)));
}

export function formatEventDateTime(iso: string): string {
  return `${formatEventDate(iso)} at ${formatEventTime(iso)}`;
}

/** "AEDT" / "AEST" for the given instant. */
export function formatEventZone(iso: string): string {
  return zoneFormat.formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName')?.value ?? 'AEST';
}

export function webinarConfirmationMessage(count: number, eventName: string, startIso: string): string {
  const people = count === 1 ? 'person' : 'people';
  return `Register ${count} ${people} for “${eventName}” on ${formatEventDate(startIso)} at ${formatEventTime(startIso)}?`;
}

export function personName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || '(no name)';
}

const EXCLUSION_LABELS: Record<string, string> = {
  inactive: 'Inactive (disabled or archived)',
  missing_record: 'Record no longer exists',
  invalid_email: 'Missing or invalid email',
  missing_name: 'Missing first or last name',
  skipped_for_event: 'Skipped for this event',
};

export function exclusionReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  if (reason.startsWith('duplicate_of:')) return 'Same email as another member';
  return EXCLUSION_LABELS[reason] ?? reason;
}

const STATUS_LABELS: Record<ItemResultStatus, string> = {
  pending: 'Pending',
  registered: 'Registered',
  invited: 'Invited',
  already_processed: 'Already registered',
  excluded: 'Excluded',
  duplicate: 'Duplicate email',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function resultStatusLabel(status: ItemResultStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const BATCH_STATUS_LABELS: Record<string, string> = {
  previewed: 'Previewed',
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  completed_with_errors: 'Completed with errors',
  failed: 'Failed',
};

export function batchStatusLabel(status: string): string {
  return BATCH_STATUS_LABELS[status] ?? status;
}

/**
 * "12 registered · 2 pending" for an event card. null (Microsoft would not give
 * a count) reads as "Registrants not available"; undefined (an older server
 * that does not send the field) shows nothing at all.
 */
export function registrantsLabel(
  registrants: { registered: number; pending: number; capped: boolean } | null | undefined,
): string | null {
  if (registrants === undefined) return null;
  if (registrants === null) return 'Registrants not available';
  const plus = registrants.capped ? '+' : '';
  const parts = [`${registrants.registered}${plus} registered`];
  if (registrants.pending > 0) parts.push(`${registrants.pending} pending`);
  return parts.join(' · ');
}

export function notListedReasonLabel(item: { reason: string; status: string }): string {
  if (item.reason === 'starts_after_window') return 'Starts more than 14 days from now';
  if (item.reason === 'no_start_time') return 'No start time';
  return item.status === 'unknown' ? 'Not published' : `Not published (${item.status})`;
}

export function isBatchRunning(status: string | undefined): boolean {
  return status === 'processing' || status === 'queued';
}
