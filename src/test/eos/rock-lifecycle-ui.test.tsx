import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockLifecycleDialog } from '@/components/eos/rocks/RockLifecycleDialog';
import { ArchivedRocksPanel } from '@/components/eos/rocks/ArchivedRocksPanel';
import { RockHistory } from '@/components/eos/rocks/detail/RockHistory';
import type { RockImpact } from '@/utils/rockLifecycle';

const state = vi.hoisted(() => ({
  impact: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  archived: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
  history: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock('@/hooks/useRockLifecycle', () => ({
  useRockImpact: () => state.impact,
  useArchiveRock: () => ({ mutateAsync: state.archive, isPending: false }),
  useRestoreRock: () => ({ mutateAsync: state.restore, isPending: false }),
  useDeleteRock: () => ({ mutateAsync: state.remove, isPending: false }),
  useArchivedRocks: () => state.archived,
  useRockHistory: () => state.history,
}));

const impact = (over: Partial<RockImpact> = {}): RockImpact => ({
  rock: { id: 'r1', title: 'Grow revenue', level: 'company', archived_at: null, quarter_year: 2026, quarter_number: 4 },
  parent: null, children_active: 0, children_archived: 0, descendants_active: 0, linked_issues: 0,
  milestones: { total: 0, started: 0, complete: 0, with_evidence: 0 }, task_links: 0, milestone_links: 0, outcomes: 0,
  blockers: [], can_delete: true, ...over,
});

const open = (mode: 'archive' | 'delete' | 'restore') => {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<RockLifecycleDialog mode={mode} rockId="r1" onClose={onClose} onDone={onDone} />);
  return { onClose, onDone };
};

beforeEach(() => {
  state.impact = { data: impact(), isLoading: false, isError: false, error: null };
  state.archive.mockReset().mockResolvedValue({ archived: ['r1'] });
  state.restore.mockReset().mockResolvedValue({ restored: ['r1'] });
  state.remove.mockReset().mockResolvedValue(undefined);
  state.archived = { data: [], isLoading: false, isError: false, error: null };
  state.history = { data: undefined, isLoading: false, isError: false };
});

describe('RockLifecycleDialog: archive', () => {
  it('says what stays and what changes, and archives only this Rock by default', async () => {
    state.impact.data = impact({ descendants_active: 2, linked_issues: 1, milestones: { total: 3, started: 1, complete: 0, with_evidence: 0 } });
    const { onClose, onDone } = open('archive');
    expect(screen.getByRole('heading', { name: 'Archive this Rock?' })).toBeInTheDocument();
    expect(screen.getByText(/can be restored/)).toBeInTheDocument();
    expect(screen.getByText('2 Rocks that serve it stay active, and will no longer show under it.')).toBeInTheDocument();
    expect(screen.getByText('1 linked issue keeps the link.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(state.archive).toHaveBeenCalledWith({ id: 'r1', includeChildren: false }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onDone).toHaveBeenCalledWith('archive');
  });

  it('can archive the Rocks that serve it too, and updates the explanation', async () => {
    state.impact.data = impact({ descendants_active: 2 });
    open('archive');
    fireEvent.click(screen.getByRole('radio', { name: /Archive it and the 2 Rocks that serve it/ }));
    expect(screen.getByText('2 Rocks that serve it are archived with it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(state.archive).toHaveBeenCalledWith({ id: 'r1', includeChildren: true }));
  });

  it('offers no choice when nothing serves it', () => {
    open('archive');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('cannot be confirmed until the impact has loaded', () => {
    state.impact = { data: undefined, isLoading: true, isError: false, error: null };
    open('archive');
    expect(screen.getByRole('status')).toHaveTextContent('Checking what this touches');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
  });

  it('stays open and says why when the impact check fails', () => {
    state.impact = { data: undefined, isLoading: false, isError: true, error: new Error('Forbidden: staff only') };
    const { onClose } = open('archive');
    expect(screen.getByRole('alert')).toHaveTextContent('Forbidden: staff only');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when archiving fails', async () => {
    state.archive.mockRejectedValueOnce(new Error('nope'));
    const { onClose } = open('archive');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(state.archive).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('RockLifecycleDialog: delete', () => {
  it('refuses a Rock that holds something worth keeping, explains why, and offers to archive instead', async () => {
    state.impact.data = impact({ children_active: 2, linked_issues: 1, blockers: ['children', 'linked_issues'], can_delete: false });
    open('delete');
    expect(screen.getByRole('heading', { name: 'This Rock cannot be deleted' })).toBeInTheDocument();
    expect(screen.getByText('2 Rocks serve it.')).toBeInTheDocument();
    expect(screen.getByText('1 issue is linked to it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive instead' }));
    expect(screen.getByRole('heading', { name: 'Archive this Rock?' })).toBeInTheDocument();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('deletes a Rock with nothing attached, after saying it is permanent', async () => {
    state.impact.data = impact({ milestones: { total: 2, started: 0, complete: 0, with_evidence: 0 } });
    const { onDone } = open('delete');
    expect(screen.getByRole('heading', { name: 'Delete this Rock permanently?' })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('delete'));
  });
});

describe('RockLifecycleDialog: restore', () => {
  it('restores a Rock whose parent is active', async () => {
    state.impact.data = impact({ rock: { ...impact().rock, archived_at: '2026-10-01T00:00:00Z' } });
    open('restore');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(state.restore).toHaveBeenCalledWith({ id: 'r1', includeParents: false, includeChildren: false }));
  });

  it('says when its parent is archived and restores both', async () => {
    state.impact.data = impact({ parent: { id: 'p', title: 'Parent Rock', archived_at: '2026-10-01T00:00:00Z' } });
    open('restore');
    expect(screen.getByText(/It serves “Parent Rock”, which is archived/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore both' }));
    await waitFor(() => expect(state.restore).toHaveBeenCalledWith({ id: 'r1', includeParents: true, includeChildren: false }));
  });

  it('offers the Rocks archived together, ticked by default, and respects unticking', async () => {
    state.impact.data = impact({ children_archived: 2 });
    open('restore');
    const box = screen.getByRole('checkbox', { name: /archived at the same time/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(state.restore).toHaveBeenCalledWith({ id: 'r1', includeParents: false, includeChildren: false }));
  });
});

describe('ArchivedRocksPanel', () => {
  const rock = (over: Record<string, unknown>) => ({ id: 'a', title: 'Old Rock', level: 'team', quarterYear: 2026, quarterNumber: 3, ownerId: null, archivedAt: '2026-10-05T00:00:00Z', archivedBy: 'u1', ...over });

  it('explains an empty archive', () => {
    render(<ArchivedRocksPanel onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Nothing archived')).toBeInTheDocument();
  });

  it('lists archived Rocks with who archived them, and lets each be restored or deleted', () => {
    state.archived.data = [rock({ id: 'a', title: 'Old Rock' }), rock({ id: 'b', title: 'Another', archivedBy: null })];
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    render(<ArchivedRocksPanel onRestore={onRestore} onDelete={onDelete} getUserName={() => 'Carl'} />);
    expect(screen.getByText(/by Carl/)).toBeInTheDocument();
    expect(screen.getAllByText('Team')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /Restore/ })[0]);
    expect(onRestore).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Another' }));
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('filters by title', () => {
    state.archived.data = [rock({ id: 'a', title: 'Old Rock' }), rock({ id: 'b', title: 'Another' })];
    render(<ArchivedRocksPanel onRestore={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search archived Rocks'), { target: { value: 'anoth' } });
    expect(screen.queryByText('Old Rock')).not.toBeInTheDocument();
    expect(screen.getByText('Another')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search archived Rocks'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No archived Rock matches/)).toBeInTheDocument();
  });
});

describe('RockHistory', () => {
  it('is collapsed until opened, then reads as sentences', () => {
    state.history = { data: [
      { id: 2, action: 'updated', actor_user_id: 'u1', before_data: { status: 'on_track' }, after_data: { status: 'at_risk' }, occurred_at: '2026-10-20T00:00:00Z' },
      { id: 1, action: 'created', actor_user_id: 'u1', before_data: null, after_data: {}, occurred_at: '2026-10-01T00:00:00Z' },
    ], isLoading: false, isError: false };
    render(<RockHistory rockId="r1" nameOf={() => 'Carl'} />);
    expect(screen.queryByText(/created this Rock/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recent changes/ }));
    expect(screen.getByText('Carl changed the status from on track to at risk')).toBeInTheDocument();
    expect(screen.getByText('Carl created this Rock')).toBeInTheDocument();
  });

  it('says so when history is empty or not available', () => {
    state.history = { data: [], isLoading: false, isError: false };
    const { unmount } = render(<RockHistory rockId="r1" nameOf={() => 'Carl'} />);
    fireEvent.click(screen.getByRole('button', { name: /Recent changes/ }));
    expect(screen.getByText(/No changes recorded yet/)).toBeInTheDocument();
    unmount();
    state.history = { data: undefined, isLoading: false, isError: true };
    render(<RockHistory rockId="r1" nameOf={() => 'Carl'} />);
    fireEvent.click(screen.getByRole('button', { name: /Recent changes/ }));
    expect(screen.getByText(/not available yet/)).toBeInTheDocument();
  });
});
