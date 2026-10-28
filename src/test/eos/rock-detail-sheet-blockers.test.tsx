import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import type { RockWithHierarchy } from '@/types/eos';
import type { BlockerRow } from '@/utils/rockBlocker';

const state = vi.hoisted(() => ({
  milestones: [] as unknown[],
  blockers: { data: [] as unknown[], isLoading: false, isError: false },
  carryover: { data: undefined as unknown, isLoading: false, isError: false },
  contribution: { data: undefined as unknown, isLoading: false, isError: false, refetch: () => undefined },
  save: vi.fn(),
  resolve: vi.fn(),
  carry: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'user-1' } }) }));
vi.mock('@/hooks/useRockBlockers', () => ({
  useRockBlockers: () => state.blockers,
  useSetBlocker: () => ({ mutateAsync: state.save, isPending: false }),
  useResolveBlocker: () => ({ mutateAsync: state.resolve, isPending: false }),
}));
vi.mock('@/hooks/useRockCarryover', () => ({
  useRockCarryover: () => state.carryover,
  useCarryForwardRock: () => ({ mutateAsync: state.carry, isPending: false }),
}));
vi.mock('@/hooks/useRockContribution', () => ({ useRockContribution: () => state.contribution }));
vi.mock('@/hooks/useMilestoneLinking', () => ({
  useLinkTargets: () => ({ data: [{ id: 'c1', title: 'M1 - Beta', status: 'in_progress', dueDate: null, tenantId: 6372 }], isLoading: false, isError: false }),
  useLinkedCompanyIds: () => ({ data: [], isLoading: false, isError: false }),
  useSetMilestoneLinks: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({
  VIVACITY_TENANT_ID: 6372,
  useVivacityTeamUsers: () => ({ data: [{ user_uuid: 'u-khian', first_name: 'Khian', last_name: 'Sismundo', email: 'k@example.com' }] }),
}));
vi.mock('@/hooks/useRockEditorData', () => ({
  useEditorRocks: () => ({
    data: [
      { id: 'rock-vendor', title: 'Vendor onboarding', level: 'company', quarterYear: 2026, quarterNumber: 4, archived: false, parentId: null },
      { id: 'rock-1', title: 'Grow revenue', level: 'company', quarterYear: 2026, quarterNumber: 4, archived: false, parentId: null },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const result = () => ({ data: table === 'eos_rock_milestones' ? state.milestones : [], error: null });
      for (const method of ['select', 'eq', 'in', 'or', 'is', 'order', 'limit']) builder[method] = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) => resolve(result());
      return builder;
    },
  },
}));

const baseRock: RockWithHierarchy = {
  id: 'rock-1', tenant_id: 6372, title: 'Grow revenue', status: 'on_track', quarter_year: 2026, quarter_number: 4,
  due_date: '2099-12-31T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
  rock_level: 'individual', owner_id: 'user-1',
};

const blocker = (over: Partial<BlockerRow> = {}): BlockerRow => ({
  id: 'b1', tenant_id: 6372, rock_id: 'rock-1', milestone_id: null, reason: 'Waiting on the vendor to issue access', dependency_note: null,
  depends_on_rock_id: 'rock-vendor', depends_on_milestone_id: null, next_action: 'Chase the vendor', next_action_owner_id: 'u-khian',
  review_date: '2020-01-01', evidence_url: null, status_before: 'on_track', recorded_by: 'user-1', recorded_at: '2026-10-28T00:00:00Z',
  resolved_at: null, resolved_by: null, resolution_note: null, ...over,
});

const names: Record<string, string> = { 'user-1': 'Sam Owner', 'u-khian': 'Khian Sismundo' };
const getUserInfo = (id: string) => (names[id] ? { name: names[id], initials: 'XX' } : null);

function renderSheet(props: Partial<React.ComponentProps<typeof RockDetailSheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenRock = vi.fn();
  const onEdit = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RockDetailSheet rock={baseRock} open onOpenChange={vi.fn()} getUserInfo={getUserInfo} onEdit={onEdit} onOpenRock={onOpenRock} {...props} />
    </QueryClientProvider>,
  );
  return { onOpenRock, onEdit };
}

beforeEach(() => {
  state.milestones = [];
  state.blockers = { data: [], isLoading: false, isError: false };
  state.carryover = { data: undefined, isLoading: false, isError: false };
  state.contribution = { data: undefined, isLoading: true, isError: false, refetch: () => undefined };
  state.save.mockReset().mockResolvedValue({});
  state.resolve.mockReset().mockResolvedValue({});
  state.carry.mockReset();
  window.localStorage.clear();
});

describe('RockDetailSheet: blocker', () => {
  it('shows an open blocker above the milestones, with the reason, dependency, next action and owner', async () => {
    state.blockers.data = [blocker()];
    renderSheet({ rock: { ...baseRock, status: 'blocked' } });
    const panel = screen.getByRole('region', { name: 'Blocker' });
    expect(within(panel).getByText('Waiting on the vendor to issue access')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Vendor onboarding (Q4 2026)' })).toBeInTheDocument();
    expect(within(panel).getByText('Chase the vendor')).toBeInTheDocument();
    expect(within(panel).getByText(/Owned by Khian Sismundo/)).toBeInTheDocument();
    expect(within(panel).getByText('Check overdue')).toBeInTheDocument();
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Mark as blocked' })).toBeNull();
  });

  it('opens the Rock a blocker depends on', () => {
    state.blockers.data = [blocker()];
    const { onOpenRock } = renderSheet({ rock: { ...baseRock, status: 'blocked' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vendor onboarding (Q4 2026)' }));
    expect(onOpenRock).toHaveBeenCalledWith('rock-vendor');
  });

  it('records a new blocker from the footer, and refuses to save without a reason', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as blocked' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark as blocked' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as blocked' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/What is blocking it/), { target: { value: 'Vendor delay' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as blocked' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0]).toMatchObject({ subject: 'rock', id: 'rock-1', form: { reason: 'Vendor delay' } });
  });

  it('edits the open blocker', async () => {
    state.blockers.data = [blocker()];
    renderSheet({ rock: { ...baseRock, status: 'blocked' } });
    fireEvent.click(screen.getByRole('button', { name: /Edit blocker/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit blocker' });
    expect(within(dialog).getByLabelText(/What is blocking it/)).toHaveValue('Waiting on the vendor to issue access');
  });

  it('resolves it without offering Complete', async () => {
    state.blockers.data = [blocker()];
    renderSheet({ rock: { ...baseRock, status: 'blocked' } });
    fireEvent.click(screen.getByRole('button', { name: /^Resolve/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolve this blocker' });
    expect(within(dialog).queryByRole('radio', { name: /complete/i })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve blocker' }));
    await waitFor(() => expect(state.resolve).toHaveBeenCalledWith({ subject: 'rock', id: 'rock-1', status: 'on_track', note: '' }));
  });

  it('keeps past blockers as history', () => {
    state.blockers.data = [blocker({ id: 'old', resolved_at: '2026-10-20T00:00:00Z', resolution_note: 'Access arrived', reason: 'An older problem' })];
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Past blockers \(1\)/ }));
    expect(screen.getByText('An older problem')).toBeInTheDocument();
    expect(screen.getByText('Access arrived')).toBeInTheDocument();
  });

  it('asks for the reason on a Rock that was blocked before reasons were recorded', () => {
    renderSheet({ rock: { ...baseRock, status: 'blocked' } });
    expect(screen.getByText('This Rock is blocked, but no reason was recorded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record the reason' })).toBeInTheDocument();
  });

  it('offers no change controls to someone who cannot edit', () => {
    state.blockers.data = [blocker()];
    renderSheet({ rock: { ...baseRock, status: 'blocked' }, onEdit: undefined });
    expect(screen.getByRole('region', { name: 'Blocker' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit blocker/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Resolve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as blocked' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Carry forward' })).toBeNull();
  });

  it('does not offer to block or carry a completed Rock', () => {
    renderSheet({ rock: { ...baseRock, status: 'complete' } });
    expect(screen.queryByRole('button', { name: 'Mark as blocked' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Carry forward' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Rock' })).toBeInTheDocument();
  });

  it('says when blocker details cannot be loaded, without hiding the Rock', () => {
    state.blockers = { data: [], isLoading: false, isError: true };
    renderSheet();
    expect(screen.getByText('Blocker details could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Grow revenue')).toBeInTheDocument();
  });

  it('keeps Edit Rock working', () => {
    const { onEdit } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rock' }));
    expect(onEdit).toHaveBeenCalled();
  });
});

describe('RockDetailSheet: milestone blockers', () => {
  const milestone = (id: string, title: string, status: string) => ({
    id, rock_id: 'rock-1', title, status, priority: 'medium', owner_id: null, due_date: null, exit_criteria: null, evidence_url: null, sort_order: 1, tenant_id: 6372,
  });

  it('shows the reason on a blocked milestone without expanding it', async () => {
    state.milestones = [milestone('m-1', 'M1 - Sign contract', 'blocked'), milestone('m-2', 'M2 - Train', 'in_progress')];
    state.blockers.data = [blocker({ id: 'bm', rock_id: null, milestone_id: 'm-1', reason: 'Legal has not signed off', depends_on_rock_id: null })];
    renderSheet();
    expect(await screen.findByText('Legal has not signed off')).toBeInTheDocument();
  });

  it('records a blocker on a milestone from its details', async () => {
    state.milestones = [milestone('m-2', 'M2 - Train', 'in_progress')];
    renderSheet();
    fireEvent.click(await screen.findByRole('button', { name: /M2 Train|Train/, expanded: false }));
    const details = document.getElementById('milestone-details-m-2') as HTMLElement;
    fireEvent.click(within(details).getByRole('button', { name: 'Mark as blocked' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark as blocked' });
    fireEvent.change(within(dialog).getByLabelText(/What is blocking it/), { target: { value: 'Trainer unavailable' } });
    const submit = within(dialog).getAllByRole('button', { name: 'Mark as blocked' }).at(-1) as HTMLElement;
    fireEvent.click(submit);
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0]).toMatchObject({ subject: 'milestone', id: 'm-2' });
  });
});

describe('RockDetailSheet: carryover', () => {
  const carryover = (direction: 'to' | 'from') => ({
    links: [{
      carryoverId: 'k1', direction, otherRockId: 'rock-q1', reason: 'Vendor delay', carriedAt: '2026-12-20T00:00:00Z', carriedBy: 'user-1',
      milestones: [{ id: 'p1', sourceMilestoneId: 'm-src', destinationMilestoneId: 'm-dst', sourceTitle: 'Draft plan', sourceStatus: 'in_progress', newDueDate: '2027-02-01' }],
    }],
    rocks: { 'rock-q1': { id: 'rock-q1', title: 'Grow revenue (continued)', status: 'not_started', rock_level: 'individual', quarter_year: 2027, quarter_number: 1, archived_at: null } },
    milestones: { 'm-dst': { id: 'm-dst', rock_id: 'rock-q1', title: 'Draft plan', status: 'not_started', due_date: '2027-02-01' }, 'm-src': { id: 'm-src', rock_id: 'rock-1', title: 'Draft plan', status: 'in_progress', due_date: null } },
    carriedSourceMilestoneIds: ['m-src'],
    carriedToRockIds: ['rock-q1'],
  });

  it('shows "Carried forward to" on the source, linking to the destination Rock and its milestones', () => {
    state.carryover.data = carryover('to');
    const { onOpenRock } = renderSheet();
    const section = screen.getByRole('region', { name: 'Carryover' });
    expect(within(section).getByText('Carried forward to')).toBeInTheDocument();
    expect(within(section).getByText('Q1 2027')).toBeInTheDocument();
    expect(within(section).getByText(/Vendor delay/)).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Grow revenue (continued)' }));
    expect(onOpenRock).toHaveBeenCalledWith('rock-q1');
    fireEvent.click(within(section).getByRole('button', { name: '1 milestone' }));
    expect(within(section).getByText(/new target 1 Feb 2027/)).toBeInTheDocument();
  });

  it('shows "Carried from" on the destination', () => {
    state.carryover.data = carryover('from');
    renderSheet({ rock: { ...baseRock, id: 'rock-q1', quarter_year: 2027, quarter_number: 1 } });
    expect(screen.getByText('Carried from')).toBeInTheDocument();
  });

  it('shows nothing when a Rock was never carried', () => {
    state.carryover.data = { links: [], rocks: {}, milestones: {}, carriedSourceMilestoneIds: [], carriedToRockIds: [] };
    renderSheet();
    expect(screen.queryByRole('region', { name: 'Carryover' })).toBeNull();
  });

  it('opens the carry forward dialog from the footer', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    expect(await screen.findByRole('dialog', { name: 'Carry forward' })).toBeInTheDocument();
  });
});

describe('RockDetailSheet: Company Rock', () => {
  it('shows its Individual Rocks, open by default, only for a Company Rock', () => {
    state.contribution = { data: undefined, isLoading: true, isError: false, refetch: () => undefined };
    renderSheet({ rock: { ...baseRock, rock_level: 'company' } });
    expect(screen.getByRole('button', { name: /Individual Rocks/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Loading Individual Rocks')).toBeInTheDocument();
  });

  it('is not shown on an Individual Rock', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: /Individual Rocks/ })).toBeNull();
  });
});

describe('RockDetailSheet: mapping an Individual milestone to a Company milestone', () => {
  const milestone = { id: 'm-9', rock_id: 'rock-1', title: 'M2 - Application submission', status: 'not_started', priority: 'medium', owner_id: null, due_date: null, exit_criteria: null, evidence_url: null, sort_order: 1, tenant_id: 6372 };

  const expandFirstMilestone = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Application submission/, expanded: false }));
    return document.getElementById('milestone-details-m-9') as HTMLElement;
  };

  it('offers Link in the milestone details when the Rock serves a Company Rock, and opens the picker', async () => {
    state.milestones = [milestone];
    renderSheet({ rock: { ...baseRock, parent_rock_id: 'rock-vendor' } });
    const details = await expandFirstMilestone();
    fireEvent.click(within(details).getByRole('button', { name: 'Link to a Company milestone' }));
    expect(await screen.findByRole('dialog', { name: 'Which Company milestones does this support?' })).toBeInTheDocument();
  });

  it('explains why there is nothing to link to when the Rock serves no Company Rock, and offers to edit it', async () => {
    state.milestones = [milestone];
    const { onEdit } = renderSheet();
    const details = await expandFirstMilestone();
    expect(within(details).getByText(/does not serve a Company or Team Rock yet/)).toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Link to a Company milestone' })).toBeNull();
    fireEvent.click(within(details).getByRole('button', { name: 'Edit this Rock' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('offers nothing to someone who cannot edit', async () => {
    state.milestones = [milestone];
    renderSheet({ rock: { ...baseRock, parent_rock_id: 'rock-vendor' }, onEdit: undefined });
    const details = await expandFirstMilestone();
    expect(within(details).queryByRole('button', { name: /Company milestone/ })).toBeNull();
  });
});
