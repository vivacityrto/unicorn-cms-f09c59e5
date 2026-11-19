import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessengerThread } from '@/components/messenger';

const updates: Array<{ table: string; values: Record<string, unknown>; id: string }> = [];

vi.mock('@/integrations/supabase/client', () => {
  const rows: Record<string, unknown[]> = {
    tenant_conversations: [
      { id: 'c1', status: 'open', assigned_to_user_uuid: null },
      { id: 'c2', status: 'resolved', assigned_to_user_uuid: 'u2' },
    ],
    users: [
      { user_uuid: 'u1', first_name: 'Sam', last_name: 'Staff', email: 's@x.test', is_vivacity_internal: true, unicorn_role: 'CSC', disabled: false, archived: false, is_qa_persona: false, is_system_account: false },
      { user_uuid: 'u2', first_name: 'Alex', last_name: 'Other', email: 'a@x.test', is_vivacity_internal: true, unicorn_role: 'CSC', disabled: false, archived: false, is_qa_persona: false, is_system_account: false },
    ],
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      or: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
      upsert: () => Promise.resolve({ error: null }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updates.push({ table, values, id });
          return Promise.resolve({ error: null });
        },
      }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null }),
    };
    return chain;
  };
  return { supabase: { from } };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'u1', unicorn_role: 'CSC' } }) }));

const threads: MessengerThread[] = [
  { id: 'c1', kind: 'general', title: 'Invoice question', unread: true, tenantId: 7 },
  { id: 'c2', kind: 'general', title: 'Old matter', unread: false, tenantId: 7 },
];

vi.mock('@/hooks/useStaffMessenger', () => ({
  useStaffMessenger: () => ({ threads, opened: null, totalUnread: 1, isLoading: false, scope: new Set<number>(), participating: new Set<string>(), tenants: [], hasScope: true, limited: false }),
}));

vi.mock('@/hooks/useStaffConversationPane', () => ({
  useStaffConversationPane: () => ({ messages: [], isLoading: false, onSend: async () => undefined, capabilities: { canSend: true } }),
}));

vi.mock('@/components/staff/StaffNewMessagePane', () => ({ StaffNewMessagePane: () => <div>New message pane</div> }));

import { ClientMessagesTab } from './ClientMessagesTab';

function setup(initial = '/tenant/7?tab=messages') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <ClientMessagesTab tenantId={7} clientName="Acme" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ClientMessagesTab', () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it('lists this client\'s conversations with insight cards, marking resolved ones', async () => {
    setup();
    expect(await screen.findByText('Invoice question')).toBeInTheDocument();
    expect(screen.getByText('Old matter')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Resolved', { selector: 'span' })).toBeInTheDocument());
    expect(screen.getByText(/2 conversations with Acme/)).toBeInTheDocument();
  });

  it('filters to the conversations that need a reply', async () => {
    setup();
    await screen.findByText('Invoice question');
    await userEvent.click(screen.getByRole('button', { name: /^1\s*Needs reply/ }));
    expect(screen.queryByText('Old matter')).not.toBeInTheDocument();
    expect(screen.getByText('Invoice question')).toBeInTheDocument();
  });

  it('resolves an open conversation from its header', async () => {
    setup('/tenant/7?tab=messages&conversation=c1');
    const header = await screen.findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(header).findByRole('button', { name: /Status: open/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as resolved' }));
    await waitFor(() => expect(updates).toContainEqual(expect.objectContaining({ table: 'tenant_conversations', id: 'c1', values: expect.objectContaining({ status: 'resolved' }) })));
  });

  it('assigns a conversation to a staff member', async () => {
    setup('/tenant/7?tab=messages&conversation=c1');
    const header = await screen.findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(header).findByRole('button', { name: /Unassigned\. Assign/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Alex Other/ }));
    await waitFor(() => expect(updates).toContainEqual(expect.objectContaining({ id: 'c1', values: expect.objectContaining({ assigned_to_user_uuid: 'u2' }) })));
  });

  it('writes a new message inside the conversation area', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /New message/ }));
    expect(screen.getByText('New message pane')).toBeInTheDocument();
  });
});
