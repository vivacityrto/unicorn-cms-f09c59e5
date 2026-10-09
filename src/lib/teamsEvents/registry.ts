/**
 * Pure shaping for the Events registry: who was registered for each Teams
 * webinar through Unicorn, and who has been marked as attending.
 *
 * Only events registered through Unicorn appear here. Nothing in this file
 * talks to the network, so it is fully unit-testable.
 */

export interface RegistryBatchRow {
  graph_event_id: string;
  event_display_name: string;
  event_start_datetime: string;
  created_at: string;
}

export interface RegistryItemRow {
  tenant_id: number;
  tenant_user_id: number | null;
  tenant_contact_id: number | null;
  normalised_email: string | null;
  first_name: string | null;
  last_name: string | null;
  result_status: string;
  inclusion?: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface RegistryAttendanceRow {
  normalised_email: string;
  tenant_id: number | null;
  tenant_user_id: number | null;
  tenant_contact_id: number | null;
  first_name: string | null;
  last_name: string | null;
  attended: boolean;
  walk_in: boolean;
  updated_at: string;
}

export interface RegistryEvent {
  eventId: string;
  name: string;
  startUtc: string;
  /** When the first registration batch for this event was run in Unicorn. */
  firstRegisteredAt: string;
  registered: number;
  attended: number;
}

export type ParticipantStatus = 'registered' | 'cancelled' | 'walk_in';

export interface RegistryParticipant {
  /** Normalised email: the stable key shared with the attendance table. */
  emailKey: string;
  /** Directory key (`user:12` / `contact:5`) used to record attendance. */
  memberKey: string;
  name: string;
  email: string;
  tenantId: number | null;
  status: ParticipantStatus;
  attended: boolean;
  /** When Unicorn registered them (null for walk-ins). */
  registeredAt: string | null;
  attendanceUpdatedAt: string | null;
}

export interface RegistrySummary {
  registered: number;
  attended: number;
  /** Registered people not marked as attended; null until the event has started. */
  noShow: number | null;
  walkIns: number;
  cancelled: number;
}

const LIVE = new Set(['registered', 'invited']);

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim() || '(no name)';
}

function keyOf(row: { tenant_user_id: number | null; tenant_contact_id: number | null }): string {
  return row.tenant_user_id != null ? `user:${row.tenant_user_id}` : `contact:${row.tenant_contact_id}`;
}

/** One entry per event, soonest event date first. Counts cover registered people only. */
export function buildRegistryEvents(
  batches: RegistryBatchRow[],
  items: Array<RegistryItemRow & { graph_event_id: string }>,
  attendance: Array<RegistryAttendanceRow & { graph_event_id: string }>,
): RegistryEvent[] {
  const events = new Map<string, RegistryEvent>();
  for (const batch of batches) {
    const existing = events.get(batch.graph_event_id);
    if (!existing) {
      events.set(batch.graph_event_id, {
        eventId: batch.graph_event_id,
        name: batch.event_display_name,
        startUtc: batch.event_start_datetime,
        firstRegisteredAt: batch.created_at,
        registered: 0,
        attended: 0,
      });
    } else if (batch.created_at < existing.firstRegisteredAt) {
      existing.firstRegisteredAt = batch.created_at;
    }
  }

  const liveByEvent = new Map<string, Set<string>>();
  for (const item of items) {
    if (!LIVE.has(item.result_status) || !item.normalised_email) continue;
    const set = liveByEvent.get(item.graph_event_id) ?? new Set<string>();
    set.add(item.normalised_email);
    liveByEvent.set(item.graph_event_id, set);
  }
  for (const [eventId, set] of liveByEvent) {
    const event = events.get(eventId);
    if (event) event.registered = set.size;
  }
  for (const row of attendance) {
    if (!row.attended) continue;
    const event = events.get(row.graph_event_id);
    const live = liveByEvent.get(row.graph_event_id);
    // Attended counts registered people only; walk-ins are reported separately.
    if (event && live?.has(row.normalised_email)) event.attended += 1;
  }

  return [...events.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

/**
 * Everyone connected to ONE event: registered people (live registration wins
 * over an earlier cancelled one), cancelled people, and walk-ins. People are
 * collapsed by normalised email.
 */
export function buildParticipants(items: RegistryItemRow[], attendance: RegistryAttendanceRow[]): RegistryParticipant[] {
  const attendanceByEmail = new Map(attendance.map((a) => [a.normalised_email, a]));
  const byEmail = new Map<string, RegistryParticipant>();

  for (const item of items) {
    const email = item.normalised_email;
    if (!email) continue;
    const live = LIVE.has(item.result_status);
    if (!live && item.result_status !== 'cancelled') continue;
    const existing = byEmail.get(email);
    if (existing && (existing.status === 'registered' || !live)) continue; // keep the live one
    const a = attendanceByEmail.get(email);
    byEmail.set(email, {
      emailKey: email,
      memberKey: keyOf(item),
      name: fullName(item.first_name, item.last_name),
      email,
      tenantId: item.tenant_id,
      status: live ? 'registered' : 'cancelled',
      attended: a?.attended === true,
      registeredAt: item.processed_at ?? item.created_at,
      attendanceUpdatedAt: a?.updated_at ?? null,
    });
  }

  for (const a of attendance) {
    if (byEmail.has(a.normalised_email)) continue;
    byEmail.set(a.normalised_email, {
      emailKey: a.normalised_email,
      memberKey: keyOf(a),
      name: fullName(a.first_name, a.last_name),
      email: a.normalised_email,
      tenantId: a.tenant_id,
      status: 'walk_in',
      attended: a.attended,
      registeredAt: null,
      attendanceUpdatedAt: a.updated_at,
    });
  }

  const order: Record<ParticipantStatus, number> = { registered: 0, walk_in: 1, cancelled: 2 };
  return [...byEmail.values()].sort(
    (x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name, 'en-AU', { sensitivity: 'base' }),
  );
}

export function summariseParticipants(participants: RegistryParticipant[], eventStartUtc: string, now: Date = new Date()): RegistrySummary {
  const registered = participants.filter((p) => p.status === 'registered');
  const attended = registered.filter((p) => p.attended).length;
  const started = new Date(eventStartUtc).getTime() <= now.getTime();
  return {
    registered: registered.length,
    attended,
    noShow: started ? registered.length - attended : null,
    walkIns: participants.filter((p) => p.status === 'walk_in' && p.attended).length,
    cancelled: participants.filter((p) => p.status === 'cancelled').length,
  };
}

export function filterParticipants(
  participants: RegistryParticipant[],
  query: string,
  tenantNames: Map<number, string> = new Map(),
): RegistryParticipant[] {
  const q = query.trim().toLowerCase();
  if (!q) return participants;
  return participants.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.email.includes(q) ||
      (p.tenantId != null && (tenantNames.get(p.tenantId) ?? '').toLowerCase().includes(q)),
  );
}

export function participantStatusLabel(p: RegistryParticipant, started: boolean): string {
  if (p.status === 'cancelled') return 'Cancelled';
  if (p.status === 'walk_in') return p.attended ? 'Walk-in' : 'Walk-in (not attended)';
  if (p.attended) return 'Attended';
  return started ? 'No-show' : 'Registered';
}

/** Rows for the CSV export, in the order shown on screen. */
export function participantCsvRows(
  eventName: string,
  participants: RegistryParticipant[],
  tenantNames: Map<number, string>,
  started: boolean,
  formatDateTime: (iso: string) => string,
): Record<string, unknown>[] {
  return participants.map((p) => ({
    Event: eventName,
    Name: p.name,
    Email: p.email,
    Client: p.tenantId != null ? (tenantNames.get(p.tenantId) ?? '') : '',
    Status: participantStatusLabel(p, started),
    Attended: p.attended ? 'Yes' : 'No',
    'Registered in Unicorn': p.registeredAt ? formatDateTime(p.registeredAt) : '',
  }));
}
