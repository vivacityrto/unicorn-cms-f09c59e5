import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingRocksReview } from '@/components/eos/meeting/MeetingRocksReview';
import type { RockWithHierarchy } from '@/types/eos';

const hierarchy = vi.hoisted(() => ({ rocks: [] as unknown[], isLoading: false }));

vi.mock('@/hooks/useEosRocksHierarchy', () => ({
  useEosRocksHierarchy: () => ({
    quarterRocks: hierarchy.rocks,
    isLoading: hierarchy.isLoading,
    currentQuarter: { year: 2026, quarter: 4 },
  }),
}));
vi.mock('@/components/eos/RockProgressControl', () => ({
  RockProgressControl: ({ rock }: { rock: { id: string; status: string } }) => (
    <div data-testid={`status-control-${rock.id}`}>{rock.status}</div>
  ),
}));
vi.mock('@/components/eos/facilitator/FacilitatorPrompts', () => ({
  RockReviewPrompt: () => <div data-testid="review-prompt" />,
  OffTrackRockPrompt: ({ rockTitle }: { rockTitle: string }) => <div>Off track prompt: {rockTitle}</div>,
}));
vi.mock('@/components/eos/facilitator/RocksInsights', () => ({
  RocksInsights: ({ rocks }: { rocks: unknown[] }) => <div data-testid="insights">{rocks.length} insights rocks</div>,
}));
vi.mock('@/components/eos/rocks/RockDetailSheet', () => ({
  RockDetailSheet: ({ rock, open, onEdit }: { rock: RockWithHierarchy | null; open: boolean; onEdit?: (r: RockWithHierarchy) => void }) =>
    open && rock ? (
      <div role="dialog" aria-label="Rock details">
        Details: {rock.title}
        <button onClick={() => onEdit?.(rock)}>Edit from details</button>
      </div>
    ) : null,
}));

const make = (overrides: Partial<RockWithHierarchy> & { id: string }): RockWithHierarchy => ({
  tenant_id: 6372,
  title: overrides.id,
  status: 'on_track',
  quarter_year: 2026,
  quarter_number: 4,
  due_date: '2099-12-31',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  rock_level: 'company',
  ...overrides,
});

const company = make({ id: 'c1', title: 'Harden RBAC', owner_id: 'u1', milestoneStats: { total: 4, complete: 1 } });
const team = make({ id: 't1', title: 'Team verification', rock_level: 'team', parent_rock_id: 'c1', owner_id: 'u2', status: 'at_risk' });
const individual = make({ id: 'i1', title: 'Inventory and containment', rock_level: 'individual', parent_rock_id: 't1', owner_id: 'u2', status: 'off_track' });
const owners = { u1: 'Carl Simpao', u2: 'Khian Sismundo' };

function renderReview(props: Partial<React.ComponentProps<typeof MeetingRocksReview>> = {}) {
  const onEditRock = vi.fn();
  render(<MeetingRocksReview scope={['company']} ownerNames={owners} onEditRock={onEditRock} {...props} />);
  return { onEditRock };
}

describe('MeetingRocksReview', () => {
  beforeEach(() => {
    hierarchy.rocks = [company, team, individual];
    hierarchy.isLoading = false;
  });

  it('shows the quarter, a status summary and the reviewed Company Rock with its cascade count', () => {
    renderReview();

    expect(screen.getByText('Q4 2026')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /1 On Track/ })).toBeInTheDocument();
    expect(screen.getByText('Harden RBAC')).toBeInTheDocument();
    expect(screen.getByText('2 cascaded')).toBeInTheDocument();
    expect(screen.getByText('1/4 milestones')).toBeInTheDocument();
    expect(screen.getByTestId('status-control-c1')).toBeInTheDocument();
  });

  it('shows direct children under the root by default as read-only context', () => {
    renderReview();

    expect(screen.getByText('Team verification')).toBeInTheDocument();
    // Out of the review scope: a read-only status badge, not the status control.
    expect(screen.queryByTestId('status-control-t1')).toBeNull();
    expect(screen.getByText('At Risk')).toBeInTheDocument();
    // Deeper levels start collapsed.
    expect(screen.queryByText('Inventory and containment')).toBeNull();
  });

  it('expands and collapses a branch', () => {
    renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Expand cascade for Team verification' }));
    expect(screen.getByText('Inventory and containment')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse cascade for Team verification' }));
    expect(screen.queryByText('Inventory and containment')).toBeNull();
  });

  it('supports expand all and collapse all', () => {
    renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('Inventory and containment')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Team verification')).toBeNull();
  });

  it('gives in-scope descendants a status control and the off-track prompt', () => {
    renderReview({ scope: ['company', 'team', 'individual'] });

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByTestId('status-control-t1')).toBeInTheDocument();
    expect(screen.getByTestId('status-control-i1')).toBeInTheDocument();
    expect(screen.getByText('Off track prompt: Inventory and containment')).toBeInTheDocument();
  });

  it('switches to the flat list with a parent breadcrumb and no expand controls', () => {
    renderReview({ scope: ['company', 'team'] });

    fireEvent.click(screen.getByRole('radio', { name: 'List view' }));

    const list = screen.getByRole('list', { name: 'Rocks under review' });
    expect(within(list).getByText('Harden RBAC')).toBeInTheDocument();
    expect(within(list).getByText('Team verification')).toBeInTheDocument();
    expect(within(list).getByText('From Harden RBAC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cascade for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull();
  });

  it('opens the read-only details when a Rock title is clicked, then hands off to edit', () => {
    const { onEditRock } = renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Open Rock: Harden RBAC' }));
    expect(screen.getByRole('dialog', { name: 'Rock details' })).toHaveTextContent('Details: Harden RBAC');
    expect(onEditRock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit from details' }));
    expect(onEditRock).toHaveBeenCalledExactlyOnceWith(company);
    expect(screen.queryByRole('dialog', { name: 'Rock details' })).toBeNull();
  });

  it('keeps the inline edit action separate from opening details', () => {
    const { onEditRock } = renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rock: Harden RBAC' }));

    expect(onEditRock).toHaveBeenCalledExactlyOnceWith(company);
    expect(screen.queryByRole('dialog', { name: 'Rock details' })).toBeNull();
  });

  it('flags an overdue Rock', () => {
    hierarchy.rocks = [make({ id: 'late', title: 'Late rock', due_date: '2020-01-01' })];
    renderReview();

    expect(screen.getByText(/Overdue · 1 Jan/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is under review', () => {
    hierarchy.rocks = [make({ id: 'done', status: 'complete' })];
    renderReview();

    expect(screen.getByText('No active rocks for Q4 2026')).toBeInTheDocument();
  });

  it('shows loading skeletons instead of the empty state while loading', () => {
    hierarchy.rocks = [];
    hierarchy.isLoading = true;
    renderReview();

    expect(screen.queryByText(/No active rocks/)).toBeNull();
  });

  it('feeds the facilitator insights the same scoped set it displays', () => {
    renderReview({ scope: ['company'] });

    expect(screen.getByTestId('insights')).toHaveTextContent('1 insights rocks');
  });
});
