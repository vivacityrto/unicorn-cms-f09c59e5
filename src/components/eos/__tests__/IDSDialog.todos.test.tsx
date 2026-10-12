/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// The Solve tab lists the to-dos linked to THIS issue (eos_todos.issue_id), so they are visible
// every time the issue is opened, whoever added them and whenever they were added.

const orderMock = vi.fn();
const eqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...(a as [])) } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'attendee-1', tenant_id: 6372 } }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/useEosOptions', () => ({
  useEosStatusTransitions: () => ({ data: [] }),
  isValidStatusTransition: () => true,
  getAllowedStatusTransitions: () => [],
}));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({
  useVivacityTeamUsers: () => ({
    data: [{ user_uuid: 'owner-1', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }],
  }),
}));
vi.mock('@/components/eos/ClientBadge', () => ({ ClientBadge: () => null }));

import { IDSDialog } from '@/components/eos/IDSDialog';
import type { EosIssue } from '@/types/eos';

const issue: EosIssue = {
  id: 'issue-1',
  tenant_id: 6372,
  title: 'Tool spend and dependencies',
  status: 'Solved',
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IDSDialog open onOpenChange={() => undefined} issue={issue} meetingId="meeting-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('IDSDialog: to-dos linked to the issue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderMock.mockResolvedValue({
      data: [
        { id: 't1', title: 'Cancel unused subscriptions', owner_id: 'owner-1', due_date: '2026-10-20', status: 'Open' },
        { id: 't2', title: 'Review GHL plan', owner_id: 'owner-1', due_date: '2026-10-05', status: 'Complete' },
      ],
      error: null,
    });
  });

  it('queries to-dos by this issue id', async () => {
    renderDialog();
    await screen.findByTestId('issue-todos');
    expect(fromMock).toHaveBeenCalledWith('eos_todos');
    expect(eqMock).toHaveBeenCalledWith('issue_id', 'issue-1');
  });

  it('shows each linked to-do with its owner, due date and status on the Solve tab', async () => {
    const user = userEvent.setup();
    renderDialog();
    // A Solved issue opens on the Solve tab; clicking it again keeps the test independent of that.
    await user.click(screen.getByRole('tab', { name: /solve/i }));

    const list = await screen.findByTestId('issue-todos');
    expect(within(list).getByText('Cancel unused subscriptions')).toBeInTheDocument();
    expect(within(list).getByText('Review GHL plan')).toBeInTheDocument();
    expect(within(list).getAllByText(/Ada Lovelace/).length).toBe(2);
    expect(within(list).getByText(/20\/10\/2026/)).toBeInTheDocument();
    expect(within(list).getByText('Open')).toBeInTheDocument();
    expect(within(list).getByText('Done')).toBeInTheDocument();
  });

  it('shows no list when the issue has no to-dos', async () => {
    orderMock.mockResolvedValue({ data: [], error: null });
    renderDialog();
    await vi.waitFor(() => expect(orderMock).toHaveBeenCalled());
    expect(screen.queryByTestId('issue-todos')).not.toBeInTheDocument();
  });
});
