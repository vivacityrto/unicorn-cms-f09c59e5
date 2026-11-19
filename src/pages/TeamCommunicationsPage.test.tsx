import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessengerThread } from '@/components/messenger';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const state = vi.hoisted(() => ({
  threads: [] as MessengerThread[],
  scope: new Map<number, unknown>(),
  allClientsCalls: [] as boolean[],
  isSuperAdmin: false,
  bulk: { scheduled: 2, lastSentAt: null as string | null },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me', is_team: true, unicorn_role: 'Team Leader' } }) }));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ isSuperAdmin: state.isSuperAdmin }) }));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({ useVivacityTeamUsers: () => ({ data: [{ user_uuid: 'u2', first_name: 'Nova', last_name: 'Canto', email: 'n@x' }] }) }));
vi.mock('@/hooks/useStaffMessenger', () => ({
  useStaffMessenger: (allClients: boolean) => {
    state.allClientsCalls.push(allClients);
    return {
      threads: state.threads,
      totalUnread: state.threads.filter((t) => t.unread).length,
      tenants: [{ id: 1, name: 'Acme Training' }, { id: 2, name: 'Other RTO' }],
      isLoading: false,
      scope: state.scope,
      hasScope: state.scope.size > 0,
    };
  },
}));
vi.mock('@/hooks/useStaffConversationPane', () => ({
  useStaffConversationPane: () => ({ messages: [], isLoading: false, onSend: vi.fn().mockResolvedValue(undefined), draftScope: 'test' }),
}));
vi.mock('@/hooks/useBulkMessageSummary', () => ({ useBulkMessageSummary: () => ({ data: state.bulk }) }));
vi.mock('@/components/communications/BulkMessageDialog', () => ({ BulkMessageDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Bulk dialog" /> : null) }));
vi.mock('@/components/communications/BulkMessageHistory', () => ({ BulkMessageHistory: () => <p>history rows</p> }));
vi.mock('@/components/communications/NewTeamMessageDialog', () => ({ NewTeamMessageDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="New message dialog" /> : null) }));

Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

import TeamCommunicationsPage from './TeamCommunicationsPage';

const show = (url = '/communications') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <TeamCommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const thread = (id: string, over: Partial<MessengerThread> = {}): MessengerThread => ({ id, kind: 'general', title: `Acme Training · ${id}`, unread: false, tenantId: 1, lastActivityAt: hoursAgo(50), preview: `preview ${id}`, ...over });

beforeEach(() => {
  state.allClientsCalls = [];
  state.isSuperAdmin = false;
  state.scope = new Map([[1, { reason: 'primary_csc' }]]);
  state.threads = [
    thread('waiting', { unread: true, lastActivityAt: hoursAgo(72) }),
    thread('today', { lastActivityAt: hoursAgo(1) }),
    thread('cover', { tenantId: 2, title: 'Other RTO · cover', badge: { label: 'Covering Nova', tone: 'info' }, unread: true, lastActivityAt: hoursAgo(2) }),
    thread('quiet'),
  ];
});

const list = () => screen.getByRole('list', { name: 'Conversations' });
const card = (name: RegExp) => within(screen.getByRole('region', { name: 'Summary' })).getByRole('button', { name });

describe('Team Communications', () => {
  it('has no tabs: four cards say what needs you, what you cover, what moved today and what is going out in bulk', () => {
    show();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByRole('button', { name: /Needs you/ })).toHaveTextContent('2');
    expect(within(summary).getByRole('button', { name: /Needs you/ })).toHaveTextContent('Oldest waiting 3 days');
    expect(within(summary).getByRole('button', { name: /Covering/ })).toHaveTextContent('1');
    expect(within(summary).getByRole('button', { name: /Active today/ })).toHaveTextContent('2');
    expect(within(summary).getByRole('button', { name: /Bulk messages/ })).toHaveTextContent('2 scheduled');
  });

  it('filters the list from a card, and clicking it again shows everything', async () => {
    const user = userEvent.setup();
    show();
    expect(within(list()).getAllByRole('button').length).toBeGreaterThanOrEqual(4);
    await user.click(card(/Needs you/));
    expect(within(list()).getByText('Acme Training · waiting')).toBeInTheDocument();
    expect(within(list()).queryByText('Acme Training · quiet')).not.toBeInTheDocument();
    expect(screen.getByText('2 conversations')).toBeInTheDocument();
    await user.click(card(/Covering/));
    expect(within(list()).getByText('Other RTO · cover')).toBeInTheDocument();
    expect(within(list()).queryByText('Acme Training · waiting')).not.toBeInTheDocument();
    await user.click(card(/Covering/));
    expect(within(list()).getByText('Acme Training · quiet')).toBeInTheDocument();
  });

  it('opens the bulk history beside the page instead of replacing it with a tab', async () => {
    const user = userEvent.setup();
    show();
    await user.click(card(/Bulk messages/));
    expect(await screen.findByText('history rows')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bulk message history' })).toBeInTheDocument();
  });

  it('keeps New message and Bulk message in the header', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByRole('dialog', { name: 'New message dialog' })).toBeInTheDocument();
  });

  it('starts on my clients and switches to all clients', async () => {
    const user = userEvent.setup();
    show();
    expect(state.allClientsCalls[0]).toBe(false);
    await user.click(screen.getByRole('button', { name: 'My clients' }));
    expect(state.allClientsCalls.at(-1)).toBe(true);
    expect(screen.getByRole('button', { name: 'All clients' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a conversation from the list with a way into the client, and keeps it listed under a filter', async () => {
    const user = userEvent.setup();
    show();
    await user.click(within(list()).getByText('Acme Training · quiet'));
    expect(screen.getByRole('link', { name: 'Open the client' })).toHaveAttribute('href', '/tenant/1');
    await user.click(card(/Needs you/));
    expect(within(list()).getByText('Acme Training · quiet')).toBeInTheDocument();
  });

  it('shows the team member filter to Super Admins only', () => {
    const { unmount } = show();
    expect(screen.queryByRole('combobox', { name: 'Team member' })).not.toBeInTheDocument();
    unmount();
    state.isSuperAdmin = true;
    show();
    expect(screen.getByRole('combobox', { name: 'Team member' })).toBeInTheDocument();
  });

  it('says so when nothing is assigned, rather than showing an empty box', () => {
    state.threads = [];
    state.scope = new Map();
    show();
    expect(screen.getByText(/No clients are assigned to you yet/)).toBeInTheDocument();
  });
});
