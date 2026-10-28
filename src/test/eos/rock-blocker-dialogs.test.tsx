import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockerDialog } from '@/components/eos/rocks/blockers/BlockerDialog';
import { BlockerDetails } from '@/components/eos/rocks/blockers/BlockerDetails';
import { ResolveBlockerDialog } from '@/components/eos/rocks/blockers/ResolveBlockerDialog';
import type { BlockerRow } from '@/utils/rockBlocker';

const state = vi.hoisted(() => ({ save: vi.fn(), resolve: vi.fn(), pending: false }));

vi.mock('@/hooks/useRockBlockers', () => ({
  useSetBlocker: () => ({ mutateAsync: state.save, isPending: state.pending }),
  useResolveBlocker: () => ({ mutateAsync: state.resolve, isPending: state.pending }),
}));

const blocker = (over: Partial<BlockerRow> = {}): BlockerRow => ({
  id: 'b1', tenant_id: 6372, rock_id: 'rock-1', milestone_id: null, reason: 'Waiting on the vendor', dependency_note: 'Sandbox access',
  depends_on_rock_id: null, depends_on_milestone_id: null, next_action: 'Chase the vendor', next_action_owner_id: 'u2',
  review_date: '2099-01-10', evidence_url: 'https://example.com/ticket/1', status_before: 'at_risk', recorded_by: 'u1',
  recorded_at: '2026-10-28T00:00:00Z', resolved_at: null, resolved_by: null, resolution_note: null, ...over,
});

const people = [{ id: 'u2', label: 'Khian Sismundo' }];
const renderDialog = (props: Partial<React.ComponentProps<typeof BlockerDialog>> = {}) => {
  const onOpenChange = vi.fn();
  render(
    <BlockerDialog
      open
      onOpenChange={onOpenChange}
      subject="rock"
      subjectId="rock-1"
      subjectLabel="Grow revenue"
      existing={null}
      people={people}
      rockOptions={[]}
      milestoneOptions={[]}
      {...props}
    />,
  );
  return { onOpenChange };
};

beforeEach(() => {
  state.save.mockReset().mockResolvedValue({ blocker_id: 'b1', created: true });
  state.resolve.mockReset().mockResolvedValue({ status: 'on_track' });
  state.pending = false;
});

describe('BlockerDialog: recording a blocker', () => {
  it('names what is being blocked and says what saving does', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Mark as blocked' })).toBeInTheDocument();
    expect(screen.getByText(/“Grow revenue”/)).toBeInTheDocument();
    expect(screen.getByText(/not marked off track or complete/i)).toBeInTheDocument();
  });

  it('puts the cursor in the reason, because it is the only required field', () => {
    renderDialog();
    expect(screen.getByLabelText(/What is blocking it/)).toHaveFocus();
  });

  it('refuses to save without a reason, explains why, keeps focus on it, and sends nothing', async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as blocked' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(/what is blocking/i);
    expect(screen.getByLabelText(/What is blocking it/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/What is blocking it/)).toHaveFocus();
    expect(state.save).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('treats a reason of only spaces as missing', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/What is blocking it/), '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as blocked' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('saves the recorded detail for the right subject and closes', async () => {
    const { onOpenChange } = renderDialog({ subject: 'milestone', subjectId: 'm-1', subjectLabel: 'M2 Train' });
    await userEvent.type(screen.getByLabelText(/What is blocking it/), 'Vendor has not issued access');
    await userEvent.type(screen.getByLabelText(/Next action/), 'Chase the vendor');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as blocked' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const call = state.save.mock.calls[0][0];
    expect(call.subject).toBe('milestone');
    expect(call.id).toBe('m-1');
    expect(call.form).toMatchObject({ reason: 'Vendor has not issued access', nextAction: 'Chase the vendor', dependencyKind: 'none' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('rejects a link that is not http or https and a past review date', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/What is blocking it/), 'Vendor');
    await userEvent.type(screen.getByLabelText(/Supporting link/), 'javascript:alert(1)');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as blocked' }));
    expect(await screen.findByText(/full link that starts with http/i)).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('stays open and keeps what was typed when the save fails', async () => {
    state.save.mockRejectedValueOnce(new Error('nope'));
    const { onOpenChange } = renderDialog();
    await userEvent.type(screen.getByLabelText(/What is blocking it/), 'Vendor delay');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as blocked' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/What is blocking it/)).toHaveValue('Vendor delay');
  });

  it('disables the actions while saving', () => {
    state.pending = true;
    renderDialog();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark as blocked' })).toBeDisabled();
  });
});

describe('BlockerDialog: editing and clearing', () => {
  it('opens on what was recorded', () => {
    renderDialog({ existing: blocker() });
    expect(screen.getByRole('heading', { name: 'Edit blocker' })).toBeInTheDocument();
    expect(screen.getByLabelText(/What is blocking it/)).toHaveValue('Waiting on the vendor');
    expect(screen.getByLabelText(/Next action/)).toHaveValue('Chase the vendor');
    expect(screen.getByLabelText(/Check again on/)).toHaveValue('2099-01-10');
    expect(screen.getByLabelText(/Supporting link/)).toHaveValue('https://example.com/ticket/1');
  });

  it('sends cleared fields as empty so the server clears them, and still needs the reason', async () => {
    const { onOpenChange } = renderDialog({ existing: blocker() });
    await userEvent.clear(screen.getByLabelText(/Next action/));
    await userEvent.clear(screen.getByLabelText(/Supporting link/));
    fireEvent.click(screen.getByRole('button', { name: 'Save blocker' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0].form).toMatchObject({ nextAction: '', evidenceUrl: '', reason: 'Waiting on the vendor' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    state.save.mockClear();
    await userEvent.clear(screen.getByLabelText(/What is blocking it/));
    fireEvent.click(screen.getByRole('button', { name: 'Save blocker' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('lets an old, unchanged review date be saved even though it is in the past', async () => {
    renderDialog({ existing: blocker({ review_date: '2020-01-01' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save blocker' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
  });
});

describe('ResolveBlockerDialog', () => {
  const open = (b: BlockerRow | null = blocker()) => {
    const onOpenChange = vi.fn();
    render(<ResolveBlockerDialog open onOpenChange={onOpenChange} subject="rock" subjectId="rock-1" subjectLabel="Grow revenue" blocker={b} />);
    return { onOpenChange };
  };

  it('says resolving does not complete the work, and never offers Complete', () => {
    open();
    expect(screen.getByText(/does not mark it complete/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /complete/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /blocked/i })).toBeNull();
    expect(screen.getAllByRole('radio').map(r => r.getAttribute('value'))).toEqual(['not_started', 'on_track', 'at_risk', 'off_track']);
  });

  it('preselects what it was before the block', () => {
    open();
    expect(screen.getByRole('radio', { name: /At risk/ })).toBeChecked();
    expect(screen.getByText('(what it was before)')).toBeInTheDocument();
  });

  it('resolves with the chosen status and note, then closes', async () => {
    const { onOpenChange } = open();
    fireEvent.click(screen.getByRole('radio', { name: /On track/ }));
    await userEvent.type(screen.getByLabelText(/How it was resolved/), 'Access arrived');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await waitFor(() => expect(state.resolve).toHaveBeenCalledWith({ subject: 'rock', id: 'rock-1', status: 'on_track', note: 'Access arrived' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open when resolving fails', async () => {
    state.resolve.mockRejectedValueOnce(new Error('nope'));
    const { onOpenChange } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await waitFor(() => expect(state.resolve).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('falls back to a safe default when the earlier status is no longer a valid choice', () => {
    open(blocker({ status_before: null }));
    expect(screen.getByRole('radio', { name: /On track/ })).toBeChecked();
  });
});

describe('BlockerDetails', () => {
  const nameOf = (id: string | null) => ({ u1: 'Carl', u2: 'Khian Sismundo' } as Record<string, string>)[id ?? ''] ?? null;

  it('shows everything recorded, in words as well as colour', () => {
    render(
      <BlockerDetails
        blocker={blocker()}
        todayIso="2099-01-05"
        nameOf={nameOf}
        dependency={{ kind: 'Rock', label: 'Vendor onboarding (Q4 2026)', onOpen: vi.fn() }}
        canManage
        onEdit={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Waiting on the vendor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendor onboarding (Q4 2026)' })).toBeInTheDocument();
    expect(screen.getByText('Sandbox access')).toBeInTheDocument();
    expect(screen.getByText('Chase the vendor')).toBeInTheDocument();
    expect(screen.getByText(/Owned by Khian Sismundo/)).toBeInTheDocument();
    expect(screen.getByText('Next check')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open link/ })).toHaveAttribute('href', 'https://example.com/ticket/1');
    expect(screen.getByText(/Recorded 28 Oct 2026 by Carl/)).toBeInTheDocument();
    expect(screen.getByText(/was at risk before/)).toBeInTheDocument();
  });

  it('calls out an overdue check and offers edit and resolve only to people who can manage', () => {
    const { rerender } = render(<BlockerDetails blocker={blocker({ review_date: '2020-01-01' })} todayIso="2099-01-05" nameOf={nameOf} canManage onEdit={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getByText('Check overdue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit blocker/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resolve/ })).toBeInTheDocument();
    rerender(<BlockerDetails blocker={blocker()} todayIso="2099-01-05" nameOf={nameOf} canManage={false} />);
    expect(screen.queryByRole('button', { name: /Edit blocker/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resolve/ })).toBeNull();
  });

  it('never renders an unsafe evidence link', () => {
    render(<BlockerDetails blocker={blocker({ evidence_url: 'javascript:alert(1)' })} todayIso="2099-01-05" nameOf={nameOf} canManage={false} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('keyboard focus', () => {
  it('returns focus to the control that opened the dialog when it closes', async () => {
    const { useState } = await import('react');
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open blocker</button>
          <BlockerDialog open={open} onOpenChange={setOpen} subject="rock" subjectId="r1" subjectLabel="Grow revenue" existing={null} people={[]} rockOptions={[]} milestoneOptions={[]} />
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open blocker' });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/What is blocking it/)).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });
});
