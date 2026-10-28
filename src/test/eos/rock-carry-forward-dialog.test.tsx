import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CarryForwardDialog } from '@/components/eos/rocks/carryover/CarryForwardDialog';

const state = vi.hoisted(() => ({
  carry: vi.fn(),
  rocks: { data: [] as unknown[], isLoading: false, isError: false },
}));

vi.mock('@/hooks/useRockCarryover', () => ({
  useCarryForwardRock: () => ({ mutateAsync: state.carry, isPending: false }),
}));
vi.mock('@/hooks/useRockEditorData', () => ({ useEditorRocks: () => state.rocks }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}) } }));

const milestones = [
  { id: 'm1', title: 'M1 - Draft the plan', status: 'in_progress', dueDate: '2026-11-30' },
  { id: 'm2', title: 'M2 - Train the team', status: 'not_started', dueDate: '2026-12-15' },
  { id: 'm3', title: 'M3 - Sign off scope', status: 'complete', dueDate: '2026-10-30' },
  { id: 'm4', title: 'M4 - Hand over', status: 'not_started', dueDate: '2026-12-20' },
];

const rock = { id: 'rock-1', title: 'Grow revenue', level: 'company', quarterYear: 2026, quarterNumber: 4, parentRockId: null };

function renderDialog(props: Partial<React.ComponentProps<typeof CarryForwardDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onOpenRock = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CarryForwardDialog
        open
        onOpenChange={onOpenChange}
        rock={rock}
        milestones={milestones}
        carriedMilestoneIds={new Set(['m4'])}
        carriedToRockIds={new Set()}
        onOpenRock={onOpenRock}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onOpenRock };
}

beforeEach(() => {
  state.carry.mockReset().mockResolvedValue({ carryover_id: 'c1', destination_rock_id: 'rock-q1', milestones_carried: 2 });
  state.rocks = { data: [], isLoading: false, isError: false };
});

describe('CarryForwardDialog', () => {
  it('offers only unfinished, not-yet-carried work, and says what happens to the rest', () => {
    renderDialog();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: /M1 · Draft the plan/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /M2 · Train the team/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /M3 · Sign off scope/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /M3 · Sign off scope/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /M4 · Hand over/ })).toBeDisabled();
    expect(screen.getByText(/Complete. Stays in Q4 2026, not copied/)).toBeInTheDocument();
    expect(screen.getByText('Already carried forward.')).toBeInTheDocument();
  });

  it('previews the effect before anything is saved, and updates as the selection changes', () => {
    renderDialog();
    const preview = () => screen.getByText('What will happen').parentElement as HTMLElement;
    expect(preview()).toHaveTextContent('2 milestones will be copied into a new Rock in Q1 2027 as new work.');
    expect(preview()).toHaveTextContent(/stay exactly as they are/);
    expect(preview()).toHaveTextContent(/not marked complete/);
    expect(preview()).toHaveTextContent(/1 completed milestone stays in Q4 2026/);
    fireEvent.click(screen.getByRole('checkbox', { name: /M2 · Train the team/ }));
    expect(preview()).toHaveTextContent('1 milestone will be copied');
  });

  it('defaults to the next quarter, with the quarter end as the new Rock’s due date', () => {
    renderDialog();
    expect(screen.getByLabelText('New Rock due')).toHaveValue('2027-03-31');
    expect(screen.getByLabelText('Quarter')).toHaveTextContent('Q1 2027');
  });

  it('will not carry without a reason', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    expect(await screen.findByText(/Say why this is being carried forward/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Why is this being carried forward/)).toHaveFocus();
    expect(state.carry).not.toHaveBeenCalled();
  });

  it('carries only the selected milestones, with their own new dates, and the reason', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/Why is this being carried forward/), 'Vendor delay pushed delivery');
    fireEvent.click(screen.getByRole('checkbox', { name: /M2 · Train the team/ }));
    fireEvent.change(document.getElementById('carry-d-m1') as HTMLInputElement, { target: { value: '2027-02-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    await waitFor(() => expect(state.carry).toHaveBeenCalledTimes(1));
    const { sourceRockId, form } = state.carry.mock.calls[0][0];
    expect(sourceRockId).toBe('rock-1');
    expect(form.destination).toMatchObject({ kind: 'new', year: 2027, quarter: 1, dueDate: '2027-03-31' });
    expect(form.selected).toEqual({ m1: '2027-02-10' });
    expect(form.reason).toBe('Vendor delay pushed delivery');
  });

  it('confirms, says the original is unchanged, and opens the new Rock on request', async () => {
    const { onOpenChange, onOpenRock } = renderDialog();
    await userEvent.type(screen.getByLabelText(/Why is this being carried forward/), 'Delay');
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    expect(await screen.findByRole('heading', { name: 'Carried forward' })).toBeInTheDocument();
    expect(screen.getByText(/2 milestones were copied/)).toBeInTheDocument();
    expect(screen.getByText(/unchanged/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the new Rock' }));
    expect(onOpenRock).toHaveBeenCalledWith('rock-q1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open with the form intact when the server refuses', async () => {
    state.carry.mockRejectedValueOnce(new Error('already carried'));
    renderDialog();
    await userEvent.type(screen.getByLabelText(/Why is this being carried forward/), 'Delay');
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    await waitFor(() => expect(state.carry).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Carried forward' })).toBeNull();
    expect(screen.getByLabelText(/Why is this being carried forward/)).toHaveValue('Delay');
  });

  it('can carry a Rock that has no milestones', async () => {
    renderDialog({ milestones: [] });
    expect(screen.getByText(/no milestones\. It can still be carried forward as a Rock/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Why is this being carried forward/), 'Delay');
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    await waitFor(() => expect(state.carry).toHaveBeenCalled());
    expect(state.carry.mock.calls[0][0].form.selected).toEqual({});
  });

  it('says so when no existing Rock fits, instead of offering a choice that would fail', () => {
    state.rocks = { data: [{ id: 'earlier', title: 'Earlier', level: 'company', quarterYear: 2026, quarterNumber: 3, parentId: null, archived: false }], isLoading: false, isError: false };
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'A Rock that already exists' }));
    expect(screen.getByText(/No later company Rock fits/)).toBeInTheDocument();
  });

  it('closes without saving on Cancel', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(state.carry).not.toHaveBeenCalled();
  });
});
