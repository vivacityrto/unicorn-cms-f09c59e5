/**
 * Drives the real Inbox page with the real conversation, notification and inbox hooks over a fake database holding
 * awkward but realistic rows (null subjects, null previews, unknown types, a message with no sender, a broadcast the
 * person is not a participant of), and clicks every card, filter and row. The page must never throw and React must
 * never log an error while it does.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, rpcCalls: [] as string[], authDelay: 0 }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'not', 'is', 'update', 'insert', 'upsert', 'delete', 'or', 'neq']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: { id: 'new' }, error: null });
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(resolve, reject);
    return b;
  };
  // Behaves like supabase-js: asking for a channel by a name already in use returns the same, possibly already
  // subscribed, instance; adding a listener to a subscribed channel throws; and removal finishes a moment later.
  const registry = new Map<string, { subscribed: boolean; on: () => unknown; subscribe: () => unknown }>();
  const channel = (name: string) => {
    let c = registry.get(name);
    if (!c) {
      const fresh = {
        subscribed: false,
        on: () => {
          if (fresh.subscribed) throw new Error('cannot add `postgres_changes` callbacks after `subscribe()`');
          return fresh;
        },
        subscribe: () => {
          fresh.subscribed = true;
          return fresh;
        },
      };
      c = fresh;
      registry.set(name, c);
    }
    return c;
  };
  const removeChannel = (c: unknown) => {
    setTimeout(() => {
      for (const [k, v] of registry) if (v === c) registry.delete(k);
    }, 400);
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string) => {
        db.rpcCalls.push(name);
        return Promise.resolve({ data: null, error: null });
      },
      auth: { getUser: () => new Promise((resolve) => setTimeout(() => resolve({ data: { user: { id: 'me' } } }), db.authDelay)) },
      channel,
      removeChannel,
    },
  };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me', first_name: 'Carl' } }) }));
vi.mock('@/contexts/ClientTenantContext', () => ({ useClientTenant: () => ({ activeTenantId: 1, isAcademyOnly: false, isReadOnly: false }) }));
vi.mock('@/hooks/useNotificationPrefs', () => ({ useNotificationPrefs: () => ({ categories: { tasks: true, meetings: true, obligations: true, events: true } }) }));
vi.mock('@/components/messaging/MessageAttachments', () => ({ MessageAttachments: () => null }));

vi.mock('@/components/client/NewMessagePane', () => ({ NewMessagePane: () => <p>compose pane</p> }));
import ClientInboxPage from './ClientInboxPage';
import { MessengerDockProvider, useMessengerDock } from '@/components/messenger';

function DockProbe() {
  const { open, selectedId } = useMessengerDock();
  return <output data-testid="dock">{open ? `open:${selectedId ?? ''}` : 'closed'}</output>;
}


function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

let lastClient: QueryClient | null = null;
const show = (url: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lastClient = qc;
  return render(
    <QueryClientProvider client={qc}>
      <MessengerDockProvider>
        <MemoryRouter initialEntries={[url]}>
          <ClientInboxPage />
          <Where />
          <DockProbe />
        </MemoryRouter>
      </MessengerDockProvider>
    </QueryClientProvider>,
  );
};

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args);
  });
  Element.prototype.scrollIntoView = () => undefined;
  db.rpcCalls = [];
  db.authDelay = 0;
  db.tables = {
    tenant_conversations: [
      { id: 'c1', tenant_id: 1, subject: 'Annual Declaration opens', topic: 'general', type: 'broadcast', last_message_at: hoursAgo(3), last_message_preview: 'Your CEO receives a link', created_at: hoursAgo(5), status: 'open' },
      { id: 'c2', tenant_id: 1, subject: null, topic: null, type: null, last_message_at: null, last_message_preview: null, created_at: hoursAgo(60), status: 'open' },
      { id: 'c3', tenant_id: 1, subject: 'Package question', topic: 'package', type: 'package', last_message_at: hoursAgo(30), last_message_preview: 'Thanks', created_at: hoursAgo(90), status: 'open' },
      { id: 'c4', tenant_id: 1, subject: 'Odd type', topic: 'x', type: 'something_new', last_message_at: hoursAgo(500), last_message_preview: 'Hello', created_at: hoursAgo(600), status: 'open' },
    ],
    conversation_participants: [{ conversation_id: 'c3', last_read_at: hoursAgo(1) }],
    tenant_messages: [
      { id: 'm1', conversation_id: 'c1', sender_user_uuid: 'staff1', sender_type: 'staff', body: 'Hello from Vivacity', created_at: hoursAgo(3) },
      { id: 'm2', conversation_id: 'c1', sender_user_uuid: null, sender_type: null, body: 'A message with no sender', created_at: hoursAgo(2) },
    ],
    users: [{ user_uuid: 'staff1', first_name: 'Nova', last_name: 'Canto', avatar_url: null }],
    tenant_message_attachments: [],
    user_notifications: [
      { id: 'n1', user_id: 'me', tenant_id: 1, type: 'task_due', title: 'Task due tomorrow', message: 'Send the file', link: '/client/tasks', is_read: false, created_by: null, created_at: hoursAgo(1), updated_at: hoursAgo(1) },
      { id: 'n2', user_id: 'me', tenant_id: 1, type: 'regulator_change', title: 'Regulator update', message: null, link: null, is_read: true, created_by: null, created_at: hoursAgo(100), updated_at: hoursAgo(100) },
      { id: 'n3', user_id: 'me', tenant_id: 1, type: 'message', title: 'New message', message: null, link: '/client/inbox?conversation=c1', is_read: false, created_by: null, created_at: hoursAgo(3), updated_at: hoursAgo(3) },
      { id: 'n4', user_id: 'me', tenant_id: 1, type: 'capacity_alert', title: 'Capacity', message: 'x', link: null, is_read: false, created_by: null, created_at: hoursAgo(700), updated_at: hoursAgo(700) },
    ],
  };
});
afterEach(() => vi.restoreAllMocks());

const clean = () => expect(errors.map((e) => String(e[0]).slice(0, 160))).toEqual([]);

describe('Inbox flows with real hooks', () => {
  it('opens on each card and shows its content without errors', async () => {
    const user = userEvent.setup();
    show('/client/inbox');
    await screen.findByRole('tab', { name: /Everything/ });
    await screen.findByText('Annual Declaration opens');
    for (const name of [/Messages/, /Notifications/, /Everything/]) {
      await user.click(screen.getByRole('tab', { name }));
      expect(screen.getByRole('tab', { name })).toHaveAttribute('data-state', 'active');
    }
    clean();
  });

  it('survives every filter pill on every tab', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=all');
    await screen.findByText('Annual Declaration opens');
    const press = async (group: string) => {
      const pills = within(screen.getByRole('group', { name: group })).getAllByRole('button');
      for (const pill of pills) {
        await user.click(pill);
        // The type chip opens a menu; close it so the rest of the page is reachable again.
        await user.keyboard('{Escape}');
      }
    };
    await press('Filter the inbox');
    await user.click(screen.getByRole('tab', { name: /Messages/ }));
    await press('Filter conversations');
    await user.click(screen.getByRole('tab', { name: /Notifications/ }));
    await press('Filter notifications');
    clean();
  });

  it('opens every conversation, including the ones with missing fields, then goes back', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=messages');
    await screen.findByText('Annual Declaration opens');
    const list = () => screen.getByRole('region', { name: 'Conversations' });
    for (const title of [/Annual Declaration opens/, /Package question/, /Odd type/, /General.*No messages yet/]) {
      await user.click(within(list()).getByRole('button', { name: title }));
      expect(screen.getByRole('region', { name: 'Conversation' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back to conversations' }));
      expect(screen.getByText('Select a conversation')).toBeInTheDocument();
    }
    clean();
  });

  it('can open the same conversation again straight after closing it', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=messages');
    await screen.findByText('Annual Declaration opens');
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: /Annual Declaration opens/ }));
      expect(screen.getByRole('region', { name: 'Conversation' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back to conversations' }));
    }
    await user.click(screen.getByRole('button', { name: /Annual Declaration opens/ }));
    expect(await screen.findByText('Hello from Vivacity')).toBeInTheDocument();
    clean();
  });

  it('shows a conversation, marks it read and shows messages including one with no sender', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=messages');
    await user.click(await screen.findByRole('button', { name: /Annual Declaration opens/ }));
    const thread = screen.getByRole('region', { name: 'Conversation' });
    expect(await within(thread).findByText('Hello from Vivacity')).toBeInTheDocument();
    expect(within(thread).getByText('A message with no sender')).toBeInTheDocument();
    // Staff are named rather than shown as a generic team. The badge itself is not asserted here: it needs the database function, which this fake does not provide.
    expect(within(thread).getByText('Nova Canto')).toBeInTheDocument();
    expect(db.rpcCalls).toContain('fn_mark_conversation_read');
    clean();
  });

  it('works from the unread filter, the search box and an unknown deep link', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=messages&thread=does-not-exist');
    await screen.findByText('Annual Declaration opens');
    await user.click(screen.getByRole('button', { name: /^Unread/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search messages' }), 'zzz');
    expect(screen.getByText('No conversations match')).toBeInTheDocument();
    clean();
  });

  it('opens an item from the Everything feed and lands on the right place', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=all');
    await user.click(await screen.findByRole('button', { name: /Annual Declaration opens/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/client/inbox?tab=messages&thread=c1');
    expect(await screen.findByRole('region', { name: 'Conversation' })).toBeInTheDocument();
    clean();
  });

  it('opens a notification, marks it read and follows its link; mark all as read works', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=notifications');
    await screen.findByText('Task due tomorrow');
    await user.click(screen.getByRole('button', { name: /Mark all as read/ }));
    await user.click(await screen.findByRole('button', { name: /Task due tomorrow/ }));
    clean();
  });

  it('ends the new message when you leave the Messages tab, so it does not come back later', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=all');
    await screen.findByText('Annual Declaration opens');
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByText('compose pane')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Everything/ }));
    expect(screen.queryByText('compose pane')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Messages/ }));
    expect(screen.queryByText('compose pane')).not.toBeInTheDocument();
    clean();
  });

  it('opens the new message in the conversation area from the banner', async () => {
    const user = userEvent.setup();
    show('/client/inbox?tab=all');
    await screen.findByText('Annual Declaration opens');
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByText('compose pane')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('tab=messages');
    expect(screen.getByTestId('dock')).toHaveTextContent('closed');
    clean();
  });

  it('keeps the conversations when the Messages tab opens while a refresh is running', async () => {
    // Each part of the page learns the signed-in user a moment after it appears. A refresh that ran in that moment used
    // to save an empty list for everyone, so Everything, Messages and every card read zero.
    const user = userEvent.setup();
    db.authDelay = 80;
    show('/client/inbox?tab=all');
    await screen.findByText('Annual Declaration opens', undefined, { timeout: 3000 });
    await user.click(screen.getByRole('tab', { name: /Messages/ }));
    await lastClient!.invalidateQueries({ queryKey: ['client-conversations'] });
    await new Promise((r) => setTimeout(r, 300));
    const list = screen.getByRole('region', { name: 'Conversations' });
    expect(within(list).getByRole('button', { name: /Annual Declaration opens/ })).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Everything/ })).toHaveTextContent(/7 items/);
    clean();
  });
});
