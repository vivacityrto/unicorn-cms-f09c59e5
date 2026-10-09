import { describe, expect, it } from 'vitest';
import {
  buildParticipants,
  buildRegistryEvents,
  filterParticipants,
  participantCsvRows,
  participantStatusLabel,
  summariseParticipants,
  type RegistryAttendanceRow,
  type RegistryItemRow,
} from './registry';

const item = (over: Partial<RegistryItemRow & { graph_event_id: string }> = {}): RegistryItemRow & { graph_event_id: string } => ({
  graph_event_id: 'evt-1@t',
  tenant_id: 1,
  tenant_user_id: 10,
  tenant_contact_id: null,
  normalised_email: 'amy@example.com',
  first_name: 'Amy',
  last_name: 'Lee',
  result_status: 'registered',
  inclusion: 'group',
  processed_at: '2026-10-09T04:00:00.000Z',
  created_at: '2026-10-09T04:00:00.000Z',
  ...over,
});

const attendance = (over: Partial<RegistryAttendanceRow & { graph_event_id: string }> = {}): RegistryAttendanceRow & { graph_event_id: string } => ({
  graph_event_id: 'evt-1@t',
  normalised_email: 'amy@example.com',
  tenant_id: 1,
  tenant_user_id: 10,
  tenant_contact_id: null,
  first_name: 'Amy',
  last_name: 'Lee',
  attended: true,
  walk_in: false,
  updated_at: '2026-10-13T04:00:00.000Z',
  ...over,
});

describe('buildRegistryEvents', () => {
  const batches = [
    { graph_event_id: 'evt-1@t', event_display_name: 'Compliance Lab', event_start_datetime: '2026-10-13T03:00:00.000Z', created_at: '2026-10-09T04:00:00.000Z' },
    { graph_event_id: 'evt-1@t', event_display_name: 'Compliance Lab', event_start_datetime: '2026-10-13T03:00:00.000Z', created_at: '2026-10-08T01:00:00.000Z' },
    { graph_event_id: 'evt-0@t', event_display_name: 'Earlier', event_start_datetime: '2026-10-01T03:00:00.000Z', created_at: '2026-09-20T01:00:00.000Z' },
  ];

  it('one entry per event, soonest first, with the earliest registration date', () => {
    const events = buildRegistryEvents(batches, [], []);
    expect(events.map((e) => e.eventId)).toEqual(['evt-0@t', 'evt-1@t']);
    expect(events[1].firstRegisteredAt).toBe('2026-10-08T01:00:00.000Z');
  });

  it('counts each registered person once and only attended registered people', () => {
    const events = buildRegistryEvents(
      batches,
      [
        item(),
        item({ tenant_user_id: 11, normalised_email: 'ben@example.com' }),
        item({ tenant_user_id: 12, normalised_email: 'cat@example.com', result_status: 'cancelled' }),
        item({ normalised_email: 'amy@example.com' }), // duplicate row for the same person
      ],
      [
        attendance(),
        attendance({ normalised_email: 'ben@example.com', attended: false }),
        attendance({ normalised_email: 'walk@example.com', walk_in: true }), // walk-in is not a registered attendee
      ],
    );
    const lab = events.find((e) => e.eventId === 'evt-1@t')!;
    expect(lab.registered).toBe(2);
    expect(lab.attended).toBe(1);
  });
});

describe('buildParticipants', () => {
  it('lets a live registration win over an earlier cancelled one, in either order', () => {
    const live = item();
    const cancelled = item({ result_status: 'cancelled' });
    for (const items of [[cancelled, live], [live, cancelled]]) {
      const rows = buildParticipants(items, []);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('registered');
    }
  });

  it('adds walk-ins, greys cancelled people last, and carries attendance', () => {
    const rows = buildParticipants(
      [
        item({ tenant_user_id: 12, normalised_email: 'zed@example.com', first_name: 'Zed', result_status: 'cancelled' }),
        item({ tenant_user_id: 11, normalised_email: 'ben@example.com', first_name: 'Ben' }),
        item(),
      ],
      [
        attendance(),
        attendance({ normalised_email: 'walk@example.com', first_name: 'Wally', last_name: 'Walker', tenant_user_id: null, tenant_contact_id: 5, walk_in: true }),
      ],
    );
    expect(rows.map((r) => [r.name, r.status, r.attended])).toEqual([
      ['Amy Lee', 'registered', true],
      ['Ben Lee', 'registered', false],
      ['Wally Walker', 'walk_in', true],
      ['Zed Lee', 'cancelled', false],
    ]);
    expect(rows.find((r) => r.status === 'walk_in')!.memberKey).toBe('contact:5');
  });

  it('ignores rows with no email and non-live, non-cancelled statuses', () => {
    expect(
      buildParticipants(
        [item({ normalised_email: null }), item({ result_status: 'failed' }), item({ result_status: 'excluded' })],
        [],
      ),
    ).toEqual([]);
  });
});

describe('summariseParticipants', () => {
  const rows = buildParticipants(
    [
      item(),
      item({ tenant_user_id: 11, normalised_email: 'ben@example.com' }),
      item({ tenant_user_id: 12, normalised_email: 'cat@example.com', result_status: 'cancelled' }),
    ],
    [attendance(), attendance({ normalised_email: 'walk@example.com', tenant_user_id: null, tenant_contact_id: 5, walk_in: true })],
  );

  it('reports no-shows only once the event has started', () => {
    const before = summariseParticipants(rows, '2026-10-13T03:00:00.000Z', new Date('2026-10-12T00:00:00.000Z'));
    expect(before).toEqual({ registered: 2, attended: 1, noShow: null, walkIns: 1, cancelled: 1 });
    const after = summariseParticipants(rows, '2026-10-13T03:00:00.000Z', new Date('2026-10-14T00:00:00.000Z'));
    expect(after.noShow).toBe(1);
  });
});

describe('filterParticipants / labels / csv', () => {
  const rows = buildParticipants(
    [item(), item({ tenant_user_id: 11, normalised_email: 'ben@example.com', first_name: 'Ben', tenant_id: 2 })],
    [],
  );
  const tenants = new Map([[1, 'Acme Training'], [2, 'Bright RTO']]);

  it('finds people by name, email or client', () => {
    expect(filterParticipants(rows, 'ben', tenants)).toHaveLength(1);
    expect(filterParticipants(rows, 'EXAMPLE.COM', tenants)).toHaveLength(2);
    expect(filterParticipants(rows, 'acme', tenants).map((r) => r.name)).toEqual(['Amy Lee']);
    expect(filterParticipants(rows, '  ', tenants)).toHaveLength(2);
  });

  it('labels status, treating unticked registered people as no-shows only after the start', () => {
    const amy = rows[0];
    expect(participantStatusLabel(amy, false)).toBe('Registered');
    expect(participantStatusLabel(amy, true)).toBe('No-show');
    expect(participantStatusLabel({ ...amy, attended: true }, true)).toBe('Attended');
    expect(participantStatusLabel({ ...amy, status: 'cancelled' }, true)).toBe('Cancelled');
    expect(participantStatusLabel({ ...amy, status: 'walk_in', attended: true }, true)).toBe('Walk-in');
  });

  it('builds CSV rows in on-screen order', () => {
    const csv = participantCsvRows('Compliance Lab', rows, tenants, true, (iso) => `fmt(${iso})`);
    expect(csv[0]).toEqual({
      Event: 'Compliance Lab',
      Name: 'Amy Lee',
      Email: 'amy@example.com',
      Client: 'Acme Training',
      Status: 'No-show',
      Attended: 'No',
      'Registered in Unicorn': 'fmt(2026-10-09T04:00:00.000Z)',
    });
  });
});
