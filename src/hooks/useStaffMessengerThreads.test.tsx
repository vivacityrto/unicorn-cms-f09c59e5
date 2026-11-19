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
    b.eq = (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), b);
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
  };
});

describe('the staff messenger list', () => {
  it('opens a conversation that is not in the list (older, or another client\'s) when it is asked for by id', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true, { extraThreadId: 'old1' }), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toContain('old1'));
    // It is added to the list, not shown as unread, and the ordinary list is unchanged.
    expect(result.current.threads.find((t) => t.id === 'old1')?.unread).toBe(false);
    expect(result.current.threads.map((t) => t.id)).toContain('new1');
  });

  it('does not fetch it twice when it is already in the list', async () => {
    const { result } = renderHook(() => useStaffMessenger(false, true, { extraThreadId: 'new1' }), { wrapper });
    await waitFor(() => expect(result.current.threads.map((t) => t.id)).toEqual(['new1']));
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
