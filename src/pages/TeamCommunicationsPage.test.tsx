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
  opts: [] as Array<Record<string, unknown>>,
  limited: false,
  loadingMember: false,
  memberThreads: [] as MessengerThread[],
  isSuperAdmin: false,
  bulk: { scheduled: 2, lastSentAt: null as string | null },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me', is_team: true, unicorn_role: 'Team Leader' } }) }));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ isSuperAdmin: state.isSuperAdmin }) }));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({ useVivacityTeamUsers: () => ({ data: [{ user_uuid: 'u2', first_name: 'Nova', last_name: 'Canto', email: 'n@x' }] }) }));
vi.mock('@/hooks/useStaffMessenger', () => ({
  useStaffMessenger: (allClients: boolean, _enabled: boolean, opts: Record<string, unknown>) => {
    state.allClientsCalls.push(allClients);
    state.opts.push(opts);
    // What the real hook does for a team member: only their conversations, and nothing at all while they load.
    const base = opts?.memberId ? (state.loadingMember ? [] : state.memberThreads) : state.threads;
    // The real hook also fetches a conversation that was opened by link on its own, whatever the filter says.
    const extra = state.threads.find((t) => t.id === opts?.extraThreadId);
    const forMember = base;
    return {
      threads: forMember,
      opened: extra && !base.some((t) => t.id === extra.id) ? extra : null,
      totalUnread: forMember.filter((t) => t.unread).length,
      tenants: [{ id: 1, name: 'Acme Training' }, { id: 2, name: 'Other RTO' }],
      isLoading: !!opts?.memberId && state.loadingMember,
      limited: state.limited,
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

Element.prototype.scrollTo = vi.fn();
(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = vi.fn();

import TeamCommunicationsPage from './TeamCommunicationsPage';
import { MessengerDockProvider, useMessengerDock } from '@/components/messenger';

function DockProbe() {
  const { open, selectedId } = useMessengerDock();
  return <output data-testid="dock">{open ? `open:${selectedId ?? ''}` : 'closed'}</output>;
}


const show = (url = '/communications') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessengerDockProvider>
        <MemoryRouter initialEntries={[url]}>
          <TeamCommunicationsPage />
          <DockProbe />
        </MemoryRouter>
      </MessengerDockProvider>
    </QueryClientProvider>,
  );

const thread = (id: string, over: Partial<MessengerThread> = {}): MessengerThread => ({ id, kind: 'general', title: `Acme Training · ${id}`, unread: false, tenantId: 1, lastActivityAt: hoursAgo(50), preview: `preview ${id}`, ...over });

beforeEach(() => {
  state.allClientsCalls = [];
  state.opts = [];
  state.loadingMember = false;
  state.memberThreads = [];
  state.limited = false;
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
    expect(screen.getByTestId('dock')).toHaveTextContent('open:compose:new');
  });

  it('starts on my clients and switches to all clients', async () => {
    const user = userEvent.setup();
    show();
    expect(state.allClientsCalls[0]).toBe(false);
    await user.click(screen.getByRole('button', { name: 'My clients' }));
    expect(state.allClientsCalls.at(-1)).toBe(true);
    expect(screen.getByRole('button', { name: 'All clients' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a conversation from the list with a way into the client, and keeps it open (not listed) when a filter takes it out of the list', async () => {
    const user = userEvent.setup();
    show();
    await user.click(within(list()).getByText('Acme Training · quiet'));
    expect(screen.getByRole('link', { name: 'Open the client' })).toHaveAttribute('href', '/tenant/1');
    await user.click(card(/Needs you/));
    // The list is exactly what the filter says; the conversation being read stays open in the right pane.
    expect(within(list()).queryByText('Acme Training · quiet')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
  });

  it('closes a conversation that is not mine when going back to My clients, so someone with no clients sees the empty message', async () => {
    const user = userEvent.setup();
    state.scope = new Map();
    // This person has no clients. A conversation of someone else's is open under All clients.
    state.threads = [thread('elsewhere', { tenantId: 9, title: 'Elsewhere RTO · elsewhere' })];
    show('/communications?thread=elsewhere');
    expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'My clients' }));
    await user.click(screen.getByRole('button', { name: 'All clients' }));
    // Back on My clients: the conversation is closed and the list says there is nothing assigned, instead of keeping it.
    expect(screen.queryByRole('link', { name: 'Open the client' })).not.toBeInTheDocument();
    expect(screen.getByText('Pick a conversation to read and reply.')).toBeInTheDocument();
  });

  it('keeps an open conversation that is mine when switching scope', async () => {
    const user = userEvent.setup();
    show('/communications?thread=quiet');
    expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'My clients' }));
    expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All clients' }));
    expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
  });

  it('asks for the opened conversation and the chosen client, so older conversations are reachable', async () => {
    show('/communications?thread=old-one');
    expect(state.opts.at(-1)).toEqual({ tenantId: null, extraThreadId: 'old-one', memberId: null });
  });

  it('says when the list stopped at the newest conversations, and points at the client picker', () => {
    state.limited = true;
    show();
    expect(screen.getByText(/the newest; pick a client to see all of theirs/)).toBeInTheDocument();
  });

  describe('the team member filter', () => {
    const pickMember = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('combobox', { name: 'Team member' }));
      await user.click(await screen.findByRole('option', { name: /Nova Canto/ }));
    };

    beforeEach(() => {
      state.isSuperAdmin = true;
      state.memberThreads = [thread('theirs', { title: 'Zed RTO · theirs', tenantId: 2 })];
    });

    it("asks for that person's conversations, and the list is exactly their conversations", async () => {
      const user = userEvent.setup();
      show();
      await pickMember(user);
      expect(state.opts.at(-1)).toMatchObject({ memberId: 'u2' });
      expect(within(list()).getByText('Zed RTO · theirs')).toBeInTheDocument();
      // Nothing of anyone else's, including conversations of the person looking.
      expect(within(list()).queryByText('Acme Training · waiting')).not.toBeInTheDocument();
      expect(within(list()).queryByText('Acme Training · quiet')).not.toBeInTheDocument();
      expect(screen.getByText(/of Nova Canto's clients and ones they are in/)).toBeInTheDocument();
    });

    it("never shows an unfiltered list while that person's conversations are still loading", async () => {
      const user = userEvent.setup();
      state.loadingMember = true;
      show();
      await pickMember(user);
      expect(within(list()).queryByText('Acme Training · waiting')).not.toBeInTheDocument();
      expect(within(list()).queryByText('Acme Training · quiet')).not.toBeInTheDocument();
    });

    it('does not force the conversation being read into the filtered list', async () => {
      const user = userEvent.setup();
      show('/communications?thread=quiet');
      expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
      await pickMember(user);
      expect(within(list()).queryByText('Acme Training · quiet')).not.toBeInTheDocument();
      // It stays open until it is closed.
      expect(screen.getByRole('link', { name: 'Open the client' })).toBeInTheDocument();
    });

    it('switches off My clients and All clients while a person is chosen, because the filter is about them, and back on when cleared', async () => {
      const user = userEvent.setup();
      show();
      await pickMember(user);
      expect(screen.getByRole('button', { name: 'My clients' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Clear the team member filter' }));
      expect(screen.getByRole('button', { name: 'My clients' })).toBeEnabled();
      expect(state.opts.at(-1)).toMatchObject({ memberId: null });
    });

    it('does nothing for anyone who is not a Super Admin', () => {
      state.isSuperAdmin = false;
      show();
      expect(screen.queryByRole('combobox', { name: 'Team member' })).not.toBeInTheDocument();
      expect(state.opts.every((o) => o.memberId === null)).toBe(true);
    });
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
