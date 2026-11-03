import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { LinkMilestoneDialog } from '@/components/eos/rocks/linking/LinkMilestoneDialog';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'u1' } }) }));

/** A fake database whose links answer arrives after a delay, so the screen has to choose between the cache and the answer. */
vi.mock('@/integrations/supabase/client', () => {
  const targets = [
    { id: 'c-old', rock_id: 'co', title: 'M1 - Old', status: 'in_progress', due_date: null, tenant_id: 6372 },
    { id: 'c-new', rock_id: 'co', title: 'M2 - New', status: 'in_progress', due_date: null, tenant_id: 6372 },
  ];
  const builder = (rows: unknown[], delay: number) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) => new Promise(r => setTimeout(r, delay)).then(() => resolve({ data: rows, error: null }));
    return b;
  };
  return {
    supabase: {
      from: (table: string) => (table === 'eos_rock_milestones' ? builder(targets, 0) : builder([{ company_milestone_id: 'c-new' }], 60)),
    },
  };
});

describe('LinkMilestoneDialog never starts from a stale cached copy', () => {
  it('waits for the fresh answer instead of ticking what an earlier opening cached', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // An earlier opening left this behind, and the real links have since changed (c-old removed, c-new added elsewhere).
    client.setQueryData(['eos-rock-link-ids', 'ind-1'], ['c-old']);
    client.setQueryData(['eos-rock-link-targets', 'co'], [
      { id: 'c-old', rockId: 'co', title: 'M1 - Old', status: 'in_progress', dueDate: null, tenantId: 6372 },
      { id: 'c-new', rockId: 'co', title: 'M2 - New', status: 'in_progress', dueDate: null, tenantId: 6372 },
    ]);
    render(
      <QueryClientProvider client={client}>
        <LinkMilestoneDialog open onOpenChange={vi.fn()} targetRocks={[{ id: 'co', title: 'Company Rock', level: 'company' }]} milestone={{ id: 'ind-1', title: 'M1 - Application' }} />
      </QueryClientProvider>,
    );

    // While the fresh answer is on its way: loading, not the stale ticks.
    expect(screen.getByLabelText('Loading milestones')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save mapping' })).toBeDisabled();

    // Then the truth: c-new is linked, c-old is not.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /M2.*New/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /M1.*Old/ })).not.toBeChecked();
    // Nothing has changed yet, so a save would remove nothing.
    expect(screen.getByRole('button', { name: 'Save mapping' })).toBeDisabled();
  });
});
