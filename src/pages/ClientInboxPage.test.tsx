import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

const conv = (id: string, subject: string, type: string, unread: boolean, hoursAgo: number, preview = 'Preview text') => ({
  id, subject, topic: 'general', type, isUnread: unread, last_message_preview: preview, last_message_at: iso(hoursAgo), created_at: iso(hoursAgo + 1),
});

const state = vi.hoisted(() => ({
  markRead: vi.fn(),
  conversations: [] as unknown[],
  notifications: [] as unknown[],
}));

vi.mock('@/contexts/ClientTenantContext', () => ({ useClientTenant: () => ({ isReadOnly: false, activeTenantId: 1 }) }));
vi.mock('@/hooks/useClientCommunications', () => ({
  useClientCommunications: () => ({
    conversations: state.conversations,
    totalUnread: (state.conversations as Array<{ isUnread: boolean }>).filter((c) => c.isUnread).length,
    isLoading: false,
    useConversationMessages: () => ({ data: [{ id: 'm1', conversation_id: 'c1', sender_id: 'staff', sender_name: 'Nova Canto', sender_avatar_url: null, body: 'Welcome aboard', created_at: iso(2), attachments: [] }], isLoading: false }),
    sendMessage: { mutateAsync: vi.fn(), isPending: false },
    createConversation: { mutateAsync: vi.fn(), isPending: false },
    markRead: { mutate: state.markRead },
    currentUserId: 'me',
  }),
}));
vi.mock('@/hooks/useClientNotifications', () => ({
  useClientNotifications: () => ({
    notifications: state.notifications,
    unreadCount: (state.notifications as Array<{ is_read: boolean }>).filter((n) => !n.is_read).length,
    isLoading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}));
vi.mock('@/hooks/useClientInbox', () => ({
  useClientInbox: () => ({ items: [], isLoading: false, unreadCount: 0 }),
}));
vi.mock('@/hooks/useNotificationPrefs', () => ({ useNotificationPrefs: () => ({ categories: { tasks: true, meetings: true, obligations: true, events: true } }) }));
vi.mock('@/components/client/NewConversationDialog', () => ({ NewConversationDialog: () => null }));
vi.mock('@/hooks/useConversationParticipants', () => ({ useConversationParticipants: () => ({ data: [] }) }));
vi.mock('@/components/messaging/MessageAttachments', () => ({ MessageAttachments: () => null }));
vi.mock('@/components/messaging/AttachmentChips', () => ({ AttachmentChips: () => null }));

import ClientInboxPage from './ClientInboxPage';

Element.prototype.scrollIntoView = () => undefined;

const show = (url: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}><ClientInboxPage /></MemoryRouter>
  </QueryClientProvider>,
);

describe('ClientInboxPage', () => {
  it('summarises what is waiting in the banner and on the tabs', () => {
    state.conversations = [conv('c1', 'Annual Declaration', 'broadcast', true, 3), conv('c2', 'Package question', 'package', false, 30)];
    state.notifications = [{ id: 'n1', type: 'task_due', title: 'Task due tomorrow', message: 'Send the file', link: null, is_read: false, created_at: iso(1) }];
    show('/client/inbox?tab=messages');
    const banner = screen.getByRole('region', { name: 'Inbox summary' });
    expect(banner).toHaveTextContent('2 things are waiting for you.');
    expect(banner).toHaveTextContent('1 unread message');
    expect(banner).toHaveTextContent('1 unread notification');
    expect(screen.getByRole('button', { name: 'New message' })).toBeInTheDocument();
  });

  it('filters conversations by search and by what they are about', async () => {
    const user = userEvent.setup();
    state.conversations = [conv('c1', 'Annual Declaration', 'broadcast', true, 3), conv('c2', 'Package question', 'package', false, 30)];
    state.notifications = [];
    show('/client/inbox?tab=messages');
    const list = screen.getByRole('region', { name: 'Conversations' });
    expect(within(list).getByText('Annual Declaration')).toBeInTheDocument();
    expect(within(list).getByText('Package question')).toBeInTheDocument();

    // Types live in one menu, so the chip row never scrolls sideways.
    await user.click(within(list).getByRole('button', { name: 'Filter by type' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'From Vivacity' }));
    expect(within(list).queryByText('Package question')).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'All', pressed: false }));
    await user.type(within(list).getByRole('searchbox', { name: 'Search messages' }), 'package');
    expect(within(list).queryByText('Annual Declaration')).not.toBeInTheDocument();
    expect(within(list).getByText('Package question')).toBeInTheDocument();
  });

  it('opens a conversation, marks it read, shows the message and goes back to the list', async () => {
    const user = userEvent.setup();
    state.markRead.mockClear();
    state.conversations = [conv('c1', 'Annual Declaration', 'broadcast', true, 3)];
    state.notifications = [];
    show('/client/inbox?tab=messages');
    await user.click(screen.getByRole('button', { name: /Annual Declaration/ }));
    const thread = screen.getByRole('region', { name: 'Conversation' });
    expect(within(thread).getByText('Welcome aboard')).toBeInTheDocument();
    expect(within(thread).getByText('Nova Canto')).toBeInTheDocument();
    expect(state.markRead).toHaveBeenCalledWith('c1');
    await user.click(within(thread).getByRole('button', { name: 'Back to conversations' }));
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });

  it('groups notifications under day headings and filters them by kind', async () => {
    const user = userEvent.setup();
    state.conversations = [];
    state.notifications = [
      { id: 'n1', type: 'task_due', title: 'Task due tomorrow', message: 'Send the file', link: null, is_read: false, created_at: new Date().toISOString() },
      { id: 'n2', type: 'obligation_due', title: 'ADC opens soon', message: null, link: null, is_read: true, created_at: iso(24 * 20) },
    ];
    show('/client/inbox?tab=notifications');
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent('Task due tomorrow');
    expect(screen.getByRole('region', { name: 'Earlier' })).toHaveTextContent('ADC opens soon');
    await user.click(screen.getByRole('button', { name: /Obligations/ }));
    expect(screen.queryByText('Task due tomorrow')).not.toBeInTheDocument();
    expect(screen.getByText('ADC opens soon')).toBeInTheDocument();
  });

  it('shows the three views as cards that say what is waiting in each, and switches between them', async () => {
    const user = userEvent.setup();
    state.conversations = [conv('c1', 'Annual Declaration', 'broadcast', true, 3), conv('c2', 'Package question', 'package', false, 30)];
    state.notifications = [{ id: 'n1', type: 'task_due', title: 'Task due tomorrow', message: null, link: null, is_read: false, created_at: iso(1) }];
    show('/client/inbox?tab=all');
    const everything = screen.getByRole('tab', { name: /Everything/ });
    const messages = screen.getByRole('tab', { name: /Messages/ });
    const notifications = screen.getByRole('tab', { name: /Notifications/ });
    expect(everything).toHaveTextContent('2 unread');
    expect(everything).toHaveTextContent('3 items');
    expect(messages).toHaveTextContent('1 unread');
    expect(messages).toHaveTextContent('1 from Vivacity waiting');
    expect(notifications).toHaveTextContent('1 task to look at');
    expect(everything).toHaveAttribute('data-state', 'active');
    await user.click(messages);
    expect(messages).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('region', { name: 'Conversations' })).toBeInTheDocument();
  });

  it('says so when there is nothing to show', () => {
    state.conversations = [];
    state.notifications = [];
    show('/client/inbox?tab=notifications');
    expect(screen.getByText('No notifications to show')).toBeInTheDocument();
  });
});
