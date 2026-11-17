import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import { RockWorkStrip } from '@/components/eos/rocks/detail/RockWorkStrip';
import type { RockWithHierarchy } from '@/types/eos';

const tableData = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, errors: {} as Record<string, unknown> }));
const statusUpdate = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'user-1' } }) }));
vi.mock('@/hooks/useEos', () => ({ useEosRocks: () => ({ rocks: [], isLoading: false, updateRock: statusUpdate }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const result = () => ({ data: (tableData.rows[table] ?? []).filter(row => filters.every(f => f(row as Record<string, unknown>))), error: tableData.errors[table] ?? null });
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; };
      builder.in = (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder; };
      builder.order = () => Promise.resolve(result());
      builder.then = (resolve: (value: unknown) => unknown) => resolve(result());
      return builder;
    },
  },
}));

const rock = (status: string): RockWithHierarchy => ({
  id: 'rock-1', tenant_id: 6372, title: 'Re-engage dormant leads', description: null, issue: null, outcome: null, status,
  quarter_year: 2099, quarter_number: 2, due_date: '2099-06-30T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-20T00:00:00.000Z', rock_level: 'individual', owner_id: 'user-1',
} as RockWithHierarchy);

const link = (id: string, todoId: string) => ({ id, todo_id: todoId, rock_id: 'rock-1', milestone_id: null });
const todoRow = (id: string, status: string, due = '2099-01-01') => ({ id, title: `To-Do ${id}`, status, due_date: due, owner_id: null });

function renderSheet(status: string, withEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RockDetailSheet rock={rock(status)} open onOpenChange={vi.fn()} onEdit={withEdit ? vi.fn() : undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  tableData.rows = {};
  tableData.errors = {};
  statusUpdate.mutate.mockClear();
});

describe('Rock panel: To-Do roll-up and status signals', () => {
  it('shows one To-Do figure for the Rock and warns when a Complete Rock still has open To-Dos', async () => {
    tableData.rows = {
      eos_rock_todo_links: [link('l1', 't1'), link('l2', 't2')],
      eos_todos: [todoRow('t1', 'Complete'), todoRow('t2', 'Open', '2020-01-01')],
    };
    renderSheet('complete');

    const strip = within(await screen.findByRole('region', { name: 'Rock work' }));
    expect(strip.getByText('1 of 2 done')).toBeInTheDocument();
    expect(strip.getByText('1 overdue')).toBeInTheDocument();
    expect(strip.getByText('This Rock is marked Complete, but 1 linked To-Do is still open, 1 overdue.')).toBeInTheDocument();
  });

  it('warns when an On Track Rock has an overdue To-Do', async () => {
    tableData.rows = { eos_rock_todo_links: [link('l1', 't1')], eos_todos: [todoRow('t1', 'Open', '2020-01-01')] };
    renderSheet('on_track');
    expect(await screen.findByText('This Rock is marked On Track, but 1 linked To-Do is overdue.')).toBeInTheDocument();
  });

  it('asks whether a Rock with no milestones is finished once every To-Do is done, and Mark Rock Complete changes only the status', async () => {
    tableData.rows = { eos_rock_todo_links: [link('l1', 't1'), link('l2', 't2')], eos_todos: [todoRow('t1', 'Complete'), todoRow('t2', 'Complete')] };
    renderSheet('on_track');

    expect(await screen.findByText('All 2 linked To-Dos are done. If the work is finished, mark the Rock Complete.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark Rock Complete' })[0]);
    expect(statusUpdate.mutate).toHaveBeenCalledTimes(1);
    expect(statusUpdate.mutate.mock.calls[0][0]).toMatchObject({ id: 'rock-1', status: 'complete' });
  });

  it('offers no action to someone who cannot edit the Rock, but still shows the line', async () => {
    tableData.rows = { eos_rock_todo_links: [link('l1', 't1')], eos_todos: [todoRow('t1', 'Complete')] };
    renderSheet('on_track', false);

    expect(await screen.findByText('The linked To-Do is done. If the work is finished, mark the Rock Complete.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Rock Complete' })).toBeNull();
  });

  it('does not ask whether the Rock is finished when it has milestones that are not done', async () => {
    tableData.rows = {
      eos_rock_todo_links: [link('l1', 't1')],
      eos_todos: [todoRow('t1', 'Complete')],
      eos_rock_milestones: [{ id: 'm1', rock_id: 'rock-1', title: 'M1 - Call the leads', status: 'in_progress', priority: 'medium', owner_id: null, due_date: null, exit_criteria: null, evidence_url: null, sort_order: 1, tenant_id: 6372 }],
    };
    renderSheet('on_track');

    await screen.findAllByText('Call the leads'); // the milestone's label, without its "M1 -" prefix
    const strip = within(await screen.findByRole('region', { name: 'Rock work' }));
    expect(strip.getByText('1 of 1 done')).toBeInTheDocument();
    expect(screen.queryByText(/linked To-Do is done|linked To-Dos are done/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark Rock Complete' })).toBeNull();
  });

  it('does not offer Mark Rock Complete when the milestones could not be loaded', async () => {
    tableData.rows = { eos_rock_todo_links: [link('l1', 't1')], eos_todos: [todoRow('t1', 'Complete')] };
    tableData.errors = { eos_rock_milestones: { message: 'boom' } };
    renderSheet('on_track');

    expect(await screen.findByText(/Milestones could not be loaded/)).toBeInTheDocument();
    const strip = within(await screen.findByRole('region', { name: 'Rock work' }));
    expect(strip.getByText('1 of 1 done')).toBeInTheDocument();
    expect(screen.queryByText(/linked To-Do is done|linked To-Dos are done/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark Rock Complete' })).toBeNull();
  });

  it('shows nothing extra for a Rock with no linked To-Dos', async () => {
    renderSheet('on_track');
    await screen.findByText('No milestones have been added to this Rock yet.');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rock work' })).toBeNull());
  });
});

describe('RockWorkStrip', () => {
  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<RockWorkStrip work={{ total: 0, done: 0, open: 0, overdue: 0, percent: null }} signals={[]} canChangeStatus />);
    expect(container.firstChild).toBeNull();
  });
});
