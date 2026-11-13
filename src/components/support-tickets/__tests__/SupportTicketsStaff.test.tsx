/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TicketRow } from '../ticketLogic';

// ---- Mocks ------------------------------------------------------------

type Op = [string, unknown[]];
const h = vi.hoisted(() => ({
  calls: [] as { table: string; ops: Op[] }[],
  rows: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const rec = { table, ops: [] as Op[] };
    h.calls.push(rec);
    const b: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const write = rec.ops.some(([n]) => n === 'update' || n === 'insert');
          const result = write
            ? { data: rec.ops.some(([n]) => n === 'select') ? { id: 'new-message' } : null, error: null }
            : { data: table === 'support_tickets' ? h.rows : [], error: null };
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
        }
        return (...args: unknown[]) => { rec.ops.push([prop, args]); return b; };
      },
    });
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) },
    },
  };
});

vi.mock('@/components/ui/select', async () => await import('./selectShim'));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'me' },
    profile: { is_vivacity_internal: true, tenant_id: null },
    isSuperAdmin: () => false,
    loading: false,
  }),
}));

vi.mock('@/hooks/useVivacityTeamUsers', () => ({
  useVivacityTeamUsers: () => ({
    data: [{ user_uuid: 'staff1', first_name: 'Sam', last_name: 'Staff', email: 'sam@example.test', avatar_url: null, unicorn_role: 'Team Member', job_title: null }],
  }),
}));

import SupportTicketsPage from '@/pages/SupportTicketsPage';
import { TicketComposer } from '../TicketComposer';

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function ticket(over: Partial<TicketRow> & { id: string; ticket_number: number; title: string }): TicketRow {
  return {
    product: 'unicorn', tenant_id: 54, reporter_id: 'r1', type: 'bug', status: 'new', urgency: 'medium',
    assignee_id: null, source_url: null, external_ref: null, ai_state: 'none',
    created_at: iso(3), updated_at: iso(3), resolved_at: null, last_activity_at: iso(1), deleted_at: null,
    tenant: { id: 54, name: 'Client A' },
    reporter: { user_uuid: 'r1', first_name: 'Reporter', last_name: 'One' },
    assignee: null,
    ...over,
  };
}

function wrap(ui: React.ReactElement, route = '/support-tickets') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const writesTo = (table: string, op: string) =>
  h.calls.filter((c) => c.table === table && c.ops.some(([n]) => n === op));

beforeEach(() => {
  h.calls.length = 0;
  h.rows = [
    ticket({ id: 'x1', ticket_number: 1, title: 'Export fails', status: 'new' }),
    ticket({ id: 'x2', ticket_number: 2, title: 'Add bulk upload', status: 'in_progress', assignee_id: 'staff1', type: 'request',
      assignee: { user_uuid: 'staff1', first_name: 'Sam', last_name: 'Staff' } }),
    ticket({ id: 'x3', ticket_number: 3, title: 'Wrong date shown', status: 'resolved', urgency: 'high' }),
    ticket({ id: 'x4', ticket_number: 4, title: 'Page goes blank', status: 'new', urgency: 'critical', assignee_id: 'staff1',
      assignee: { user_uuid: 'staff1', first_name: 'Sam', last_name: 'Staff' } }),
  ];
});

// ---- Staff list --------------------------------------------------------

describe('staff Tickets page', () => {
  it('shows the four views with counts and starts on Needs triage', async () => {
    wrap(<SupportTicketsPage />);
    expect(await screen.findByRole('tab', { name: /Needs triage\s*1/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Open\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Resolved\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All\s*4/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeInTheDocument();
    expect(screen.queryByText(/internal/i)).not.toBeInTheDocument();

    // Needs triage is new and unassigned: only ST-1.
    expect(screen.getAllByText('Export fails').length).toBeGreaterThan(0);
    expect(screen.queryByText('Add bulk upload')).not.toBeInTheDocument();
    expect(screen.queryByText('Page goes blank')).not.toBeInTheDocument();
  });

  it('shows the four summary counts', async () => {
    wrap(<SupportTicketsPage />);
    await screen.findByRole('tab', { name: /Needs triage\s*1/ }); // data has loaded
    const summary = screen.getByLabelText('Ticket summary');
    expect(within(summary).getByText('Needs triage').previousSibling).toHaveTextContent('1');
    expect(within(summary).getByText('High or critical open').previousSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Open').previousSibling).toHaveTextContent('3');
    expect(within(summary).getByText('Oldest open')).toBeInTheDocument();
  });

  it('switches views', async () => {
    const user = userEvent.setup();
    wrap(<SupportTicketsPage />);
    await user.click(await screen.findByRole('tab', { name: /^Open/ }));
    expect(await screen.findAllByText('Add bulk upload')).not.toHaveLength(0);
    expect(screen.queryByText('Wrong date shown')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Resolved/ }));
    expect(await screen.findAllByText('Wrong date shown')).not.toHaveLength(0);
  });

  it('assigns a ticket inline with one change and writes only the assignee', async () => {
    const user = userEvent.setup();
    wrap(<SupportTicketsPage />);
    const [select] = await screen.findAllByLabelText('Assignee for ST-1');
    await user.selectOptions(select, 'staff1');
    await waitFor(() => expect(writesTo('support_tickets', 'update')).toHaveLength(1));
    const call = writesTo('support_tickets', 'update')[0];
    expect(call.ops.find(([n]) => n === 'update')?.[1][0]).toEqual({ assignee_id: 'staff1' });
    expect(call.ops.find(([n]) => n === 'eq')?.[1]).toEqual(['id', 'x1']);
  });

  it('changes status inline with one change and writes only the status', async () => {
    const user = userEvent.setup();
    wrap(<SupportTicketsPage />);
    await user.click(await screen.findByRole('tab', { name: /^All/ }));
    const [select] = await screen.findAllByLabelText('Status for ST-1');
    await user.selectOptions(select, 'resolved');
    await waitFor(() => expect(writesTo('support_tickets', 'update')).toHaveLength(1));
    expect(writesTo('support_tickets', 'update')[0].ops.find(([n]) => n === 'update')?.[1][0]).toEqual({ status: 'resolved' });
  });

  it('opens the reason dialog instead of closing a ticket straight away', async () => {
    const user = userEvent.setup();
    wrap(<SupportTicketsPage />);
    await user.click(await screen.findByRole('tab', { name: /^All/ }));
    const [select] = await screen.findAllByLabelText('Status for ST-1');
    await user.selectOptions(select, 'closed');
    expect(await screen.findByRole('dialog', { name: /Close ST-1/ })).toBeInTheDocument();
    expect(writesTo('support_tickets', 'update')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Close ticket' })).toBeDisabled();
  });

  it('tells "no tickets yet" apart from "nothing matches"', async () => {
    h.rows = [];
    wrap(<SupportTicketsPage />);
    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
  });
});

// ---- Reply composer ----------------------------------------------------

describe('reply composer', () => {
  it('posts a reply the reporter can see, then a staff-only note', async () => {
    const user = userEvent.setup();
    wrap(<TicketComposer ticketId="t1" canNote />);

    await user.type(screen.getByRole('textbox'), 'We are looking at this');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(writesTo('support_ticket_messages', 'insert')).toHaveLength(1));
    expect(writesTo('support_ticket_messages', 'insert')[0].ops.find(([n]) => n === 'insert')?.[1][0]).toEqual({
      ticket_id: 't1', author_id: 'me', kind: 'reply', staff_only: false, body: 'We are looking at this',
    });

    await user.click(screen.getByRole('radio', { name: 'Add staff-only note' }));
    await user.type(screen.getByRole('textbox'), 'Check the export job');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(writesTo('support_ticket_messages', 'insert')).toHaveLength(2));
    expect(writesTo('support_ticket_messages', 'insert')[1].ops.find(([n]) => n === 'insert')?.[1][0]).toMatchObject({
      kind: 'reply', staff_only: true, body: 'Check the export job',
    });
  });

  it('does not offer the note mode to a client and keeps Send disabled until there is text', () => {
    wrap(<TicketComposer ticketId="t1" canNote={false} />);
    expect(screen.queryByRole('radio', { name: 'Add staff-only note' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
  });
});
