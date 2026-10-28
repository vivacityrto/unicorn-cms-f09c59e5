import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndividualRocksSection } from '@/components/eos/rocks/contribution/IndividualRocksSection';
import { buildContribution, type ContributionInput, type ContributionMilestone, type ContributionRock } from '@/utils/rockContribution';

const state = vi.hoisted(() => ({
  result: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  enabledArgs: [] as boolean[],
}));

vi.mock('@/components/eos/rocks/linking/LinkMilestoneDialog', () => ({
  LinkMilestoneDialog: ({ milestone, rockTitle }: { milestone: { id: string }; rockTitle?: string }) => <div role="dialog" aria-label="Link dialog">{`linking ${milestone.id} in ${rockTitle}`}</div>,
}));

vi.mock('@/hooks/useRockContribution', () => ({
  useRockContribution: (_id: string, enabled: boolean) => {
    state.enabledArgs.push(enabled);
    return state.result;
  },
}));

const rock = (id: string, over: Partial<ContributionRock> = {}): ContributionRock => ({
  id, title: id, status: 'on_track', owner_id: 'u1', due_date: '2026-12-31', quarter_year: 2026, quarter_number: 4, rock_level: 'individual', parent_rock_id: 'co', ...over,
});
const ms = (id: string, rockId: string, status = 'in_progress', title = id): ContributionMilestone => ({ id, rock_id: rockId, title, status, owner_id: 'u1', due_date: '2026-11-30' });

const input = (over: Partial<ContributionInput> = {}): ContributionInput => ({
  companyRock: rock('co', { rock_level: 'company', parent_rock_id: null }),
  companyMilestones: [ms('c1', 'co', 'in_progress', 'M1 - Launch'), ms('c2', 'co', 'not_started', 'M2 - Train')],
  childRocks: [rock('i1', { title: 'Build the launch plan' }), rock('i2', { title: 'Vendor onboarding', status: 'blocked' })],
  childMilestones: [ms('i1a', 'i1', 'in_progress', 'Draft plan'), ms('i1b', 'i1', 'not_started', 'Loose end'), ms('i2a', 'i2', 'blocked', 'Get access')],
  links: [{ company_milestone_id: 'c1', individual_milestone_id: 'i1a' }, { company_milestone_id: 'c1', individual_milestone_id: 'i2a' }],
  blockers: [{ id: 'b1', rock_id: 'i2', milestone_id: null, reason: 'Vendor has not issued access', review_date: null }],
  carryovers: [],
  destinationRocks: [],
  destinationMilestones: [],
  ...over,
});

const names: Record<string, string> = { u1: 'Sam Owner' };
const getUserInfo = (id: string) => (names[id] ? { name: names[id] } : null);

const show = (model = buildContribution(input())) => {
  state.result = { data: model, isLoading: false, isError: false, refetch: vi.fn() };
};
const renderSection = (props: Partial<React.ComponentProps<typeof IndividualRocksSection>> = {}) => {
  const onOpenRock = vi.fn();
  render(<IndividualRocksSection companyRockId="co" getUserInfo={getUserInfo} onOpenRock={onOpenRock} {...props} />);
  return { onOpenRock };
};
const toggle = () => screen.getByRole('button', { name: /Individual Rocks/ });

beforeEach(() => {
  state.enabledArgs = [];
  show();
});

describe('IndividualRocksSection: collapsed', () => {
  it('is one compact line, loads nothing, and uses what the card already knows', () => {
    state.result = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    renderSection({ hint: { total: 2, blocked: 1 } });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveTextContent('2 Individual Rocks · 1 blocked');
    expect(state.enabledArgs.every(e => e === false)).toBe(true);
    expect(screen.queryByText('Build the launch plan')).toBeNull();
  });

  it('renders nothing for a Company Rock with no Individual Rocks and nothing loaded', () => {
    state.result = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    renderSection({ hint: { total: 0 } });
    expect(screen.queryByRole('button', { name: /Individual Rocks/ })).toBeNull();
  });
});

describe('IndividualRocksSection: expand and collapse', () => {
  it('opens with its own button, starts loading then, and closes again', () => {
    renderSection({ hint: { total: 2 } });
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(state.enabledArgs.at(-1)).toBe(true);
    expect(screen.getByText('Build the launch plan')).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Build the launch plan')).toBeNull();
  });

  it('does not trigger the click handler of the card around it', () => {
    const cardClick = vi.fn();
    render(
      <div onClick={cardClick}>
        <IndividualRocksSection companyRockId="co" getUserInfo={getUserInfo} hint={{ total: 2 }} />
      </div>,
    );
    fireEvent.click(toggle());
    expect(cardClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    expect(cardClick).not.toHaveBeenCalled();
  });

  it('can start open, as in the details panel', () => {
    renderSection({ defaultOpen: true });
    expect(screen.getByText('Build the launch plan')).toBeInTheDocument();
  });
});

describe('IndividualRocksSection: each Individual Rock', () => {
  it('shows owner, status, due date, progress and a blocker indicator on the row', () => {
    renderSection({ defaultOpen: true });
    const row = screen.getByText('Vendor onboarding').closest('li') as HTMLElement;
    expect(within(row).getByText('Sam Owner')).toBeInTheDocument();
    expect(within(row).getByText('Blocked')).toBeInTheDocument();
    expect(within(row).getByText(/Due 31 Dec/)).toBeInTheDocument();
    expect(within(row).getByText('0/1')).toBeInTheDocument();
  });

  it('expands inline to its milestones, each saying which Company milestone it supports', () => {
    renderSection({ defaultOpen: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    const item = screen.getByText('Draft plan').closest('li') as HTMLElement;
    expect(within(item).getByText('Supports')).toBeInTheDocument();
    expect(within(item).getByText('Launch')).toBeInTheDocument();
    expect(within(item).getByText('In progress')).toBeInTheDocument();
    expect(within(item).getByText('Sam Owner')).toBeInTheDocument();
    expect(within(item).getByText('30 Nov')).toBeInTheDocument();
  });

  it('calls out Individual milestones that are not linked to any Company milestone', () => {
    renderSection({ defaultOpen: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    const loose = screen.getByText('Loose end').closest('li') as HTMLElement;
    expect(within(loose).getByText('Not linked to any Company milestone')).toBeInTheDocument();
    expect(screen.getByText('1 unmapped')).toBeInTheDocument();
  });

  it('shows the reason on a blocked milestone and on a blocked Rock', () => {
    renderSection({ defaultOpen: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Vendor onboarding/ }));
    expect(screen.getAllByText(/Vendor has not issued access/)).not.toHaveLength(0);
  });

  it('opens the full Individual Rock from its header, without expanding the row', () => {
    const { onOpenRock } = renderSection({ defaultOpen: true });
    expect(screen.queryByRole('button', { name: /Collapse Build the launch plan/ })).toBeNull(); // still collapsed
    fireEvent.click(screen.getByRole('button', { name: 'Open the full Rock: Build the launch plan' }));
    expect(onOpenRock).toHaveBeenCalledWith('i1');
  });

  it('puts the link in the header only: expanding the row adds no second one', () => {
    renderSection({ defaultOpen: true });
    const before = screen.getAllByRole('button', { name: /^Open the full Rock/ }).length;
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    expect(screen.getAllByRole('button', { name: /^Open the full Rock/ })).toHaveLength(before);
  });

  it('shows no open link when nothing can open a Rock', () => {
    renderSection({ defaultOpen: true, onOpenRock: undefined });
    expect(screen.queryByRole('button', { name: /^Open the full Rock/ })).toBeNull();
  });

  it('says what is linked from the other side too: Company milestones and who delivers them', () => {
    renderSection({ defaultOpen: true });
    expect(screen.getByText('Company milestones and who delivers them')).toBeInTheDocument();
    const covered = screen.getByText('Launch', { selector: 'span' }).closest('li') as HTMLElement;
    expect(within(covered).getByText(/Delivered by Build the launch plan \(Draft plan\); Vendor onboarding \(Get access\)/)).toBeInTheDocument();
    expect(screen.getByText('No Individual work is linked to this milestone')).toBeInTheDocument();
  });
});

describe('IndividualRocksSection: carryover', () => {
  const withCarryover = () =>
    buildContribution(input({
      carryovers: [
        {
          carryover: { id: 'k1', tenant_id: 1, source_rock_id: 'i1', destination_rock_id: 'i1-q1', reason: 'Delay', carried_by: null, carried_at: '2026-12-20T00:00:00Z' },
          milestones: [{ id: 'p1', tenant_id: 1, carryover_id: 'k1', source_milestone_id: 'i1a', destination_milestone_id: 'i1a-q1', source_title: 'Draft plan', source_status: 'in_progress', source_due_date: null, new_due_date: null, created_at: '' }],
        },
        {
          carryover: { id: 'k2', tenant_id: 1, source_rock_id: 'co', destination_rock_id: 'co-q1', reason: 'Delay', carried_by: null, carried_at: '2026-12-20T00:00:00Z' },
          milestones: [],
        },
      ],
      destinationRocks: [
        rock('i1-q1', { title: 'Build the launch plan (Q1)', quarter_year: 2027, quarter_number: 1 }),
        rock('co-q1', { title: 'Grow revenue (Q1)', quarter_year: 2027, quarter_number: 1, rock_level: 'company' }),
      ],
      destinationMilestones: [ms('i1a-q1', 'i1-q1', 'not_started', 'Draft plan')],
    }));

  it('marks a carried Individual Rock on its row, and shows the destination Rock and carried milestones when expanded', () => {
    show(withCarryover());
    const { onOpenRock } = renderSection({ defaultOpen: true });
    const row = screen.getByText('Build the launch plan').closest('li') as HTMLElement;
    expect(within(row).getByText('Carried forward')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    expect(within(row).getByText('Q1 2027')).toBeInTheDocument();
    expect(within(row).getByText(/now not started/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Build the launch plan (Q1)' }));
    expect(onOpenRock).toHaveBeenCalledWith('i1-q1');
  });

  it('shows where the Company Rock itself was carried', () => {
    show(withCarryover());
    renderSection({ defaultOpen: true });
    expect(screen.getByRole('button', { name: 'Grow revenue (Q1)' })).toBeInTheDocument();
  });
});

describe('IndividualRocksSection: loading, empty and error', () => {
  it('shows a loading placeholder', () => {
    state.result = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderSection({ defaultOpen: true });
    expect(screen.getByLabelText('Loading Individual Rocks')).toBeInTheDocument();
  });

  it('says plainly when nothing cascades', () => {
    show(buildContribution(input({ childRocks: [], childMilestones: [], links: [], blockers: [] })));
    renderSection({ defaultOpen: true });
    expect(screen.getByText('No Individual Rocks cascade from this Company Rock yet.')).toBeInTheDocument();
  });

  it('reports an error and offers to retry', () => {
    const refetch = vi.fn();
    state.result = { data: undefined, isLoading: false, isError: true, refetch };
    renderSection({ defaultOpen: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Individual Rocks could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('says so when an Individual Rock has no milestones', () => {
    show(buildContribution(input({ childRocks: [rock('i1', { title: 'Empty one' })], childMilestones: [], links: [], blockers: [] })));
    renderSection({ defaultOpen: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Empty one/ }));
    expect(screen.getByText('This Individual Rock has no milestones yet.')).toBeInTheDocument();
  });
});

describe('IndividualRocksSection: linking to a Company milestone', () => {
  it('offers Link on an unmapped milestone and Change on a mapped one, only when linking is allowed', () => {
    renderSection({ defaultOpen: true, canLink: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    const loose = screen.getByText('Loose end').closest('li') as HTMLElement;
    expect(within(loose).getByRole('button', { name: 'Link to a Company milestone' })).toBeInTheDocument();
    const mapped = screen.getByText('Draft plan').closest('li') as HTMLElement;
    expect(within(mapped).getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('offers nothing when linking is not allowed', () => {
    renderSection({ defaultOpen: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    expect(screen.queryByRole('button', { name: 'Link to a Company milestone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('opens the link dialog for that milestone and Rock', () => {
    renderSection({ defaultOpen: true, canLink: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    const loose = screen.getByText('Loose end').closest('li') as HTMLElement;
    fireEvent.click(within(loose).getByRole('button', { name: 'Link to a Company milestone' }));
    expect(screen.getByRole('dialog', { name: 'Link dialog' })).toHaveTextContent('linking i1b in Build the launch plan');
  });

  it('does not offer to link finished work that is not mapped', () => {
    show(buildContribution(input({ childMilestones: [ms('i1a', 'i1', 'complete', 'Done thing')], links: [], blockers: [] })));
    renderSection({ defaultOpen: true, canLink: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand Build the launch plan/ }));
    const done = screen.getByText('Done thing').closest('li') as HTMLElement;
    expect(within(done).queryByRole('button')).toBeNull();
  });

  it('shows an Individual Rock that serves the Company Rock through a Team Rock, naming the team', () => {
    show(buildContribution(input({
      childRocks: [rock('t1', { rock_level: 'team', title: 'Client Rock – EduCareer', parent_rock_id: 'co' }), rock('i9', { title: 'EduCareer College', parent_rock_id: 't1' })],
      childMilestones: [ms('i9a', 'i9', 'not_started', 'Application submission')],
      links: [], blockers: [],
    })));
    renderSection({ defaultOpen: true });
    const row = screen.getByText('EduCareer College').closest('li') as HTMLElement;
    expect(within(row).getByText('via the Team Rock “Client Rock – EduCareer”')).toBeInTheDocument();
  });
});
