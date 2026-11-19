import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'primary_contact' as string | null }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: state.role ? { relationship_role: state.role } : null, error: null });
    return b;
  };
  return { supabase: { from: () => builder() } };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'u1', tenant_id: 1 } }) }));
vi.mock('@/contexts/ClientPreviewContext', () => ({ useClientPreview: () => ({ isPreviewMode: false, actingUserId: null, actingUserOptions: [] }) }));

import { HelpCenterProvider, useHelpCenter } from './HelpCenterContext';
import { useMessengerDock } from '@/components/messenger';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <HelpCenterProvider>{children}</HelpCenterProvider>
  </QueryClientProvider>
);

const both = () => ({ help: useHelpCenter(), dock: useMessengerDock() });

describe('the retired Help Center, now a thin layer over the messenger bubble', () => {
  it('opens the bubble on Ask Viv, your consultant or support, depending on the button', async () => {
    const { result } = renderHook(both, { wrapper });
    await vi.waitFor(() => expect(result.current.help.canAccess).toBe(true));

    act(() => result.current.help.openHelpCenter());
    expect(result.current.dock).toMatchObject({ open: true, selectedId: 'ask_viv' });
    expect(result.current.help.activeTab).toBe('chatbot');

    act(() => result.current.help.openHelpCenter('csc'));
    expect(result.current.dock.selectedId).toBe('alias:csc');
    expect(result.current.help.activeTab).toBe('csc');

    act(() => result.current.help.openHelpCenter('support'));
    expect(result.current.dock.selectedId).toBe('alias:support');
    expect(result.current.help.activeTab).toBe('support');
    expect(result.current.help.isOpen).toBe(true);

    act(() => result.current.help.closeHelpCenter());
    expect(result.current.dock.open).toBe(false);
  });

  it('keeps the old rule: people with no relationship to the organisation get nothing', async () => {
    state.role = null;
    const { result } = renderHook(both, { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.help.canAccess).toBe(false);
    act(() => result.current.help.openHelpCenter('support'));
    expect(result.current.dock.open).toBe(false);
    state.role = 'primary_contact';
  });
});
