import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import type { EosRock, RockWithHierarchy } from '@/types/eos';

const tableData = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { user_uuid: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const result = () => ({
        data: (tableData.rows[table] ?? []).filter(row => filters.every(f => f(row as Record<string, unknown>))),
        error: tableData.errors[table] ?? null,
      });
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        filters.push(row => row[column] === value);
        return builder;
      };
      builder.in = (column: string, values: unknown[]) => {
        filters.push(row => values.includes(row[column]));
        return builder;
      };
      builder.order = () => Promise.resolve(result());
      builder.then = (resolve: (value: unknown) => unknown) => resolve(result());
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
    tableData.rows = {};
    tableData.errors = {};
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
    tableData.rows.eos_rock_milestones = [
      { id: 'm1', rock_id: 'rock-1', title: 'Draft pipeline plan', status: 'complete', priority: 'high', owner_id: null, due_date: '2026-11-15', exit_criteria: 'Plan signed off', evidence_url: 'https://example.com/plan', sort_order: 0 },
      { id: 'm2', rock_id: 'rock-1', title: 'Launch outreach', status: 'in_progress', priority: 'medium', owner_id: null, due_date: null, exit_criteria: null, evidence_url: 'javascript:alert(1)', sort_order: 1 },
    ];
    renderSheet();

    expect(await screen.findByText('Draft pipeline plan')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 signed off')).toBeInTheDocument();
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
    expect(screen.getByText('1 of 1 signed off')).toBeInTheDocument();
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
  describe('linked GitHub tasks', () => {
    const milestoneRows = [
      { id: 'm1', rock_id: 'rock-1', title: 'Draft pipeline plan', status: 'in_progress', priority: 'high', owner_id: null, due_date: null, exit_criteria: null, evidence_url: null, sort_order: 0 },
    ];
    const task = (overrides: Record<string, unknown>) => ({
      id: 't-1', milestone_id: 'm1', external_key: 'repo#1', external_url: 'https://github.com/ComplyHub-ai/rto-compass-hub/issues/1',
      title: 'Build the fixtures', task_state: 'open', task_status: 'in progress', priority: 'HIGH', due_date: '2026-11-20',
      assignees: ['KhianBrian'], last_synced_at: '2026-10-27T01:00:00Z', ...overrides,
    });

    it('lists linked tasks under their milestone with state, assignee and a safe link', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.rows.eos_rock_milestone_task_links = [
        task({}),
        task({ id: 't-2', title: 'Write the cases', task_status: 'blocked', external_key: 'repo#2', external_url: 'javascript:alert(1)' }),
      ];
      renderSheet();

      expect(await screen.findByText(/Tasks · 0 of 2 closed/)).toBeInTheDocument();
      expect(screen.getByText('1 blocked')).toBeInTheDocument();
      const link = screen.getByRole('link', { name: 'Build the fixtures' });
      expect(link).toHaveAttribute('href', 'https://github.com/ComplyHub-ai/rto-compass-hub/issues/1');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // An unsafe URL is shown as plain text, never as a link.
      expect(screen.getByText('Write the cases')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Write the cases' })).toBeNull();
      expect(screen.getAllByText('KhianBrian')).toHaveLength(2);
      expect(screen.queryByText('Ready for review')).toBeNull();
    });

    it('flags a milestone as ready for review, without completing it, once every task is closed', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.rows.eos_rock_milestone_task_links = [
        task({ task_state: 'closed', task_status: 'completed' }),
        task({ id: 't-2', external_key: 'repo#2', task_state: 'closed', task_status: 'completed', title: 'Write the cases' }),
      ];
      renderSheet();

      expect(await screen.findByText('Ready for review')).toBeInTheDocument();
      expect(screen.getByText(/Tasks · 2 of 2 closed/)).toBeInTheDocument();
      expect(screen.getByText(/mark this milestone complete in Unicorn/)).toBeInTheDocument();
      // The milestone itself is still In progress: a person completes it.
      expect(screen.getByText('In progress')).toBeInTheDocument();
    });

    it('does not offer review on a milestone that is already complete', async () => {
      tableData.rows.eos_rock_milestones = [{ ...milestoneRows[0], status: 'complete' }];
      tableData.rows.eos_rock_milestone_task_links = [task({ task_state: 'closed', task_status: 'completed' })];
      renderSheet();

      expect(await screen.findByText(/Tasks · 1 of 1 closed/)).toBeInTheDocument();
      expect(screen.queryByText('Ready for review')).toBeNull();
    });

    it('still opens the panel when the task links table does not exist yet', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.errors.eos_rock_milestone_task_links = { code: 'PGRST205', message: 'not found' };
      renderSheet();

      expect(await screen.findByText('Draft pipeline plan')).toBeInTheDocument();
      expect(screen.queryByText(/Tasks ·/)).toBeNull();
      expect(screen.queryByText('Linked tasks could not be loaded.')).toBeNull();
    });

    it('says so when linked tasks fail to load for another reason', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.errors.eos_rock_milestone_task_links = { code: '500', message: 'boom' };
      renderSheet();

      expect(await screen.findByText('Linked tasks could not be loaded.')).toBeInTheDocument();
      expect(screen.getByText('Draft pipeline plan')).toBeInTheDocument();
    });
  });
  describe('Company and Individual milestone relationships', () => {
    const companyRock = { ...rock, id: 'rock-1', title: 'Harden RBAC', rock_level: 'company' as const };
    const individualRock = { ...rock, id: 'ind-1', title: 'Khian Rock', rock_level: 'individual' as const, owner_id: 'u-khian', parent_rock_id: 'rock-1' };
    const m = (id: string, rockId: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
      id, rock_id: rockId, title, status, priority: 'medium', owner_id: null, due_date: null, exit_criteria: null,
      evidence_url: null, sort_order: 0, tenant_id: 6372, ...extra,
    });
    const rocksRows = [
      { id: 'rock-1', title: 'Harden RBAC', owner_id: 'u-carl', rock_level: 'company' },
      { id: 'ind-1', title: 'Khian Rock', owner_id: 'u-khian', rock_level: 'individual' },
      { id: 'ind-2', title: 'RJ Rock', owner_id: 'u-rj', rock_level: 'individual' },
    ];
    const link = (company: string, individual: string) => ({ company_milestone_id: company, individual_milestone_id: individual });

    function seedCompany() {
      tableData.rows.eos_rocks = rocksRows;
      tableData.rows.eos_rock_milestones = [
        m('C1', 'rock-1', 'Run isolation suite', 'not_started', { sort_order: 0 }),
        m('C2', 'rock-1', 'Write the matrix', 'not_started', { sort_order: 1 }),
        m('C3', 'rock-1', 'Orphan milestone', 'not_started', { sort_order: 2 }),
        m('I1', 'ind-1', 'Build fixtures', 'complete'),
        m('I2', 'ind-1', 'Write cases', 'in_progress'),
        m('I3', 'ind-2', 'Review RPCs', 'blocked', { due_date: '2020-01-01' }),
      ];
      tableData.rows.eos_rock_milestone_links = [link('C1', 'I1'), link('C1', 'I2'), link('C2', 'I3')];
    }

    it('summarises Company Rock delivery next to what a person has signed off', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });

      const summary = await screen.findByTestId('delivery-summary');
      expect(within(summary).getByText(/1 of 3 linked milestones delivered · 33%/)).toBeInTheDocument();
      expect(within(summary).getByText('Signed off 0 of 3')).toBeInTheDocument();
      expect(within(summary).getByText('Being delivered 2 of 3')).toBeInTheDocument();
      expect(within(summary).getByText('1 blocked')).toBeInTheDocument();
      expect(within(summary).getByText('1 with nothing delivering')).toBeInTheDocument();
      expect(screen.getByText('0 of 3 signed off')).toBeInTheDocument();
    });

    it('shows, under each Company milestone, what delivers it and how far they have got', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });

      expect(await screen.findByText(/Delivery · 1 of 2 done · 50%/)).toBeInTheDocument();
      expect(screen.getByText(/Delivery · 0 of 1 done · 0%/)).toBeInTheDocument();
      // Company milestone C2 is only fed by a blocked milestone, so it reads Blocked.
      expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: /Delivered by 2/ }));
      expect(await screen.findByText('Build fixtures')).toBeInTheDocument();
      expect(screen.getByText('Write cases')).toBeInTheDocument();
      expect(screen.getAllByText('Khian Rock').length).toBeGreaterThan(0);
    });

    it('flags a Company milestone nothing is delivering', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });

      expect(await screen.findByText(/nobody is delivering it yet/)).toBeInTheDocument();
    });

    it('flags overdue contributors', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });

      expect(await screen.findByText('1 overdue')).toBeInTheDocument();
    });

    it('shows an Individual milestone the Company milestone it supports, its state and its delivery', async () => {
      seedCompany();
      tableData.rows.eos_rock_milestones = (tableData.rows.eos_rock_milestones as Array<{ id: string }>).filter(r => r.id !== 'C3');
      renderSheet({ rock: individualRock });

      // Both of this Rock's milestones feed the same Company milestone.
      expect(await screen.findAllByText(/Supports/)).toHaveLength(2);
      expect(screen.getAllByText('Run isolation suite')).toHaveLength(2);
      expect(screen.getAllByText('1 of 2 delivering milestones done')).toHaveLength(2);
      expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    });

    it('opens the Company Rock from an Individual milestone', async () => {
      seedCompany();
      const onOpenRock = vi.fn();
      renderSheet({ rock: individualRock, onOpenRock });

      const buttons = await screen.findAllByRole('button', { name: 'Open Company Rock: Harden RBAC' });
      fireEvent.click(buttons[0]);

      expect(onOpenRock).toHaveBeenCalledWith('rock-1');
    });

    it('offers no navigation when no open handler is supplied', async () => {
      seedCompany();
      renderSheet({ rock: individualRock });

      await screen.findAllByText(/Supports/);
      expect(screen.queryByRole('button', { name: /Open Company Rock/ })).toBeNull();
    });

    it('still opens when the link tables do not exist yet', async () => {
      seedCompany();
      tableData.errors.eos_rock_milestone_links = { code: 'PGRST205', message: 'not found' };
      renderSheet({ rock: companyRock });

      expect(await screen.findByText('Run isolation suite')).toBeInTheDocument();
      expect(screen.queryByTestId('delivery-summary')).toBeNull();
      expect(screen.queryByText('Milestone relationships could not be loaded.')).toBeNull();
    });

    it('says so when the relationships fail to load for another reason', async () => {
      seedCompany();
      tableData.errors.eos_rock_milestone_links = { code: '500', message: 'boom' };
      renderSheet({ rock: companyRock });

      expect(await screen.findByText('Milestone relationships could not be loaded.')).toBeInTheDocument();
      expect(screen.getByText('Run isolation suite')).toBeInTheDocument();
    });

    it('shows no relationship blocks for legacy milestones that have no normalized rows', async () => {
      renderSheet({
        rock: { ...companyRock, milestones: [{ id: 'l1', text: 'Legacy milestone', completed: false }] as never },
      });

      expect(await screen.findByText('Legacy milestone')).toBeInTheDocument();
      expect(screen.queryByTestId('delivery-summary')).toBeNull();
    });
  });
});
