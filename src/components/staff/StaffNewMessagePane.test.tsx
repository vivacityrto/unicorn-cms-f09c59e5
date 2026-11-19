import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(), warn: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => {
  const rows: Record<string, unknown[]> = {
    tenants: [{ id: 1, name: 'Acme Training' }, { id: 2, name: 'Beta College' }],
    tenant_users: [
      { user_id: 'u1', relationship_role: 'Primary', users: { first_name: 'Ana', last_name: 'Lee', email: 'ana@acme.test' } },
      { user_id: 'u2', relationship_role: null, users: { first_name: null, last_name: null, email: 'bob@acme.test' } },
    ],
  };
  return {
    supabase: {
      from: (table: string) => {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.order = () => Promise.resolve({ data: rows[table] ?? [], error: null });
        b.eq = () => Promise.resolve({ data: rows[table] ?? [], error: null });
        return b;
      },
    },
  };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'staff1' } }) }));
vi.mock('./createStaffConversation', () => ({ createStaffConversation: h.create }));
vi.mock('@/lib/messageAttachments', () => ({ uploadMessageAttachment: vi.fn() }));
vi.mock('@/lib/messageAttachmentsFirst', () => ({ attachmentProblem: () => null }));
vi.mock('sonner', () => ({ toast: { warning: h.warn, error: vi.fn() } }));
Element.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

import { StaffNewMessagePane } from './StaffNewMessagePane';

const show = (initialTenantId: number | null = null) => {
  const api = { onBack: vi.fn(), select: vi.fn(), headerActions: null };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StaffNewMessagePane api={api} initialTenantId={initialTenantId} />
    </QueryClientProvider>,
  );
  return api;
};

const write = (text: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: text } });

beforeEach(() => {
  h.create.mockReset().mockResolvedValue({ id: 'conv-1', messageId: 'm1', skippedParticipants: 0 });
  h.warn.mockReset();
  window.localStorage.clear();
});

describe('a new message from staff, in the bubble', () => {
  it('holds Send back until a client is chosen, and says so', () => {
    show();
    write('hello');
    expect(screen.getByText('Choose a client to write to.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.queryByRole('combobox', { name: 'Recipient' })).not.toBeInTheDocument();
  });

  it('after choosing a client, offers everyone at that client or one person', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    await user.click(await screen.findByText('Acme Training'));
    expect(screen.getByText('To everyone at Acme Training')).toBeInTheDocument();
    expect(screen.getByText('Every user at the client can read and reply.')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByText('Ana Lee (Primary)'));
    expect(screen.getByText('To Ana Lee (Primary)')).toBeInTheDocument();
    expect(screen.getByText('Only this person and you can see this conversation.')).toBeInTheDocument();
  });

  it('sends to one person and opens the new conversation', async () => {
    const user = userEvent.setup();
    const api = show();
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    await user.click(await screen.findByText('Acme Training'));
    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByText('bob@acme.test'));
    write('Quick question');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 1, recipientId: 'u2', body: 'Quick question', staffId: 'staff1', category: 'general' })));
    await waitFor(() => expect(api.select).toHaveBeenCalledWith('conv-1'));
  });

  it('sends to everyone at the client by default, starting from a client when one is given', async () => {
    const user = userEvent.setup();
    const api = show(2);
    expect(await screen.findByText('To everyone at Beta College')).toBeInTheDocument();
    write('Hello all');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 2, recipientId: null })));
    await waitFor(() => expect(api.select).toHaveBeenCalledWith('conv-1'));
  });

  it('tells staff when some client users could not be added, but still opens the conversation', async () => {
    h.create.mockResolvedValue({ id: 'conv-1', messageId: 'm1', skippedParticipants: 2 });
    const user = userEvent.setup();
    const api = show(1);
    write('Hi');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(h.warn).toHaveBeenCalledWith(expect.stringContaining('2 client users could not be added')));
    expect(api.select).toHaveBeenCalledWith('conv-1');
  });
});
