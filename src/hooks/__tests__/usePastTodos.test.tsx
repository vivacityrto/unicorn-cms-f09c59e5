/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const calls = vi.hoisted(() => ({ eq: [] as Array<[string, unknown]>, in: [] as Array<[string, unknown]>, limit: undefined as unknown }));
const rows = vi.hoisted(() => ({ todos: [] as unknown[], users: [] as unknown[] }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me' } }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const result = () => ({ data: table === 'users' ? rows.users : rows.todos, error: null });
      builder.select = () => builder;
      builder.eq = (c: string, v: unknown) => { calls.eq.push([c, v]); return builder; };
      builder.in = (c: string, v: unknown) => { if (table === 'eos_todos') calls.in.push([c, v]); return table === 'users' ? Promise.resolve(result()) : builder; };
      builder.order = () => builder;
      builder.limit = (n: unknown) => { calls.limit = n; return Promise.resolve(result()); };
      return builder;
    },
  },
}));

import { usePastTodos } from '@/hooks/useMeetingTodos';

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `T${id}`, status: 'Complete', due_date: null, owner_id: 'u1', completed_at: '2026-10-12T02:00:00Z', updated_at: '2026-10-13T02:00:00Z', meeting_id: 'old', issue: null, ...over,
});

describe('usePastTodos', () => {
  it('asks only for this tenant\'s completed and cancelled To-Dos, newest first, capped', async () => {
    rows.todos = [];
    const { result } = renderHook(() => usePastTodos('m1', 6372, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.eq).toContainEqual(['tenant_id', 6372]);
    expect(calls.in).toContainEqual(['status', ['Complete', 'Cancelled']]);
    expect(calls.limit).toBe(150);
  });

  it('leaves out this meeting\'s own To-Dos, names the owner, and dates it by completion', async () => {
    rows.todos = [row('1'), row('2', { meeting_id: 'm1' }), row('3', { status: 'Cancelled', completed_at: null, owner_id: null, issue: { title: 'An issue' } })];
    rows.users = [{ user_uuid: 'u1', first_name: 'Ana', last_name: 'Lee' }];
    const { result } = renderHook(() => usePastTodos('m1', 6372, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(t => t.id)).toEqual(['1', '3']);
    expect(result.current.data?.[0]).toMatchObject({ ownerName: 'Ana Lee', closedAt: '2026-10-12T02:00:00Z' });
    expect(result.current.data?.[1]).toMatchObject({ ownerName: null, closedAt: '2026-10-13T02:00:00Z', issueTitle: 'An issue' });
  });

  it('does not fetch until asked, or without a meeting and tenant', () => {
    const { result } = renderHook(() => usePastTodos('m1', 6372, false), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    const none = renderHook(() => usePastTodos(undefined, undefined, true), { wrapper });
    expect(none.result.current.fetchStatus).toBe('idle');
  });

  it('is refreshed by the same invalidation the To-Do mutations use, so a reopened To-Do leaves the list', async () => {
    rows.todos = [row('1')];
    rows.users = [];
    const client = new QueryClient();
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => usePastTodos('m1', 6372, true), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(t => t.id)).toEqual(['1']);

    // What updateTodo and createTodo do on success in useMeetingTodos:
    rows.todos = [];
    await client.invalidateQueries({ queryKey: ['meeting-todos', 'm1'] });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});

