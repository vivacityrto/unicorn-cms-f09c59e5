import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ writes: [] as string[], rpc: [] as string[], user: 'staff-a' }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'order', 'limit', 'select']) b[m] = () => b;
    b.update = () => {
      calls.writes.push(`update:${table}`);
      return b;
    };
    b.insert = () => {
      calls.writes.push(`insert:${table}`);
      return b;
    };
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: [{ user_id: 'x' }], error: null }).then(resolve, reject);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string) => {
        calls.rpc.push(`${name}:${calls.user}`);
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: calls.user } }) }));
vi.mock('@/hooks/useClientCommunications', () => ({
  useConversationMessagesQuery: () => ({ data: [{ id: 'm1', conversation_id: 'c1', sender_id: 'client1', body: 'hi', created_at: '2026-11-19T01:00:00Z', sender_name: 'A', sender_avatar_url: null, attachments: [] }], isLoading: false }),
}));
vi.mock('@/hooks/useConversationParticipants', () => ({ useConversationParticipants: () => ({ data: [] }) }));
vi.mock('@/components/messaging/MessageAttachments', () => ({ MessageAttachments: () => null }));

import { useStaffConversationPane } from './useStaffConversationPane';
import { useStaffMessageScope } from './useStaffMessenger';

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  calls.writes = [];
  calls.rpc = [];
  calls.user = 'staff-a';
});

describe('the staff read position', () => {
  it('is recorded when a conversation that is mine is open, even if no bell notification is unread', async () => {
    renderHook(() => useStaffConversationPane('c1', { tenantId: 1, mine: true }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(calls.writes).toContain('update:conversation_participants'));
    expect(calls.writes).toContain('update:user_notifications');
  });

  it('refreshes a conversation opened by link too, so its preview, time and unread state follow what just happened', async () => {
    const qc = newClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useStaffConversationPane('c1', { tenantId: 1, mine: true }), { wrapper: wrapper(qc) });
    await waitFor(() => expect(calls.writes).toContain('update:user_notifications'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['staff-messenger', 'thread'] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['staff-messenger', 'threads'] });
  });

  it('is recorded once per newest message, however many places ask', async () => {
    const { result } = renderHook(() => useStaffConversationPane('c1', { tenantId: 1, mine: true }), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(calls.writes).toContain('update:conversation_participants'));
    const before = calls.writes.filter((w) => w === 'update:conversation_participants').length;
    result.current.onMarkRead?.();
    result.current.onMarkRead?.();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.writes.filter((w) => w === 'update:conversation_participants').length).toBe(before);
  });

  it('leaves no trace on a client that is not mine', async () => {
    renderHook(() => useStaffConversationPane('c1', { tenantId: 2, mine: false }), { wrapper: wrapper(newClient()) });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.writes).toEqual([]);
  });
});

describe('the staff scope cache', () => {
  it('belongs to one person: another person signing in on the same browser never reuses it', async () => {
    const qc = newClient();
    const { rerender } = renderHook(({ me }: { me: string }) => useStaffMessageScope(me, true), { initialProps: { me: 'staff-a' }, wrapper: wrapper(qc) });
    await waitFor(() => expect(calls.rpc).toContain('get_my_message_scope:staff-a'));
    calls.user = 'staff-b';
    rerender({ me: 'staff-b' });
    await waitFor(() => expect(calls.rpc).toContain('get_my_message_scope:staff-b'));
    const keys = qc.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(keys).toContain('["staff-messenger","scope","staff-a"]');
    expect(keys).toContain('["staff-messenger","scope","staff-b"]');
  });

  it('does not run without a signed-in person', async () => {
    renderHook(() => useStaffMessageScope(null, true), { wrapper: wrapper(newClient()) });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.rpc).toEqual([]);
  });
});
