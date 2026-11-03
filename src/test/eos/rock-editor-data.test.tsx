import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRockEditorData } from '@/hooks/useRockEditorData';

const db = vi.hoisted(() => ({
  milestoneCalls: 0,
  linkCalls: 0,
  milestones: [] as Array<() => unknown>,
  links: [] as Array<() => unknown>,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me' } }) }));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({ VIVACITY_TENANT_ID: 6372 }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const respond = (): Promise<{ data: unknown; error: null }> => {
        if (table === 'eos_rock_milestones') {
          db.milestoneCalls += 1;
          return new Promise(resolve => db.milestones.push(() => resolve({ data: [{ id: 'm1', title: 'Step', owner_id: null, due_date: null, priority: 'medium', status: 'not_started', exit_criteria: null, evidence_url: null }], error: null })));
        }
        if (table === 'eos_rock_milestone_links') {
          db.linkCalls += 1;
          return new Promise(resolve => db.links.push(() => resolve({ data: [{ company_milestone_id: 'c1', individual_milestone_id: 'm1' }], error: null })));
        }
        return Promise.resolve({ data: [], error: null });
      };
      const builder: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'in']) builder[name] = () => builder;
      builder.order = () => respond();
      builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
      builder.then = (resolve: (v: unknown) => unknown) => respond().then(resolve);
      return builder;
    },
  },
}));

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const settle = async (queue: Array<() => unknown>, count = 1) => {
  await waitFor(() => expect(queue.length).toBeGreaterThanOrEqual(count));
  await act(async () => { queue.splice(0).forEach(resolve => resolve()); });
};

beforeEach(() => {
  db.milestoneCalls = 0;
  db.linkCalls = 0;
  db.milestones = [];
  db.links = [];
});

describe('useRockEditorData: a saved Rock is only ready when everything has really loaded', () => {
  it('waits for the Company-milestone links of a saved Individual Rock even though the form is not filled in yet', async () => {
    // The form still holds its defaults (level company) while loading; the saved level decides what to wait for.
    const { result } = renderHook(
      () => useRockEditorData({ enabled: true, level: 'company', parentId: null, rockId: 'r1', savedLevel: 'individual' }),
      { wrapper: wrapper() },
    );
    await settle(db.milestones);
    await waitFor(() => expect(db.linkCalls).toBe(1));
    expect(result.current.editDataReady).toBe(false);

    await settle(db.links);
    await waitFor(() => expect(result.current.editDataReady).toBe(true));
    expect(result.current.savedLinks).toEqual([{ company_milestone_id: 'c1', individual_milestone_id: 'm1' }]);
  });

  it('does not wait for links a Company Rock cannot have', async () => {
    const { result } = renderHook(
      () => useRockEditorData({ enabled: true, level: 'company', parentId: null, rockId: 'r1', savedLevel: 'company' }),
      { wrapper: wrapper() },
    );
    await settle(db.milestones);
    await waitFor(() => expect(result.current.editDataReady).toBe(true));
    expect(db.linkCalls).toBe(0);
  });

  it('refetches on every opening instead of filling the form from a cached copy', async () => {
    const w = wrapper();
    const make = () => renderHook(
      () => useRockEditorData({ enabled: true, level: 'company', parentId: null, rockId: 'r1', savedLevel: 'company' }),
      { wrapper: w },
    );
    const first = make();
    await settle(db.milestones);
    await waitFor(() => expect(first.result.current.editDataReady).toBe(true));
    first.unmount();

    const second = make();
    await waitFor(() => expect(db.milestoneCalls).toBe(2));
    // The answer for the second opening has not arrived, so nothing from the first is offered as current.
    expect(second.result.current.editDataReady).toBe(false);
    await settle(db.milestones);
    await waitFor(() => expect(second.result.current.editDataReady).toBe(true));
  });
});

describe('useRockEditorData: a saved Team Rock’s milestones can have links too', () => {
  it('waits for the links of a saved Team Rock, which can support Company milestones', async () => {
    const { result } = renderHook(
      () => useRockEditorData({ enabled: true, level: 'company', parentId: null, rockId: 'r1', savedLevel: 'team' }),
      { wrapper: wrapper() },
    );
    await settle(db.milestones);
    await waitFor(() => expect(db.linkCalls).toBe(1));
    expect(result.current.editDataReady).toBe(false);
    await settle(db.links);
    await waitFor(() => expect(result.current.editDataReady).toBe(true));
  });
});
