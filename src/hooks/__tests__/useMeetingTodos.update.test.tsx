/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { tenant_id: 6372 } }) }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ toast }));
const sent = vi.hoisted(() => ({ update: undefined as unknown, id: undefined as unknown }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.or = () => chain;
      chain.order = async () => ({ data: [], error: null });
      chain.update = (payload: unknown) => { sent.update = payload; return chain; };
      chain.eq = (_c: string, v: unknown) => { sent.id = v; return chain; };
      chain.single = async () => ({ data: { id: 't1' }, error: null });
      return chain;
    },
  },
}));

import { useMeetingTodos } from '@/hooks/useMeetingTodos';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { toast.mockClear(); sent.update = undefined; });

describe('useMeetingTodos: updateTodo', () => {
  it('says "To-do updated successfully" for an ordinary update', async () => {
    const { result } = renderHook(() => useMeetingTodos('m1', 6372), { wrapper });
    await act(async () => { await result.current.updateTodo.mutateAsync({ id: 't1', due_date: '2026-11-05' }); });
    expect(toast).toHaveBeenCalledWith({ title: 'To-do updated successfully' });
  });

  it('a quiet update skips that toast so the caller can show its own, and never sends "quiet" to the database', async () => {
    const { result } = renderHook(() => useMeetingTodos('m1', 6372), { wrapper });
    await act(async () => { await result.current.updateTodo.mutateAsync({ id: 't1', status: 'Complete', quiet: true }); });
    expect(toast).not.toHaveBeenCalled();
    expect(sent.update).toEqual({ status: 'Complete' });
    expect(sent.id).toBe('t1');
  });
});
