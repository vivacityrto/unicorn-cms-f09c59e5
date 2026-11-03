import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkMilestoneDialog } from '@/components/eos/rocks/linking/LinkMilestoneDialog';

const state = vi.hoisted(() => ({
  targets: { data: undefined as unknown, isLoading: false, isError: false, isFetchedAfterMount: true },
  linked: { data: undefined as unknown, isLoading: false, isError: false, isFetchedAfterMount: true },
  save: vi.fn(),
  pending: false,
}));

vi.mock('@/hooks/useMilestoneLinking', () => ({
  useLinkTargets: () => state.targets,
  useLinkedCompanyIds: () => state.linked,
  useSetMilestoneLinks: () => ({ mutateAsync: state.save, isPending: state.pending }),
}));

const COMPANY = { id: 'co', title: 'Beta launch', level: 'company' as const };
const TEAM = { id: 'tm', title: 'Client Rock - Altaira', level: 'team' as const };

const target = (id: string, title: string, status = 'in_progress', dueDate: string | null = '2026-12-15', rockId = 'co') => ({ id, rockId, title, status, dueDate, tenantId: 6372 });

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<LinkMilestoneDialog open onOpenChange={onOpenChange} targetRocks={[COMPANY]} milestone={{ id: 'ind-1', title: 'M2 - Application submission' }} rockTitle="EduCareer College" />);
  return { onOpenChange };
}

beforeEach(() => {
  state.targets = { data: [target('c1', 'M1 - Beta with five clients'), target('c2', 'M2 - Support trained', 'not_started', null)], isLoading: false, isError: false, isFetchedAfterMount: true };
  state.linked = { data: [], isLoading: false, isError: false, isFetchedAfterMount: true };
  state.save.mockReset().mockResolvedValue(undefined);
  state.pending = false;
});

describe('LinkMilestoneDialog', () => {
  it('names the milestone and its Rock, and lists the milestones above with their status and date', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Which milestones does this support?' })).toBeInTheDocument();
    expect(screen.getByText(/Application submission.*in EduCareer College/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /M1.*Beta with five clients/ })).not.toBeChecked();
    expect(screen.getByText('Due 15 Dec')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('starts from what is already linked', () => {
    state.linked = { data: ['c2'], isLoading: false, isError: false, isFetchedAfterMount: true };
    renderDialog();
    expect(screen.getByRole('checkbox', { name: /M2.*Support trained/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /M1/ })).not.toBeChecked();
  });

  it('saves only what changed, for the right milestone and tenant, and closes', async () => {
    state.linked = { data: ['c2'], isLoading: false, isError: false, isFetchedAfterMount: true };
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /M1/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /M2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith({ individualMilestoneId: 'ind-1', tenantId: 6372, add: ['c1'], remove: ['c2'] }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('allows several Company milestones for one Individual milestone', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /M1/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /M2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0].add).toEqual(['c1', 'c2']);
  });

  it('will not save until something changes, and says what none ticked means', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save mapping' })).toBeDisabled();
    expect(screen.getByText(/stays unmapped/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /M1/ }));
    expect(screen.getByRole('button', { name: 'Save mapping' })).toBeEnabled();
    expect(screen.queryByText(/stays unmapped/)).toBeNull();
  });

  it('can unlink everything', async () => {
    state.linked = { data: ['c1'], isLoading: false, isError: false, isFetchedAfterMount: true };
    renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /M1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ add: [], remove: ['c1'] })));
  });

  it('stays open with the ticks intact when the database refuses', async () => {
    state.save.mockRejectedValueOnce(new Error('Individual milestone must belong to an Individual Rock under the linked Company Rock'));
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /M1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /M1/ })).toBeChecked();
  });

  it('says so when the Company Rock has no milestones', () => {
    state.targets = { data: [], isLoading: false, isError: false, isFetchedAfterMount: true };
    renderDialog();
    expect(screen.getByText(/Company Rock has no milestones yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save mapping' })).toBeDisabled();
  });

  it('shows loading, and an error without offering to save', () => {
    state.targets = { data: undefined, isLoading: true, isError: false, isFetchedAfterMount: false };
    const { unmount } = render(<LinkMilestoneDialog open onOpenChange={vi.fn()} targetRocks={[COMPANY]} milestone={{ id: 'x', title: 'X' }} />);
    expect(screen.getByLabelText('Loading milestones')).toBeInTheDocument();
    unmount();
    state.targets = { data: undefined, isLoading: false, isError: true, isFetchedAfterMount: true };
    render(<LinkMilestoneDialog open onOpenChange={vi.fn()} targetRocks={[COMPANY]} milestone={{ id: 'x', title: 'X' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getAllByRole('button', { name: 'Save mapping' }).every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('disables both actions while saving', () => {
    state.pending = true;
    renderDialog();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('groups the Team Rock’s milestones and the Company Rock’s, and can link to both at once', async () => {
    state.targets = {
      data: [target('t1', 'M1 - Altaira onboarded', 'not_started', null, 'tm'), target('c1', 'M1 - Beta with five clients')],
      isLoading: false, isError: false, isFetchedAfterMount: true,
    };
    const onOpenChange = vi.fn();
    render(<LinkMilestoneDialog open onOpenChange={onOpenChange} targetRocks={[TEAM, COMPANY]} milestone={{ id: 'ind-1', title: 'M2 - Application submission' }} />);

    expect(screen.getByRole('group', { name: /Team Rock: Client Rock - Altaira/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Company Rock: Beta launch/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Altaira onboarded/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Beta with five clients/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith({ individualMilestoneId: 'ind-1', tenantId: 6372, add: ['t1', 'c1'], remove: [] }));
  });

  it('says a Rock has no milestones yet while still offering the other one', () => {
    state.targets = { data: [target('c1', 'M1 - Beta with five clients')], isLoading: false, isError: false, isFetchedAfterMount: true };
    render(<LinkMilestoneDialog open onOpenChange={vi.fn()} targetRocks={[TEAM, COMPANY]} milestone={{ id: 'ind-1', title: 'M2 - X' }} />);
    expect(screen.getByRole('group', { name: /Team Rock/ })).toHaveTextContent('No milestones yet.');
    expect(screen.getByRole('checkbox', { name: /Beta with five clients/ })).toBeInTheDocument();
  });

  it('names the Team Rock when it is the only one above and has no milestones', () => {
    state.targets = { data: [], isLoading: false, isError: false, isFetchedAfterMount: true };
    render(<LinkMilestoneDialog open onOpenChange={vi.fn()} targetRocks={[TEAM]} milestone={{ id: 'ind-1', title: 'M2 - X' }} />);
    expect(screen.getByText(/Team Rock has no milestones yet/)).toBeInTheDocument();
  });
});
