/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ------------------------------------------------------------

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: h.rpc,
    functions: { invoke: h.invoke },
    from: vi.fn(),
    storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'client-1' }, profile: { tenant_id: 7, user_uuid: 'client-1' } }),
}));

vi.mock('@/contexts/ClientTenantContext', () => ({
  useClientTenant: () => ({ activeTenantId: 7, tenantName: 'Client A' }),
}));

import { ClientMessageBox } from '@/components/client-portal/support-tickets/ClientMessageBox';
import { TicketThread } from '../TicketThread';
import { authorLabel } from '../ticketLogic';
import { supportTicketsRoutes } from '@/routes/supportTicketsRoutes';
import type { ThreadMessage } from '../useTicketThread';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.rpc.mockReset();
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

// ---- Client message box ------------------------------------------------

describe('client message box', () => {
  it('turns a message into a ticket, then asks for the AI draft', async () => {
    h.rpc.mockResolvedValue({ data: [{ id: 'ticket-1', ticket_number: 42 }], error: null });
    const user = userEvent.setup();
    wrap(<ClientMessageBox />);

    expect(screen.getByText('Our team may use AI to sort your message; a person reviews it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await user.type(screen.getByLabelText('How can we help?'), 'The export never finishes');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText(/Your reference is ST-42/)).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('create_support_ticket', expect.objectContaining({
      p_body: 'The export never finishes',
      p_subject: '',
      p_tenant_id: 7,
      p_diagnostics: expect.objectContaining({ browser: expect.any(String), os: expect.any(String) }),
    }));
    // Classification fields are never sent by a client: the database sets defaults and the AI drafts them.
    const args = h.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_type');
    expect(args).not.toHaveProperty('p_urgency');
    expect(args).not.toHaveProperty('p_product');
    expect(h.invoke).toHaveBeenCalledWith('support-ticket-ai-draft', { body: { ticket_id: 'ticket-1' } });
  });

  it('still confirms the ticket when the AI draft call fails', async () => {
    h.rpc.mockResolvedValue({ data: [{ id: 'ticket-2', ticket_number: 43 }], error: null });
    h.invoke.mockRejectedValue(new Error('function unavailable'));
    const user = userEvent.setup();
    wrap(<ClientMessageBox />);
    await user.type(screen.getByLabelText('How can we help?'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Your reference is ST-43/)).toBeInTheDocument();
  });

  it('keeps the message and shows the reason when the ticket cannot be created', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'No access to this organisation' } });
    const user = userEvent.setup();
    wrap(<ClientMessageBox />);

    const box = screen.getByLabelText('How can we help?');
    await user.type(box, 'Please help me');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No access to this organisation');
    expect(screen.getByRole('alert')).toHaveTextContent('Your message is still here');
    expect(box).toHaveValue('Please help me');
    expect(h.invoke).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
  });
});

// ---- Thread -------------------------------------------------------------

const msg = (over: Partial<ThreadMessage> & { id: string }): ThreadMessage => ({
  ticket_id: 't1', author_id: null, kind: 'reply', staff_only: false, body: '', created_at: '2026-11-13T05:00:00Z', ...over,
});

describe('ticket thread', () => {
  const messages: ThreadMessage[] = [
    msg({ id: 'm1', author_id: 'client-1', body: 'My exact wording' }),
    msg({ id: 'm2', kind: 'event', author_id: 'staff-1', body: 'Status changed to In progress' }),
    msg({ id: 'm3', author_id: 'staff-1', body: 'We are on it', author: { user_uuid: 'staff-1', first_name: 'Sam', last_name: 'Staff' } }),
  ];

  it('shows a client every message RLS returned, with staff anonymised', () => {
    render(<TicketThread messages={messages} attachments={[]} reporterId="client-1" viewer="client" />);
    expect(screen.getByText('My exact wording')).toBeInTheDocument();
    expect(screen.getByText('Status changed to In progress')).toBeInTheDocument();
    expect(screen.getByText('We are on it')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Vivacity team')).toBeInTheDocument();
    expect(screen.queryByText(/Sam/)).not.toBeInTheDocument();
    expect(screen.queryByText('Staff only')).not.toBeInTheDocument();
  });

  it('shows staff names, marks staff-only notes and labels the AI summary', () => {
    const staffMessages: ThreadMessage[] = [
      ...messages,
      msg({ id: 'm4', author_id: 'staff-1', staff_only: true, body: 'Check the export job', author: { user_uuid: 'staff-1', first_name: 'Sam', last_name: 'Staff' } }),
      msg({ id: 'm5', kind: 'ai_draft', staff_only: true, body: 'Client cannot export reports.' }),
    ];
    render(<TicketThread messages={staffMessages} attachments={[]} reporterId="client-1" viewer="staff" />);
    expect(screen.getAllByText('Sam Staff').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Staff only')).toHaveLength(2);
    expect(screen.getByText('AI summary (draft)')).toBeInTheDocument();
    expect(screen.getByText(/AI-generated/)).toBeInTheDocument();
  });

  it('labels authors by who is looking', () => {
    const m = msg({ id: 'x', author_id: 'client-1' });
    expect(authorLabel(m, 'client', 'client-1')).toBe('You');
    expect(authorLabel(m, 'staff', 'client-1')).toBe('Staff member (reporter)');
    expect(authorLabel(msg({ id: 'y', author_id: null }), 'staff', 'client-1')).toBe('System');
    expect(authorLabel(msg({ id: 'z', author_id: 'staff-9' }), 'client', 'client-1')).toBe('Vivacity team');
  });
});

// ---- Legacy links keep the ticket id -------------------------------------

function Probe({ label }: { label: string }) {
  const { id } = useParams<{ id: string }>();
  return <p>{label}:{id}</p>;
}

function routed(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {supportTicketsRoutes}
        <Route path="/support-tickets/:id" element={<Probe label="staff" />} />
        <Route path="/support-tickets/new" element={<p>staff-new</p>} />
        <Route path="/support-tickets" element={<p>staff-list</p>} />
        <Route path="/client/support-tickets/:id" element={<Probe label="client" />} />
        <Route path="/client/support-tickets" element={<p>client-list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('legacy suggestion links', () => {
  it('sends /suggestions/:id to the same ticket', () => {
    routed('/suggestions/abc-123');
    expect(screen.getByText('staff:abc-123')).toBeInTheDocument();
  });
  it('sends /client/suggestions/:id to the same ticket in the client portal', () => {
    routed('/client/suggestions/xyz-9');
    expect(screen.getByText('client:xyz-9')).toBeInTheDocument();
  });
  it('keeps the list and new-ticket redirects', () => {
    routed('/suggestions');
    expect(screen.getByText('staff-list')).toBeInTheDocument();
  });
});
