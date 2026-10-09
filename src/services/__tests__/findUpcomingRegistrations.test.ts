import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  let result: { data: unknown; error: unknown } = { data: [], error: null };
  const builder: Record<string, unknown> = {
    select: (...a: unknown[]) => (calls.push({ op: 'select', args: a }), builder),
    eq: (...a: unknown[]) => (calls.push({ op: 'eq', args: a }), builder),
    in: (...a: unknown[]) => (calls.push({ op: 'in', args: a }), Promise.resolve(result)),
  };
  return {
    calls,
    setResult: (r: { data: unknown; error: unknown }) => (result = r),
    from: (table: string) => (calls.push({ op: 'from', args: [table] }), builder),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: db.from, functions: { invoke: vi.fn() } } }));

import { findUpcomingRegistrations } from '../teamsEventsService';

const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
const later = new Date(Date.now() + 9 * 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

describe('findUpcomingRegistrations', () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.setResult({ data: [], error: null });
  });

  it('looks the person up by their own column, only for live registrations', async () => {
    await findUpcomingRegistrations('contact:5');
    expect(db.calls.find((c) => c.op === 'from')!.args).toEqual(['teams_event_registration_items']);
    expect(db.calls.find((c) => c.op === 'eq')!.args).toEqual(['tenant_contact_id', 5]);
    expect(db.calls.find((c) => c.op === 'in')!.args).toEqual(['result_status', ['registered', 'invited']]);
    db.calls.length = 0;
    await findUpcomingRegistrations('user:9');
    expect(db.calls.find((c) => c.op === 'eq')!.args).toEqual(['tenant_user_id', 9]);
  });

  it('returns upcoming events only, one per event, soonest first', async () => {
    db.setResult({
      error: null,
      data: [
        { graph_event_id: 'later@t', teams_event_registration_batches: { event_display_name: 'Later', event_start_datetime: later } },
        { graph_event_id: 'soon@t', teams_event_registration_batches: { event_display_name: 'Soon', event_start_datetime: future } },
        { graph_event_id: 'soon@t', teams_event_registration_batches: { event_display_name: 'Soon', event_start_datetime: future } },
        { graph_event_id: 'past@t', teams_event_registration_batches: { event_display_name: 'Past', event_start_datetime: past } },
        { graph_event_id: 'orphan@t', teams_event_registration_batches: null },
      ],
    });
    const result = await findUpcomingRegistrations('user:1');
    expect(result.map((r) => r.eventId)).toEqual(['soon@t', 'later@t']);
    expect(result[0]).toEqual({ eventId: 'soon@t', eventName: 'Soon', startUtc: future });
  });

  it('returns nothing for a malformed key or a failed lookup, without throwing', async () => {
    for (const bad of ['', 'nope', 'user:', 'user:0', 'team:1']) {
      expect(await findUpcomingRegistrations(bad)).toEqual([]);
    }
    expect(db.calls).toHaveLength(0);
    db.setResult({ data: null, error: { message: 'rls' } });
    expect(await findUpcomingRegistrations('user:1')).toEqual([]);
  });
});
