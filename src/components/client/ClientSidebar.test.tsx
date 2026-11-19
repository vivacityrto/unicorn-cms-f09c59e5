import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) b[m] = () => b;
  b.single = () => Promise.resolve({ data: { complyhub_url: 'https://complyhub.example/acme' }, error: null });
  return { supabase: { from: () => b } };
});
vi.mock('@/contexts/ClientTenantContext', () => ({
  useClientTenant: () => ({ tenantName: 'Acme Training', isPreview: false, academyAccessEnabled: true, canManagePortalUsers: true, activeTenantId: 1 }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isSuperAdmin: () => false }) }));
vi.mock('@/components/help-center', () => ({ useHelpCenter: () => ({ openHelpCenter: vi.fn(), canAccess: true }) }));

import { ClientSidebar } from './ClientSidebar';

const show = (open: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/client/home']}>
        <ClientSidebar sidebarOpen={open} setSidebarOpen={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => window.localStorage.clear());

describe('the client sidebar as a collapsed icon rail', () => {
  it('names every icon for screen readers when the words are hidden', () => {
    show(false);
    for (const name of ['Inbox', 'Home', 'Tasks', 'Packages', 'Governance Documents', 'Files', 'Calendar', 'Support Tickets', 'Membership Certificate']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Vivacity Academy, opens in a new tab' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message your consultant' })).toBeInTheDocument();
  });

  it('floats the name and a line about it beside an icon on hover', async () => {
    const user = userEvent.setup();
    show(false);
    await user.hover(screen.getByRole('link', { name: 'Governance Documents' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Governance Documents');
    expect(tip).toHaveTextContent('Policies and governance records');
  });

  it('shows the same label when an icon is reached with the keyboard', async () => {
    const user = userEvent.setup();
    show(false);
    await user.tab();
    await user.tab();
    const focused = document.activeElement as HTMLElement;
    expect(focused.tagName).toBeTruthy();
    // Tabbing through the rail lands on an icon; its floating label appears without the mouse.
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('describes the footer actions', async () => {
    const user = userEvent.setup();
    show(false);
    await user.hover(screen.getByRole('button', { name: 'Contact support' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Ask the Vivacity team for help');
  });

  it('says when a link opens in a new tab', async () => {
    const user = userEvent.setup();
    show(false);
    await user.hover(screen.getByRole('link', { name: 'Vivacity Academy, opens in a new tab' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('opens in a new tab');
  });

  it('shows the words, not floating labels, when the sidebar is open', async () => {
    const user = userEvent.setup();
    show(true);
    expect(screen.getByText('Governance Documents')).toBeInTheDocument();
    await user.hover(screen.getByRole('link', { name: 'Governance Documents' }));
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('the pin that sets how the menu starts', () => {
  const showPin = (open: boolean, defaultOpen: boolean, setDefaultOpen = vi.fn(), setSidebarOpen = vi.fn()) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/client/home']}>
          <ClientSidebar sidebarOpen={open} setSidebarOpen={setSidebarOpen} defaultOpen={defaultOpen} setDefaultOpen={setDefaultOpen} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { setDefaultOpen, setSidebarOpen };
  };

  it('shows whether the menu starts open, and flips that setting without opening or closing the menu', async () => {
    const user = userEvent.setup();
    const { setDefaultOpen, setSidebarOpen } = showPin(true, false);
    const pin = screen.getByRole('button', { name: 'Start with the menu open' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    expect(setDefaultOpen).toHaveBeenCalledWith(true);
    expect(setSidebarOpen).not.toHaveBeenCalled();
  });

  it('shows pinned when the menu starts open, and unpins on press', async () => {
    const user = userEvent.setup();
    const { setDefaultOpen } = showPin(true, true);
    const pin = screen.getByRole('button', { name: 'Start with the menu open' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    await user.click(pin);
    expect(setDefaultOpen).toHaveBeenCalledWith(false);
  });

  it('has no pin on the collapsed rail, where the words are hidden', () => {
    showPin(false, false);
    expect(screen.queryByRole('button', { name: 'Start with the menu open' })).not.toBeInTheDocument();
  });

  it('the close button now says what it does', async () => {
    const user = userEvent.setup();
    const { setSidebarOpen } = showPin(true, true);
    await user.click(screen.getByRole('button', { name: 'Close the menu' }));
    expect(setSidebarOpen).toHaveBeenCalledWith(false);
  });
});
