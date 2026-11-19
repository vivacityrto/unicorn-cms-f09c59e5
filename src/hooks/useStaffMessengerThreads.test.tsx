import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, limits: [] as number[] }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let rows = [...(db.tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.order = () => b;
    b.neq = (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] !== v)), b);
    b.eq = (col: string, v: unknown) => {
      if (col.includes('.')) {
        // A filter on an embedded relation: keep rows with a related row that matches.
        const [rel, field] = col.split('.');
        rows = rows.filter((r) => ((r[rel] as Row[] | undefined) ?? []).some((x) => x[field] === v));
      } else rows = rows.filter((r) => r[col] === v);
      return b;
    };
    b.match = (o: Record<string, unknown>) => ((rows = rows.filter((r) => Object.entries(o).every(([k, v]) => r[k] === v))), b);
    b.is = (col: string, v: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === v)), b);
    b.in = (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), b);
    b.limit = (n: number) => {
      db.limits.push(n);
      rows = rows.slice(0, n);
      return b;
    };
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: () => Promise.resolve({ data: [{ tenant_id: 1, reason: 'primary_csc', covering_user_id: null, covering_name: null }], error: null }),
    },
  };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me' } }) }));

import { useStaffMessenger } from './useStaffMessenger';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const conv = (id: string, tenant_id: number, at: string): Row => ({ id, tenant_id, subject: id, topic: 'general', type: 'general', last_message_at: at, last_message_preview: 'p', created_at: at });

beforeEach(() => {
  db.limits = [];
  db.tables = {
    tenants: [{ id: 1, name: 'Acme', status: 'active' }, { id: 2, name: 'Zed', status: 'active' }, { id: 6372, name: 'Vivacity', status: 'active' }],
    tenant_conversations: [conv('new1', 1, '2026-11-19T01:00:00Z'), conv('old1', 2, '2026-01-01T01:00:00Z')],
    user_notifications: [
      { source_id: 'new1', created_at: '2026-11-18T00:00:00Z', user_id: 'me', type: 'message', is_read: false },
      { source_id: 'new1', created_at: '2026-11-16T00:00:00Z', user_id: 'me', type: 'message', is_read: false },
    ],
    conversation_participants: [],
    tenant_csc_assignments: [],
  };
});

describe('the staff messenger list', () => {
  it("opens a conversation that is not in the list (older, or another client's) when it is asked for by id, without putting it in the list", async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true, { extraThreadId: 'old1' }), { wrapper });
    await waitFor(() => expect(result.current.opened?.id).toBe('old1'));
    expect(result.current.opened?.unread).toBe(false);
    // The list is unchanged: only what the filters ask for.
    expect(result.current.threads.map((t) => t.id)).toEqual(['new1']);
  });

  it('does not fetch it separately when it is already in the list', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true, { extraThreadId: 'new1' }), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toEqual(['new1']));
    expect(result.current.opened).toBeNull();
  });

  it('measures waiting from the oldest unread message notification of each conversation', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true), { wrapper });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0]).toMatchObject({ id: 'new1', unread: true, unreadSince: '2026-11-16T00:00:00Z' });
  });

  it('lists every client in the picker, not only the ones with the newest conversations, and never the Vivacity organisation', async () => {
    const { result } = renderHook(() => useStaffMessenger(true, true), { wrapper });
    await waitFor(() => expect(result.current.tenants.map((t) => t.name)).toEqual(['Acme', 'Zed']));
  });

  it('on My clients, the picker lists only my clients', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true), { wrapper });
    await waitFor(() => expect(result.current.tenants.map((t) => t.name)).toEqual(['Acme']));
  });

  it('lists one client\'s conversations on their own when a client is chosen', async () => {
    const { result } = renderHook(() => useStaffMessenger(true, true, { tenantId: 2 }), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toEqual(['old1']));
  });

  it('says when the list stopped at the limit', async () => {
    db.tables.tenant_conversations = Array.from({ length: 300 }, (_, i) => conv(`c${i}`, 1, `2026-11-${String((i % 28) + 1).padStart(2, '0')}T01:00:00Z`));
    const { result } = renderHook(() => useStaffMessenger(false, true), { wrapper });
    await waitFor(() => expect(result.current.threads).toHaveLength(300));
    expect(result.current.limited).toBe(true);
  });
});

describe('conversations I take part in, with a client that is not mine', () => {
  const withParticipants = (c: Row, ...ids: string[]): Row => ({ ...c, conversation_participants: ids.map((user_id) => ({ user_id })) });

  beforeEach(() => {
    db.tables.tenant_conversations = [
      conv('mine-client', 1, '2026-11-18T01:00:00Z'),
      withParticipants(conv('i-started', 2, '2026-11-19T01:00:00Z'), 'me'),
      withParticipants(conv('not-mine', 2, '2026-11-17T01:00:00Z'), 'someone-else'),
    ];
  });

  it('stay on My clients, so a message I send to another client does not vanish from my own list', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true), { wrapper });
    await waitFor(() => expect(result.current.threads.length).toBeGreaterThan(0));
    expect(result.current.threads.map((t) => t.id)).toEqual(['i-started', 'mine-client']);
    expect([...result.current.participating]).toEqual(['i-started']);
  });

  it('leaves out other conversations with that client that I am not in', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true), { wrapper });
    await waitFor(() => expect(result.current.threads.length).toBeGreaterThan(0));
    expect(result.current.threads.map((t) => t.id)).not.toContain('not-mine');
  });

  it('are listed even when none of the clients are mine', async () => {
    db.tables.tenant_csc_assignments = [];
    const { result } = renderHook(() => useStaffMessenger(false, true), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toContain('i-started'));
  });

  it('are not added a second time on All clients', async () => {
    const { result } = renderHook(() => useStaffMessenger(true, true), { wrapper });
    await waitFor(() => expect(result.current.threads).toHaveLength(3));
    expect([...result.current.participating]).toEqual([]);
  });

  it('respect a chosen client', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true, { tenantId: 1 }), { wrapper });
    await waitFor(() => expect(result.current.threads.length).toBeGreaterThan(0));
    expect(result.current.threads.map((t) => t.id)).toEqual(['mine-client']);
  });
});

describe("a team member's conversations", () => {
  const withParticipants = (c: Row, ...ids: string[]): Row => ({ ...c, conversation_participants: ids.map((user_id) => ({ user_id })) });

  beforeEach(() => {
    db.tables.tenants = [{ id: 1, name: 'Acme', status: 'active' }, { id: 2, name: 'Zed', status: 'active' }, { id: 3, name: 'Beverly RTO', status: 'active' }];
    db.tables.tenant_conversations = [
      withParticipants(conv('mine', 1, '2026-11-19T01:00:00Z'), 'me'),
      withParticipants(conv('bev-in', 2, '2026-11-18T01:00:00Z'), 'bev', 'me'),
      withParticipants(conv('bev-client', 3, '2026-11-17T01:00:00Z'), 'someone-else'),
      withParticipants(conv('neither', 2, '2026-11-16T01:00:00Z'), 'someone-else'),
    ];
    db.tables.tenant_csc_assignments = [
      { tenant_id: 3, csc_user_id: 'bev', ended_at: null, superseded_at: null },
      { tenant_id: 1, csc_user_id: 'me', ended_at: null, superseded_at: null },
      { tenant_id: 2, csc_user_id: 'bev', ended_at: '2026-01-01T00:00:00Z', superseded_at: null },
    ];
  });

  it("is exactly their clients plus the conversations they are in, and nothing of anyone else's", async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true, { memberId: 'bev' }), { wrapper });
    await waitFor(() => expect(result.current.threads.length).toBeGreaterThan(0));
    expect(result.current.threads.map((t) => t.id).sort()).toEqual(['bev-client', 'bev-in']);
  });

  it('is not limited to my clients: it is about that person, whatever My clients says', async () => {
    const mine = renderHook(() => useStaffMessenger(false, true, { memberId: 'bev' }), { wrapper });
    const all = renderHook(() => useStaffMessenger(true, true, { memberId: 'bev' }), { wrapper });
    await waitFor(() => expect(mine.result.current.threads.length).toBe(2));
    await waitFor(() => expect(all.result.current.threads.length).toBe(2));
  });

  it("does not count a client they used to look after (their assignment ended)", async () => {
    const { result } = renderHook(() => useStaffMessenger(true, true, { memberId: 'bev' }), { wrapper });
    await waitFor(() => expect(result.current.threads.length).toBe(2));
    expect(result.current.threads.map((t) => t.id)).not.toContain('neither');
  });

  it('shows nothing, rather than everything, while their conversations load', () => {
    const { result } = renderHook(() => useStaffMessenger(true, true, { memberId: 'bev' }), { wrapper });
    expect(result.current.threads).toEqual([]);
  });

  it('can also be narrowed to one client', async () => {
    const { result } = renderHook(() => useStaffMessenger(true, true, { memberId: 'bev', tenantId: 3 }), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toEqual(['bev-client']));
  });

  it('leaves the ordinary list alone when no one is chosen', async () => {
    const { result } = renderHook(() => useStaffMessenger(true, true), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id).sort()).toEqual(['bev-client', 'bev-in', 'mine', 'neither']));
  });
});

describe('review fixes', () => {
  it('keeps the unread boundary and the oldest-waiting time of one of my conversations opened by link outside the list', async () => {
    // new1 is mine and unread; the list is narrowed to another client, so new1 is only reachable by its id.
    const { result } = renderHook(() => useStaffMessenger(false, true, { tenantId: 2, extraThreadId: 'new1' }), { wrapper });
    await waitFor(() => expect(result.current.opened?.id).toBe('new1'));
    expect(result.current.opened).toMatchObject({ unread: true, unreadSince: '2026-11-16T00:00:00Z' });
  });

  it('lists every client in the picker once a team member is chosen, not only mine', async () => {
    db.tables.tenants = [{ id: 1, name: 'Acme', status: 'active' }, { id: 2, name: 'Zed', status: 'active' }, { id: 3, name: 'Beverly RTO', status: 'active' }];
    const { result } = renderHook(() => useStaffMessenger(false, true, { memberId: 'bev' }), { wrapper });
    await waitFor(() => expect(result.current.tenants.map((t) => t.name)).toEqual(['Acme', 'Zed', 'Beverly RTO']));
  });

  it("applies the chosen client before the cap, so a team member's older conversations for that client are not cut off", async () => {
    const withParticipants = (c: Row, ...ids: string[]): Row => ({ ...c, conversation_participants: ids.map((user_id) => ({ user_id })) });
    db.tables.tenants = [{ id: 2, name: 'Zed', status: 'active' }, { id: 3, name: 'Beverly RTO', status: 'active' }];
    db.tables.tenant_csc_assignments = [];
    // 300 newer conversations of another client come first; the one we want is older.
    db.tables.tenant_conversations = [
      ...Array.from({ length: 300 }, (_, i) => withParticipants(conv(`n${i}`, 2, '2026-11-19T01:00:00Z'), 'bev')),
      withParticipants(conv('old-of-client-3', 3, '2026-01-01T01:00:00Z'), 'bev'),
    ];
    const { result } = renderHook(() => useStaffMessenger(true, true, { memberId: 'bev', tenantId: 3 }), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toEqual(['old-of-client-3']));
  });
});
