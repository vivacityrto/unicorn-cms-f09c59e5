/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { tenant_id: 6372 } }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

// Records which filter the hook applied to eos_todos.
const seen: { or?: string; eq?: [string, unknown] } = {};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.or = (filter: string) => {
        seen.or = filter;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        seen.eq = [col, val];
        return chain;
      };
      chain.order = async () => ({ data: [], error: null });
      return chain;
    },
  },
}));

import { useMeetingTodos } from '@/hooks/useMeetingTodos';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  seen.or = undefined;
  seen.eq = undefined;
});

describe('useMeetingTodos', () => {
  it("with a tenant, loads this meeting's to-dos plus every open one from earlier meetings", async () => {
    const { result } = renderHook(() => useMeetingTodos('m-1', 6372), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(seen.or).toBe('meeting_id.eq.m-1,and(status.eq.Open,tenant_id.eq.6372)');
    expect(seen.eq).toBeUndefined();
  });

  it("without a tenant, is just this meeting's to-dos", async () => {
    const { result } = renderHook(() => useMeetingTodos('m-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(seen.eq).toEqual(['meeting_id', 'm-1']);
    expect(seen.or).toBeUndefined();
  });
});
