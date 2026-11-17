/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const insertRow = { id: 'e1', metric_id: 'm1', week_ending: '2026-11-16', value: 3 };
const query = {
  select: () => query,
  eq: () => query,
  order: () => query,
  limit: () => Promise.resolve({ data: [], error: null }),
  insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: insertRow, error: null }) }) }),
  update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: insertRow, error: null }) }) }) }),
};
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => query } }));
vi.mock('./useAuth', () => ({
  useAuth: () => ({ profile: { user_uuid: 'u1', tenant_id: 1, unicorn_role: 'Super Admin' }, isSuperAdmin: () => true }),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { useEosScorecardEntries } from './useEosScorecardEntries';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useEosScorecardEntries('m1'), { wrapper });
  return { result, spy };
}

const keys = (spy: ReturnType<typeof setup>['spy']) => spy.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey[0]);

describe('useEosScorecardEntries', () => {
  it('refreshes the metric status after a new entry, so the Scorecard page and L10 review do not go stale', async () => {
    const { result, spy } = setup();
    await act(async () => {
      await result.current.createEntry.mutateAsync({ metric_id: 'm1', week_ending: '2026-11-16', value: 3, tenant_id: 1 });
    });
    expect(keys(spy)).toContain('eos-scorecard-entries');
    expect(keys(spy)).toContain('scorecard-metrics-v2');
  });

  it('refreshes the metric status after an edited entry', async () => {
    const { result, spy } = setup();
    await act(async () => {
      await result.current.updateEntry.mutateAsync({ id: 'e1', value: 4 });
    });
    expect(keys(spy)).toContain('scorecard-metrics-v2');
  });
});
