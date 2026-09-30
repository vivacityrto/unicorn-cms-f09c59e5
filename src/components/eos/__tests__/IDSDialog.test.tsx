/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// The dialog is rendered with NO facilitator information at all (the prop no longer exists): what an
// ordinary attendee sees is exactly what the facilitator sees.

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'attendee-1', tenant_id: 6372 } }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/useEosOptions', () => ({
  useEosStatusTransitions: () => ({ data: [] }),
  isValidStatusTransition: () => true,
  getAllowedStatusTransitions: () => [],
}));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({ useVivacityTeamUsers: () => ({ data: [] }) }));
vi.mock('@/components/eos/ClientBadge', () => ({ ClientBadge: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { IDSDialog } from '@/components/eos/IDSDialog';
import type { EosIssue } from '@/types/eos';

const issue: EosIssue = {
  id: 'issue-1',
  tenant_id: 6372,
  title: 'Trial-to-paid conversion is flat',
  status: 'Open',
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
};

function renderDialog(overrides: Partial<EosIssue> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IDSDialog
          open
          onOpenChange={() => undefined}
          issue={{ ...issue, ...overrides }}
          meetingId="meeting-1"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('IDSDialog: every attendee can edit, not only the facilitator', () => {
  it('lets anyone start discussing an open issue', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /start discussing/i })).toBeInTheDocument();
  });

  it('lets anyone write discussion notes and move on to Solve', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('tab', { name: /discuss/i }));

    expect(screen.getByPlaceholderText(/add discussion notes/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: /move to solve/i })).toBeInTheDocument();
  });

  it('lets anyone write the solution, add to-dos and mark the issue solved', async () => {
    const user = userEvent.setup();
    renderDialog({ status: 'Discussing' });

    await user.click(screen.getByRole('tab', { name: /solve/i }));

    expect(screen.getByPlaceholderText(/describe the solution/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: /add to-do/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /mark as solved/i })).toBeInTheDocument();
  });

  it('explains that to-dos are saved immediately', async () => {
    const user = userEvent.setup();
    renderDialog({ status: 'Discussing' });

    await user.click(screen.getByRole('tab', { name: /solve/i }));

    expect(screen.getByText(/saved as soon as you add them/i)).toBeInTheDocument();
  });
});
