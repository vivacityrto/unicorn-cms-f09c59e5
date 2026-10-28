import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RockCard } from '@/components/eos/rocks/RockCard';
import { buildContribution } from '@/utils/rockContribution';
import type { RockWithHierarchy } from '@/types/eos';

const state = vi.hoisted(() => ({ model: undefined as unknown }));

vi.mock('@/hooks/useRockContribution', () => ({ useRockContribution: () => ({ data: state.model, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/hooks/useMilestoneLinking', () => ({
  useLinkTargets: () => ({ data: [{ id: 'c1', title: 'M1 - Beta with five clients', status: 'in_progress', dueDate: null, tenantId: 6372 }], isLoading: false, isError: false, isFetchedAfterMount: true }),
  useLinkedCompanyIds: () => ({ data: [], isLoading: false, isError: false, isFetchedAfterMount: true }),
  useSetMilestoneLinks: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const rock = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, status: 'on_track', owner_id: null, due_date: '2026-12-31', quarter_year: 2026, quarter_number: 4, rock_level: 'individual', parent_rock_id: 'co', ...over,
});
state.model = buildContribution({
  companyRock: rock('co', { rock_level: 'company', parent_rock_id: null }) as never,
  companyMilestones: [{ id: 'c1', rock_id: 'co', title: 'M1 - Beta with five clients', status: 'in_progress', owner_id: null, due_date: null }],
  childRocks: [rock('i1', { title: 'EduCareer College' }) as never],
  childMilestones: [{ id: 'i1a', rock_id: 'i1', title: 'Application submission', status: 'not_started', owner_id: null, due_date: null }],
  links: [], blockers: [], carryovers: [], destinationRocks: [], destinationMilestones: [],
});

const company = {
  id: 'co', tenant_id: 6372, title: 'Strengthen client relationships', status: 'on_track', quarter_year: 2026, quarter_number: 4,
  due_date: '2026-12-31T00:00:00Z', created_at: '', updated_at: '', rock_level: 'company',
  children: [rock('i1', { title: 'EduCareer College' })], childStats: { total: 1, complete: 0, offTrack: 0, blocked: 0 },
} as unknown as RockWithHierarchy;

describe('RockCard: the mapping picker does not leak clicks to the card behind it', () => {
  it('does not open the Rock when the picker is used', () => {
    const onOpen = vi.fn();
    render(<RockCard rock={company} onOpen={onOpen} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Individual Rocks/ }));
    fireEvent.click(screen.getByRole('button', { name: /Expand EduCareer College/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Link to a Company milestone' }));

    const dialog = screen.getByRole('dialog', { name: 'Which Company milestones does this support?' });
    // A label click is the case that used to reach the card: it is not a button, link or input.
    fireEvent.click(within(dialog).getByText('Beta with five clients'));
    fireEvent.click(within(dialog).getByText(/Tick the Company milestones it helps deliver/));
    fireEvent.click(within(dialog).getByRole('heading', { name: 'Which Company milestones does this support?' }));

    expect(onOpen).not.toHaveBeenCalled();
    // And the picker's own behaviour still works: that click on the label ticked the box.
    expect(within(dialog).getByRole('checkbox', { name: /Beta with five clients/ })).toBeChecked();
  });

  it('still opens the Rock when the card itself is clicked', () => {
    const onOpen = vi.fn();
    render(<RockCard rock={company} onOpen={onOpen} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText('Due Dec 31'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
