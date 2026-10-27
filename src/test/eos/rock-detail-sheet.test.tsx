import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import type { EosRock, RockWithHierarchy } from '@/types/eos';

const mockMilestoneRows = vi.hoisted(() => ({ rows: [] as unknown[], error: null as unknown }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { user_uuid: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.order = () => Promise.resolve({ data: mockMilestoneRows.rows, error: mockMilestoneRows.error });
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: mockMilestoneRows.rows, error: mockMilestoneRows.error });
      return builder;
    },
  },
}));

const rock: RockWithHierarchy = {
  id: 'rock-1',
  tenant_id: 6372,
  title: 'Increase Revenue by 20%',
  description: 'Grow recurring revenue across the client base.',
  issue: 'Revenue has been flat for two quarters.',
  outcome: 'A repeatable sales motion.',
  status: 'on_track',
  quarter_year: 2026,
  quarter_number: 4,
  due_date: '2026-12-31T00:00:00.000Z',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-20T00:00:00.000Z',
  rock_level: 'company',
  owner_id: 'user-1',
  childStats: { total: 2, complete: 1, offTrack: 0 },
};

const child: EosRock = {
  ...rock,
  id: 'rock-2',
  title: 'Hire two account managers',
  rock_level: 'team',
  parent_rock_id: 'rock-1',
};

function renderSheet(props: Partial<React.ComponentProps<typeof RockDetailSheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RockDetailSheet
        rock={rock}
        open
        onOpenChange={vi.fn()}
        getUserInfo={() => ({ name: 'Sam Owner', initials: 'SO' })}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('RockDetailSheet', () => {
  beforeEach(() => {
    mockMilestoneRows.rows = [];
    mockMilestoneRows.error = null;
  });

  it('shows the Rock narrative, owner and status read-only', async () => {
    renderSheet();

    expect(screen.getByText('Increase Revenue by 20%')).toBeInTheDocument();
    expect(screen.getByText('On Track')).toBeInTheDocument();
    expect(screen.getByText('Sam Owner')).toBeInTheDocument();
    expect(screen.getByText('Grow recurring revenue across the client base.')).toBeInTheDocument();
    expect(screen.getByText('Revenue has been flat for two quarters.')).toBeInTheDocument();
    expect(screen.getByText('A repeatable sales motion.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(await screen.findByText('No milestones have been added to this Rock yet.')).toBeInTheDocument();
  });

  it('lists normalized milestones with progress and detail', async () => {
    mockMilestoneRows.rows = [
      { id: 'm1', rock_id: 'rock-1', title: 'Draft pipeline plan', status: 'complete', priority: 'high', owner_id: null, due_date: '2026-11-15', exit_criteria: 'Plan signed off', evidence_url: 'https://example.com/plan', sort_order: 0 },
      { id: 'm2', rock_id: 'rock-1', title: 'Launch outreach', status: 'in_progress', priority: 'medium', owner_id: null, due_date: null, exit_criteria: null, evidence_url: 'javascript:alert(1)', sort_order: 1 },
    ];
    renderSheet();

    expect(await screen.findByText('Draft pipeline plan')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 complete')).toBeInTheDocument();
    expect(screen.getByText('Launch outreach')).toBeInTheDocument();
    expect(screen.getByText('Plan signed off')).toBeInTheDocument();
    const evidenceLinks = screen.getAllByRole('link', { name: 'Evidence' });
    expect(evidenceLinks).toHaveLength(1);
    expect(evidenceLinks[0]).toHaveAttribute('href', 'https://example.com/plan');
  });

  it('falls back to legacy JSON milestones when none are normalized', async () => {
    renderSheet({
      rock: { ...rock, milestones: [{ id: 'l1', text: 'Legacy milestone', completed: true }] as never },
    });

    expect(await screen.findByText('Legacy milestone')).toBeInTheDocument();
    expect(screen.getByText('1 of 1 complete')).toBeInTheDocument();
  });

  it('shows cascade alignment for parent and child Rocks', async () => {
    renderSheet({
      rock: { ...rock, rock_level: 'team', parent_rock_id: 'parent-1' },
      parentRock: { ...rock, id: 'parent-1', title: 'Company growth' },
      childRocks: [child],
    });

    expect(await screen.findByText('Company growth')).toBeInTheDocument();
    expect(screen.getByText('Hire two account managers')).toBeInTheDocument();
    expect(screen.getByText('Cascades to (1)')).toBeInTheDocument();
  });

  it('routes Edit and View cascade through the supplied handlers', () => {
    const onEdit = vi.fn();
    const onViewCascade = vi.fn();
    const onOpenChange = vi.fn();
    renderSheet({ onEdit, onViewCascade, onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rock' }));
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(rock);

    fireEvent.click(screen.getByRole('button', { name: /View cascade/ }));
    expect(onViewCascade).toHaveBeenCalledExactlyOnceWith(rock);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('omits the Edit action when no edit handler is supplied', () => {
    renderSheet();

    expect(screen.queryByRole('button', { name: 'Edit Rock' })).toBeNull();
  });

  it('renders nothing without a Rock', () => {
    renderSheet({ rock: null });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
