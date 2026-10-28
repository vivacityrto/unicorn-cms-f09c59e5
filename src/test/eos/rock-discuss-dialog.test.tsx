import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockDiscussDialog } from '@/components/eos/meeting/discuss/RockDiscussDialog';
import { buildMeetingRocksCascade } from '@/utils/meetingRocksCascade';
import type { RockWithHierarchy } from '@/types/eos';

const state = vi.hoisted(() => ({
  setStatus: vi.fn(),
  raise: vi.fn(),
  milestones: [] as unknown[],
  issues: [] as unknown[],
  issuesQuery: { data: [] as unknown, isLoading: false, isError: false } as { data: unknown; isLoading: boolean; isError: boolean },
  blockers: [] as unknown[],
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'u1' } }) }));
vi.mock('@/hooks/useRockDiscussion', () => ({
  useSetRockStatus: () => ({ mutateAsync: state.setStatus, isPending: false, variables: undefined }),
  useRaiseRockIssue: () => ({ mutateAsync: state.raise, isPending: false }),
  useRockMilestones: () => ({ data: state.milestones, isLoading: false, isError: false }),
  useRockLinkedIssues: () => state.issuesQuery,
  useOpenIssueRockIds: () => ({ data: [] }),
}));
vi.mock('@/hooks/useRockBlockers', () => ({
  useRockBlockers: () => ({ data: state.blockers, isLoading: false, isError: false }),
  useSetBlocker: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResolveBlocker: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useRockCarryover', () => ({ useRockCarryover: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock('@/hooks/useRockEditorData', () => ({ useEditorRocks: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock('@/hooks/useRockLifecycle', () => ({ useRockHistory: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({ useVivacityTeamUsers: () => ({ data: [] }) }));
vi.mock('@/components/eos/ClientBadge', () => ({ ClientBadge: () => null }));
vi.mock('@/components/eos/rocks/contribution/IndividualRocksSection', () => ({
  IndividualRocksSection: () => <div>Individual Rocks stub</div>,
}));

const NOW = new Date('2026-10-28T00:00:00Z');
const bd = (over: Record<string, number> = {}) => ({ total: 4, complete: 1, inProgress: 1, blocked: 0, offTrack: 0, notStarted: 2, overdue: 0, ...over });
const rock = (id: string, title: string, status: string, over: Partial<RockWithHierarchy> = {}): RockWithHierarchy =>
  ({
    id, tenant_id: 6372, title, status, quarter_year: 2026, quarter_number: 4, due_date: '2099-12-31T00:00:00Z', owner_id: 'u1',
    rock_level: 'company', parent_rock_id: null, milestoneBreakdown: bd(), created_at: '', updated_at: '', ...over,
  }) as RockWithHierarchy;

const owners = { u1: 'Ana', u2: 'Ben' };
const make = (rocks: RockWithHierarchy[], scope = ['company']) => buildMeetingRocksCascade(rocks, scope, owners, NOW).roots;

const RA = rock('a', 'Alpha tidy-up', 'on_track', { owner_id: 'u1' });
// Owners are chosen so the deck order (by owner, then title) is Alpha, Bravo, Charlie.
const RB = rock('b', 'Bravo hiring', 'off_track', { owner_id: 'u1' });
const RC = rock('c', 'Charlie portal', 'on_track', { owner_id: 'u2' });

function renderDialog(rocks = [RA, RB, RC], props: Partial<React.ComponentProps<typeof RockDiscussDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onOpenDetails = vi.fn();
  const onIssueRaised = vi.fn();
  const ui = (roots = make(rocks)) => (
    <RockDiscussDialog
      open
      onOpenChange={onOpenChange}
      roots={roots}
      ownerNames={owners}
      quarterLabel="Q4 2026"
      meeting={{ id: 'meet-1', segmentId: 'seg-rocks', type: 'L10', onIssueRaised }}
      onOpenDetails={onOpenDetails}
      {...props}
    />
  );
  const view = render(ui());
  return { ...view, ui, onOpenChange, onOpenDetails, onIssueRaised };
}

const heading = () => document.querySelector('[data-slide-heading]') as HTMLElement;

beforeEach(() => {
  state.setStatus.mockReset().mockResolvedValue(undefined);
  state.raise.mockReset().mockResolvedValue({ id: 'issue-1' });
  state.milestones = [];
  state.issues = [];
  state.issuesQuery = { data: [], isLoading: false, isError: false };
  state.blockers = [];
});

describe('RockDiscussDialog: the deck', () => {
  it('opens on the first Rock, says where you are, and puts focus on the Rock, not on a button', () => {
    renderDialog();
    expect(heading()).toHaveTextContent('Alpha tidy-up');
    expect(screen.getByText('Rock Review · Q4 2026')).toBeInTheDocument();
    expect(screen.getByText(/of 3/)).toHaveTextContent('1 of 3');
    expect(heading()).toHaveFocus();
  });

  it('asks the one question that suits the status, and says why in words', () => {
    renderDialog();
    expect(screen.getByText('Confirm it is on track and move on.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(heading()).toHaveTextContent('Bravo hiring');
    expect(screen.getByText(/Do not solve it here/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Flags' })).getByText('Off track')).toBeInTheDocument();
  });

  it('moves with Next and Previous, and Previous is off on the first Rock', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(heading()).toHaveTextContent('Charlie portal');
    expect(screen.getAllByRole('button', { name: 'Wrap-up' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(heading()).toHaveTextContent('Bravo hiring');
  });

  it('moves with the arrow keys, Home and End', async () => {
    renderDialog();
    await userEvent.keyboard('{ArrowRight}');
    expect(heading()).toHaveTextContent('Bravo hiring');
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    expect(heading()).toHaveTextContent('Bravo hiring');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('region', { name: 'Wrap-up' })).toBeInTheDocument();
    await userEvent.keyboard('{Home}');
    expect(heading()).toHaveTextContent('Alpha tidy-up');
  });

  it('does not hijack the arrow keys while someone is typing', async () => {
    renderDialog([RB, RA], { startAtRockId: 'b' });
    const title = screen.getByLabelText('Issue');
    title.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(heading()).toHaveTextContent('Bravo hiring');
  });

  it('leaves on Escape', async () => {
    const { onOpenChange } = renderDialog();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('jumps from the rail, which names each Rock and marks the current one', () => {
    renderDialog();
    const rail = screen.getByRole('navigation', { name: 'Rocks in this review' });
    fireEvent.click(within(rail).getByRole('button', { name: /Rock 3: Charlie portal/ }));
    expect(heading()).toHaveTextContent('Charlie portal');
    expect(within(rail).getByRole('button', { name: /Rock 3/ })).toHaveAttribute('aria-current', 'step');
  });

  it('starts on a chosen Rock', () => {
    renderDialog([RA, RB, RC], { startAtRockId: 'c' });
    expect(heading()).toHaveTextContent('Charlie portal');
  });

  it('can keep only the Rocks that need the room, and says so when there are none', () => {
    renderDialog([RA, RB, RC]);
    fireEvent.click(screen.getByRole('button', { name: /Needs the room/ }));
    expect(heading()).toHaveTextContent('Bravo hiring');
    expect(screen.queryByRole('button', { name: /Rock 2:/ })).toBeNull();
  });

  it('says plainly when nothing needs the room or nothing is under review', () => {
    renderDialog([RA, RC], { startAttentionOnly: true });
    expect(heading()).toHaveTextContent('Nothing needs the room');
    fireEvent.click(screen.getByRole('button', { name: 'Show all Rocks' }));
    expect(heading()).toHaveTextContent('Alpha tidy-up');
  });

  it('shows an empty state for no Rocks', () => {
    renderDialog([]);
    expect(heading()).toHaveTextContent('No Rocks to review');
  });

  it('does not move a Rock out from under the room when its status changes', () => {
    const view = renderDialog([RA, RB, RC], { startAttentionOnly: true });
    expect(heading()).toHaveTextContent('Bravo hiring');
    // Bravo is now on track, so it would no longer "need the room", but the slide stays.
    view.rerender(view.ui(make([RA, { ...RB, status: 'on_track' }, RC])));
    expect(heading()).toHaveTextContent('Bravo hiring');
    expect(screen.getByText('Confirm it is on track and move on.')).toBeInTheDocument();
  });

  it('mounts nothing, and so fetches nothing, while closed', () => {
    const { container } = render(
      <RockDiscussDialog open={false} onOpenChange={vi.fn()} roots={make([RA])} ownerNames={owners} quarterLabel="Q4 2026" onOpenDetails={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RockDiscussDialog: the status decision', () => {
  it('confirms the current status without changing anything', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'On track' }));
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(state.setStatus).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Rock 1: Alpha tidy-up \(done\)/ })).toBeInTheDocument();
  });

  it('changes the status when another is pressed, and records that it changed', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Off track' }));
    await waitFor(() => expect(state.setStatus).toHaveBeenCalledWith({ id: 'a', status: 'off_track' }));
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
  });

  it('leaves the status alone and records nothing when the change fails', async () => {
    state.setStatus.mockRejectedValueOnce(new Error('nope'));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'At risk' }));
    await waitFor(() => expect(state.setStatus).toHaveBeenCalled());
    expect(screen.queryByText('Confirmed')).toBeNull();
  });

  it('offers Blocked only through a reason, never as a plain button, and never offers Complete', () => {
    renderDialog();
    const group = screen.getByRole('group', { name: 'Set the status' });
    expect(within(group).queryByRole('button', { name: /blocked/i })).toBeNull();
    expect(within(group).queryByRole('button', { name: /complete/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /It is blocked/ }));
    expect(screen.getByRole('dialog', { name: 'Mark as blocked' })).toBeInTheDocument();
  });

  it('shows a blocked Rock with its blocker, and resolving instead of status buttons', () => {
    state.blockers = [{
      id: 'bl', tenant_id: 6372, rock_id: 'b', milestone_id: null, reason: 'Vendor has not issued access', dependency_note: null, depends_on_rock_id: null,
      depends_on_milestone_id: null, next_action: 'Escalate', next_action_owner_id: null, review_date: null, evidence_url: null, status_before: 'on_track',
      recorded_by: null, recorded_at: '2026-10-27T00:00:00Z', resolved_at: null, resolved_by: null, resolution_note: null,
    }];
    renderDialog([rock('b', 'Bravo hiring', 'blocked')]);
    expect(screen.getByRole('region', { name: 'Blocker' })).toHaveTextContent('Vendor has not issued access');
    expect(screen.getByRole('button', { name: 'Resolve blocker…' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Set the status' })).toBeNull();
    expect(screen.getByText(/Resolving does not mark it complete/)).toBeInTheDocument();
  });

  it('shows a level that is not reviewed here read-only', () => {
    const individual = rock('i', 'Individual thing', 'on_track', { rock_level: 'individual', parent_rock_id: 'a' });
    const roots = make([RA, individual], ['company']);
    const withChild = roots[0];
    expect(withChild.children).toHaveLength(1);
    renderDialog([RA, individual]);
    expect(screen.getByText('Individual Rocks stub')).toBeInTheDocument();
  });
});

describe('RockDiscussDialog: raising an issue for IDS', () => {
  it('opens a drafted issue for a stuck Rock, with the facts already in it', async () => {
    renderDialog([RB]);
    const panel = screen.getByRole('region', { name: 'Raise an issue' });
    expect(within(panel).getByText('This one needs the room')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Issue')).toHaveValue('Bravo hiring: off track');
    fireEvent.click(within(panel).getByRole('button', { name: 'Add to IDS queue' }));
    await waitFor(() => expect(state.raise).toHaveBeenCalledTimes(1));
    const call = state.raise.mock.calls[0][0];
    expect(call).toMatchObject({ title: 'Bravo hiring: off track', rockId: 'b', meetingId: 'meet-1', meetingSegmentId: 'seg-rocks', meetingType: 'L10' });
    for (const line of ['Rock: Bravo hiring (Q4 2026)', 'Status: Off Track', 'Owner: Ana', 'Milestones: 1 of 4 done', 'Raised from the Rock Review.']) {
      expect(call.description).toContain(line);
    }
  });

  it('adds what the room has to decide, edits the title, and tells the other attendees', async () => {
    const { onIssueRaised } = renderDialog([RB]);
    await userEvent.clear(screen.getByLabelText('Issue'));
    await userEvent.type(screen.getByLabelText('Issue'), 'Hiring is behind');
    await userEvent.type(screen.getByLabelText(/What does the room need to decide/), 'Do we add budget?');
    fireEvent.click(screen.getByRole('button', { name: 'Add to IDS queue' }));
    await waitFor(() => expect(state.raise).toHaveBeenCalled());
    expect(state.raise.mock.calls[0][0].title).toBe('Hiring is behind');
    expect(state.raise.mock.calls[0][0].description.startsWith('To decide: Do we add budget?')).toBe(true);
    await waitFor(() => expect(onIssueRaised).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Added to the IDS queue\. It will be discussed there, not here\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rock 1: Bravo hiring \(done\)/ })).toBeInTheDocument();
  });

  it('keeps the form and tells nobody when raising fails', async () => {
    state.raise.mockRejectedValueOnce(new Error('nope'));
    const { onIssueRaised } = renderDialog([RB]);
    await userEvent.type(screen.getByLabelText(/What does the room need to decide/), 'Budget?');
    fireEvent.click(screen.getByRole('button', { name: 'Add to IDS queue' }));
    await waitFor(() => expect(state.raise).toHaveBeenCalled());
    expect(onIssueRaised).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/What does the room need to decide/)).toHaveValue('Budget?');
  });

  it('keeps a clean on-track Rock quiet, but still lets you raise something', () => {
    renderDialog([RA]);
    const panel = screen.getByRole('region', { name: 'Raise an issue' });
    expect(within(panel).getByText('Anything to raise?')).toBeInTheDocument();
    expect(within(panel).queryByLabelText('Issue')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Raise it for IDS' }));
    expect(within(panel).getByLabelText('Issue')).toHaveValue('Alpha tidy-up: needs discussion');
  });

  it('shows what is already waiting for IDS and asks for a deliberate second issue', () => {
    state.issuesQuery.data = [
      { id: 'i1', title: 'Hiring plan is late', status: 'Open', created_at: '2026-10-20T00:00:00Z', meeting_id: null },
      { id: 'i2', title: 'Old, solved thing', status: 'Solved', created_at: '2026-09-20T00:00:00Z', meeting_id: null },
    ];
    renderDialog([RB]);
    const panel = screen.getByRole('region', { name: 'Raise an issue' });
    expect(within(panel).getByText('Hiring plan is late')).toBeInTheDocument();
    expect(within(panel).queryByText('Old, solved thing')).toBeNull();
    expect(within(panel).queryByLabelText('Issue')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Raise another issue' }));
    expect(within(panel).getByLabelText('Issue')).toBeInTheDocument();
  });

  it('does not open the form, or invite a duplicate, while the existing-issue lookup is still loading', () => {
    state.issuesQuery = { data: undefined, isLoading: true, isError: false };
    renderDialog([RB]);
    const panel = screen.getByRole('region', { name: 'Raise an issue' });
    expect(within(panel).getByText('Checking for issues already raised…')).toBeInTheDocument();
    expect(within(panel).queryByLabelText('Issue')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Raise it for IDS' })).toBeDisabled();
  });

  it('warns, and waits for a deliberate click, when the existing-issue lookup failed', () => {
    state.issuesQuery = { data: undefined, isLoading: false, isError: true };
    renderDialog([RB]);
    const panel = screen.getByRole('region', { name: 'Raise an issue' });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Could not check for issues already raised');
    expect(within(panel).queryByLabelText('Issue')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Raise it for IDS' }));
    expect(within(panel).getByLabelText('Issue')).toBeInTheDocument();
  });

  it('opens by itself once the lookup has answered that there is nothing open', () => {
    renderDialog([RB]);
    expect(screen.getByLabelText('Issue')).toBeInTheDocument();
  });

  it('puts a blocker reason in the title and the blocker facts in the description', async () => {
    state.blockers = [{
      id: 'bl', tenant_id: 6372, rock_id: 'b', milestone_id: null, reason: 'Vendor has not issued access', dependency_note: null, depends_on_rock_id: null,
      depends_on_milestone_id: null, next_action: 'Escalate to the vendor', next_action_owner_id: 'u2', review_date: null, evidence_url: null, status_before: 'on_track',
      recorded_by: null, recorded_at: '2026-10-27T00:00:00Z', resolved_at: null, resolved_by: null, resolution_note: null,
    }];
    renderDialog([rock('b', 'Bravo hiring', 'blocked', { owner_id: 'u2' })]);
    expect(screen.getByLabelText('Issue')).toHaveValue('Bravo hiring: blocked: Vendor has not issued access');
    fireEvent.click(screen.getByRole('button', { name: 'Add to IDS queue' }));
    await waitFor(() => expect(state.raise).toHaveBeenCalled());
    expect(state.raise.mock.calls[0][0].description).toContain('Next action: Escalate to the vendor (Ben)');
  });
});

describe('RockDiscussDialog: wrap-up', () => {
  it('summarises the deck and calls out a stuck Rock nobody raised an issue for', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'On track' })); // confirm Alpha
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    const wrap = screen.getByRole('region', { name: 'Wrap-up' });
    expect(within(wrap).getByText('1 of 3 Rocks looked at.')).toBeInTheDocument();
    expect(within(wrap).getByRole('alert')).toHaveTextContent('Bravo hiring');
    expect(within(wrap).getByText('Confirmed')).toBeInTheDocument();
    expect(within(wrap).getByText('Not reached')).toBeInTheDocument();
  });

  it('lets you go back to the stuck Rock from the wrap-up', async () => {
    renderDialog();
    await userEvent.keyboard('{End}');
    fireEvent.click(screen.getByRole('button', { name: 'Go back to it' }));
    expect(heading()).toHaveTextContent('Bravo hiring');
  });

  it('stops nagging once an issue has been raised, and finishes cleanly', async () => {
    const { onOpenChange } = renderDialog([RB]);
    fireEvent.click(screen.getByRole('button', { name: 'Add to IDS queue' }));
    await waitFor(() => expect(state.raise).toHaveBeenCalled());
    await screen.findByText(/Added to the IDS queue/);
    await userEvent.keyboard('{End}');
    const wrap = screen.getByRole('region', { name: 'Wrap-up' });
    expect(within(wrap).queryByRole('alert')).toBeNull();
    expect(within(wrap).getByText('Raised for IDS')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens the full Rock from a slide', () => {
    const { onOpenDetails } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Open the full Rock/ }));
    expect(onOpenDetails).toHaveBeenCalledWith('a');
  });
});
