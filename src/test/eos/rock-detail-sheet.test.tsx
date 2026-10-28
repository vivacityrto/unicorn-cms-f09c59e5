import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

const PAST = '2020-01-01';
const FUTURE = '2099-06-30';

const rock: RockWithHierarchy = {
  id: 'rock-1',
  tenant_id: 6372,
  title: 'Increase Revenue by 20%',
  description: 'Grow recurring revenue across the client base.',
  issue: 'Revenue has been flat for two quarters.',
  outcome: 'A repeatable sales motion.',
  status: 'on_track',
  quarter_year: 2099,
  quarter_number: 2,
  due_date: `${FUTURE}T00:00:00.000Z`,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-20T00:00:00.000Z',
  rock_level: 'individual',
  owner_id: 'user-1',
};

const child: EosRock = { ...rock, id: 'rock-2', title: 'Hire two account managers', rock_level: 'team', parent_rock_id: 'rock-1' };

const names: Record<string, string> = { 'user-1': 'Sam Owner', 'u-khian': 'Khian Sismundo', 'u-rj': 'RJ Badua' };
const getUserInfo = (id: string) => (names[id] ? { name: names[id], initials: names[id].slice(0, 2).toUpperCase() } : null);

function renderSheet(props: Partial<React.ComponentProps<typeof RockDetailSheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RockDetailSheet rock={rock} open onOpenChange={vi.fn()} getUserInfo={getUserInfo} {...props} />
    </QueryClientProvider>,
  );
}

const m = (id: string, rockId: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, rock_id: rockId, title, status, priority: 'medium', owner_id: null, due_date: null, exit_criteria: null,
  evidence_url: null, sort_order: Number(id.replace(/\D/g, '')) || 0, tenant_id: 6372, ...extra,
});

const tile = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div') as HTMLElement;
const findTile = async (label: string) => (await screen.findByText(label, { selector: 'p' })).closest('div') as HTMLElement;

describe('RockDetailSheet', () => {
  beforeEach(() => {
    tableData.rows = {};
    tableData.errors = {};
    window.localStorage.clear();
  });

  describe('header and context', () => {
    it('shows the title, level, quarter, owner and due date in a compact header', async () => {
      renderSheet();

      expect(screen.getByText('Increase Revenue by 20%')).toBeInTheDocument();
      expect(screen.getByText('Individual')).toBeInTheDocument();
      expect(screen.getByText('Q2 2099')).toBeInTheDocument();
      expect(screen.getByText('On Track')).toBeInTheDocument();
      expect(screen.getByText('Sam Owner')).toBeInTheDocument();
      expect(screen.getByText(/Due 30 Jun 2099/)).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(await screen.findByText('No milestones have been added to this Rock yet.')).toBeInTheDocument();
    });

    it('keeps the long description collapsed, with a preview, until asked', () => {
      renderSheet();

      expect(screen.getByText('Grow recurring revenue across the client base.')).toBeInTheDocument();
      expect(screen.queryByText('Issue this Rock addresses')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Context/ }));

      expect(screen.getByText('Issue this Rock addresses')).toBeInTheDocument();
      expect(screen.getByText('Revenue has been flat for two quarters.')).toBeInTheDocument();
      expect(screen.getByText('A repeatable sales motion.')).toBeInTheDocument();
    });

    it('remembers a wider panel', () => {
      const { unmount } = renderSheet();
      expect(screen.getByRole('dialog').className).toContain('lg:w-[min(960px,92vw)]');

      fireEvent.click(screen.getByRole('button', { name: 'Make the panel wider' }));

      expect(screen.getByRole('button', { name: 'Make the panel narrower' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('dialog').className).toContain('lg:w-[min(1320px,96vw)]');
      expect(window.localStorage.getItem('eos-rock-panel-wide')).toBe('1');

      unmount();
      renderSheet();
      expect(screen.getByRole('dialog').className).toContain('lg:w-[min(1320px,96vw)]');
    });

    it('shows cascade alignment for parent and child Rocks', () => {
      renderSheet({
        rock: { ...rock, rock_level: 'team', parent_rock_id: 'parent-1' },
        parentRock: { ...rock, id: 'parent-1', title: 'Company growth', rock_level: 'company' },
        childRocks: [child],
      });

      expect(screen.getByText('Company growth')).toBeInTheDocument();
      expect(screen.getByText('Hire two account managers')).toBeInTheDocument();
      expect(screen.getByText('Cascades to (1)')).toBeInTheDocument();
    });

    it('routes Edit and View cascade through the supplied handlers', () => {
      const onEdit = vi.fn();
      const onViewCascade = vi.fn();
      const onOpenChange = vi.fn();
      renderSheet({ rock: { ...rock, rock_level: 'company' }, onEdit, onViewCascade, onOpenChange });

      fireEvent.click(screen.getByRole('button', { name: 'Edit Rock' }));
      expect(onEdit).toHaveBeenCalledExactlyOnceWith({ ...rock, rock_level: 'company' });

      fireEvent.click(screen.getByRole('button', { name: /View cascade/ }));
      expect(onViewCascade).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('omits Edit without a handler, and renders nothing without a Rock', () => {
      const { unmount } = renderSheet();
      expect(screen.queryByRole('button', { name: 'Edit Rock' })).toBeNull();
      unmount();

      renderSheet({ rock: null });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('milestones of an Individual Rock', () => {
    function seed() {
      tableData.rows.eos_rock_milestones = [
        m('1', 'rock-1', 'Milestone 1 - Draft the plan', 'complete', { due_date: PAST, priority: 'high', exit_criteria: 'Plan signed off', evidence_url: 'https://example.com/plan' }),
        m('2', 'rock-1', 'Milestone 2 - Launch outreach', 'in_progress', { due_date: PAST, owner_id: 'u-khian' }),
        m('3', 'rock-1', 'Prepare the pipeline report', 'blocked'),
        m('4', 'rock-1', 'Milestone 4 - Review results', 'not_started', { due_date: FUTURE, priority: 'critical', evidence_url: 'javascript:alert(1)' }),
        m('5', 'rock-1', 'Close out', 'deferred', { due_date: FUTURE }),
      ];
    }

    it('headlines the metrics: done, in progress, what needs attention, and the next due date', async () => {
      seed();
      renderSheet();

      expect(await screen.findByTestId('milestone-hero')).toBeInTheDocument();
      expect(tile('Done')).toHaveTextContent('1 / 4'); // deferred is not active
      expect(tile('Done')).toHaveTextContent('25% complete');
      expect(tile('In progress')).toHaveTextContent('1');
      expect(tile('In progress')).toHaveTextContent('1 not started');
      expect(tile('Needs attention')).toHaveTextContent('1blocked');
      expect(tile('Needs attention')).toHaveTextContent('1overdue');
      expect(tile('Next due')).toHaveTextContent('M2'); // earliest open due date, already overdue
      expect(tile('Next due')).toHaveTextContent(/days overdue/);
      expect(screen.getByText('1 of 4 complete')).toBeInTheDocument();
    });

    it('draws the status bar and timeline with text alternatives', async () => {
      seed();
      renderSheet();

      await screen.findByTestId('milestone-hero');
      expect(screen.getByRole('img', { name: /Milestones by status: 1 complete, 1 in progress, 1 blocked/ })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Due dates across the quarter/ })).toBeInTheDocument();
    });

    it('lists milestones with a short reference, status and due information', async () => {
      seed();
      renderSheet();

      const region = await screen.findByRole('region', { name: 'Milestone list' });
      expect(within(region).getByText('Draft the plan')).toBeInTheDocument();
      expect(within(region).getByText('M1')).toBeInTheDocument();
      expect(within(region).getByText('M2')).toBeInTheDocument();
      // An unnumbered milestone shows its position in the plan instead.
      expect(within(region).getByText('#3')).toBeInTheDocument();
      expect(within(region).getByText('Blocked')).toBeInTheDocument();
      expect(within(region).getAllByText(/days overdue/).length).toBeGreaterThan(0);
      expect(within(region).getByText('Khian Sismundo')).toBeInTheDocument();
    });

    it('filters to what needs attention, with counts on every filter', async () => {
      seed();
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      expect(within(region).getByRole('button', { name: 'All 5' })).toBeInTheDocument();
      expect(within(region).getByRole('button', { name: 'Needs attention 2' })).toBeInTheDocument();
      expect(within(region).getByRole('button', { name: 'Done 1' })).toBeInTheDocument();

      fireEvent.click(within(region).getByRole('button', { name: 'Needs attention 2' }));

      expect(within(region).getByRole('button', { name: 'Needs attention 2' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(region).getByText('Launch outreach')).toBeInTheDocument(); // overdue
      expect(within(region).getByText('Prepare the pipeline report')).toBeInTheDocument(); // blocked
      expect(within(region).queryByText('Draft the plan')).toBeNull();
    });

    it('searches, then offers to clear when nothing matches', async () => {
      seed();
      tableData.rows.eos_rock_milestones = [
        ...(tableData.rows.eos_rock_milestones as unknown[]),
        m('6', 'rock-1', 'Milestone 6 - Extra one', 'not_started'),
        m('7', 'rock-1', 'Milestone 7 - Extra two', 'not_started'),
      ];
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      fireEvent.change(within(region).getByRole('textbox', { name: 'Search milestones' }), { target: { value: 'outreach' } });
      expect(within(region).getByText('Launch outreach')).toBeInTheDocument();
      expect(within(region).queryByText('Draft the plan')).toBeNull();

      fireEvent.change(within(region).getByRole('textbox', { name: 'Search milestones' }), { target: { value: 'zzz' } });
      expect(within(region).getByText('No milestones match these filters.')).toBeInTheDocument();

      fireEvent.click(within(region).getByRole('button', { name: 'Clear filters' }));
      expect(within(region).getByText('Draft the plan')).toBeInTheDocument();
    });

    it('sorts by due date, undated last', async () => {
      seed();
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });
      const order = () => within(region).getAllByRole('button', { expanded: false }).map(b => b.textContent);

      fireEvent.click(within(region).getByRole('button', { name: 'Due date' }));

      const titles = order().filter(t => /plan|outreach|results|pipeline|Close/.test(t ?? ''));
      expect(titles.indexOf('Draft the plan')).toBeLessThan(titles.indexOf('Review results'));
      expect(titles.indexOf('Review results')).toBeLessThan(titles.indexOf('Prepare the pipeline report'));
    });

    it('expands a row to show its exit criteria and a safe evidence link only', async () => {
      seed();
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      fireEvent.click(within(region).getByRole('button', { name: /Draft the plan/ }));
      expect(within(region).getByText(/Plan signed off/)).toBeInTheDocument();
      expect(within(region).getByRole('link', { name: 'Evidence' })).toHaveAttribute('href', 'https://example.com/plan');

      fireEvent.click(within(region).getByRole('button', { name: /Review results/ }));
      // The unsafe URL is never rendered as a link.
      expect(within(region).getAllByRole('link', { name: 'Evidence' })).toHaveLength(1);

      fireEvent.click(within(region).getByRole('button', { name: 'Collapse all' }));
      expect(within(region).queryByText(/Plan signed off/)).toBeNull();
      fireEvent.click(within(region).getByRole('button', { name: 'Expand all' }));
      expect(within(region).getByText(/Plan signed off/)).toBeInTheDocument();
    });

    it('falls back to legacy JSON milestones when none are normalized', async () => {
      renderSheet({
        rock: { ...rock, milestones: [{ id: 'l1', text: 'Legacy milestone', completed: true }] as never },
      });

      expect(await screen.findByText('Legacy milestone')).toBeInTheDocument();
      expect(screen.getAllByText('1 of 1 complete').length).toBeGreaterThan(0);
    });

    it('warns when the Rock status disagrees with its milestones', async () => {
      tableData.rows.eos_rock_milestones = [m('1', 'rock-1', 'Milestone 1 - Done', 'complete')];
      renderSheet();

      expect(await screen.findByText(/doesn't match milestone progress \(100% complete\)/)).toBeInTheDocument();
    });
  });

  describe('To-Dos linked to the Rock and its milestones', () => {
    const milestoneRows = [m('1', 'rock-1', 'Milestone 1 - Draft the pipeline plan', 'in_progress', { due_date: FUTURE })];
    const seed = () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.rows.eos_rock_todo_links = [
        { id: 'l-1', todo_id: 'td-1', rock_id: 'rock-1', milestone_id: '1' },
        { id: 'l-2', todo_id: 'td-2', rock_id: 'rock-1', milestone_id: '1' },
        { id: 'l-3', todo_id: 'td-3', rock_id: 'rock-1', milestone_id: null },
      ];
      tableData.rows.eos_todos = [
        { id: 'td-1', title: 'Chase the supplier', status: 'Open', due_date: '2020-01-01', owner_id: null },
        { id: 'td-2', title: 'Book the check-in', status: 'Complete', due_date: '2020-01-02', owner_id: null },
        { id: 'td-3', title: 'Send the plan to legal', status: 'Open', due_date: FUTURE, owner_id: null },
      ];
    };

    it('counts a milestone\'s To-Dos on its row, flags the overdue one, and lists them when expanded', async () => {
      seed();
      renderSheet({ onEdit: vi.fn() });
      const region = await screen.findByRole('region', { name: 'Milestone list' });
      expect(await within(region).findByText('1/2 tasks')).toBeInTheDocument();
      expect(within(region).getAllByText('1 overdue').length).toBeGreaterThan(0);

      fireEvent.click(within(region).getByRole('button', { name: /Draft the pipeline plan/ }));
      expect(within(region).getByText(/To-Dos · 1 of 2 done/)).toBeInTheDocument();
      expect(within(region).getByText('Chase the supplier')).toBeInTheDocument();
      expect(within(region).queryByText('Send the plan to legal')).toBeNull(); // that one is for the whole Rock
    });

    it('shows To-Dos for the whole Rock in their own section, with the controls for someone who can manage the Rock', async () => {
      seed();
      renderSheet({ onEdit: vi.fn() });
      expect(await screen.findByText('Send the plan to legal')).toBeInTheDocument();
      expect(screen.getByText('To-Dos for this Rock · 0 of 1 done')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Add a To-Do/ }).length).toBeGreaterThan(0);
    });

    it('is read-only for someone who cannot manage the Rock, and hides an empty section', async () => {
      seed();
      renderSheet();
      expect(await screen.findByText('Send the plan to legal')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a To-Do/ })).toBeNull();
      cleanup();
      tableData.rows.eos_rock_todo_links = [];
      renderSheet();
      await screen.findByRole('region', { name: 'Milestone list' });
      expect(screen.queryByText(/To-Dos for this Rock/)).toBeNull();
    });
  });

  describe('linked GitHub tasks', () => {
    const milestoneRows = [m('1', 'rock-1', 'Milestone 1 - Draft the pipeline plan', 'in_progress', { due_date: FUTURE })];
    const task = (overrides: Record<string, unknown>) => ({
      id: 't-1', milestone_id: '1', external_key: 'repo#1', external_url: 'https://github.com/ComplyHub-ai/rto-compass-hub/issues/1',
      title: 'Build the fixtures', task_state: 'open', task_status: 'in progress', priority: 'HIGH', due_date: null,
      assignees: ['KhianBrian'], last_synced_at: '2026-10-27T01:00:00Z', ...overrides,
    });

    it('summarises tasks on the row, flags a blocked one, and lists them with safe links when expanded', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.rows.eos_rock_milestone_task_links = [
        task({}),
        task({ id: 't-2', title: 'Write the cases', task_status: 'blocked', external_key: 'repo#2', external_url: 'javascript:alert(1)' }),
      ];
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      expect(await within(region).findByText('0/2 tasks')).toBeInTheDocument();
      expect(within(region).getAllByText('1 blocked').length).toBeGreaterThan(0);
      expect(tile('Needs attention')).toHaveTextContent('1blocked tasks');

      fireEvent.click(within(region).getByRole('button', { name: /Draft the pipeline plan/ }));
      expect(within(region).getByText(/Linked tasks · 0 of 2 closed/)).toBeInTheDocument();
      const link = within(region).getByRole('link', { name: 'Build the fixtures' });
      expect(link).toHaveAttribute('href', 'https://github.com/ComplyHub-ai/rto-compass-hub/issues/1');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(region).getByText('Write the cases')).toBeInTheDocument();
      expect(within(region).queryByRole('link', { name: 'Write the cases' })).toBeNull();
      expect(within(region).queryByText('Ready for review')).toBeNull();
    });

    it('flags a milestone as ready for review, without completing it, once every task is closed', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.rows.eos_rock_milestone_task_links = [
        task({ task_state: 'closed', task_status: 'completed' }),
        task({ id: 't-2', external_key: 'repo#2', task_state: 'closed', task_status: 'completed', title: 'Write the cases' }),
      ];
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      fireEvent.click(await within(region).findByRole('button', { name: /Draft the pipeline plan/ }));

      expect(await within(region).findByText('Ready for review')).toBeInTheDocument();
      expect(within(region).getByText(/Linked tasks · 2 of 2 closed/)).toBeInTheDocument();
      expect(within(region).getByText(/mark this milestone complete in Unicorn/)).toBeInTheDocument();
      // The milestone itself is still In progress: a person completes it.
      expect(within(region).getAllByText('In progress').length).toBeGreaterThan(0);
      expect(within(region).queryByText('Complete')).toBeNull();
    });

    it('does not offer review on a milestone that is already complete', async () => {
      tableData.rows.eos_rock_milestones = [{ ...milestoneRows[0], status: 'complete' }];
      tableData.rows.eos_rock_milestone_task_links = [task({ task_state: 'closed', task_status: 'completed' })];
      renderSheet();
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      fireEvent.click(await within(region).findByRole('button', { name: /Draft the pipeline plan/ }));

      expect(await within(region).findByText(/Linked tasks · 1 of 1 closed/)).toBeInTheDocument();
      expect(within(region).queryByText('Ready for review')).toBeNull();
    });

    it('still opens when the task links table does not exist yet', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.errors.eos_rock_milestone_task_links = { code: 'PGRST205', message: 'not found' };
      renderSheet();

      expect(await screen.findByText('Draft the pipeline plan')).toBeInTheDocument();
      expect(screen.queryByText('Linked tasks could not be loaded.')).toBeNull();
    });

    it('says so when linked tasks fail to load for another reason', async () => {
      tableData.rows.eos_rock_milestones = milestoneRows;
      tableData.errors.eos_rock_milestone_task_links = { code: '500', message: 'boom' };
      renderSheet();

      expect(await screen.findByText('Linked tasks could not be loaded.')).toBeInTheDocument();
      expect(screen.getByText('Draft the pipeline plan')).toBeInTheDocument();
    });
  });

  describe('Company and Individual milestone relationships', () => {
    const companyRock = { ...rock, id: 'rock-1', title: 'Harden RBAC', rock_level: 'company' as const };
    const individualRock = { ...rock, id: 'ind-1', title: 'Khian Rock', rock_level: 'individual' as const, owner_id: 'u-khian', parent_rock_id: 'rock-1' };
    const rocksRows = [
      { id: 'rock-1', title: 'Harden RBAC', owner_id: 'user-1', rock_level: 'company' },
      { id: 'ind-1', title: 'Khian Rock', owner_id: 'u-khian', rock_level: 'individual' },
      { id: 'ind-2', title: 'RJ Rock', owner_id: 'u-rj', rock_level: 'individual' },
    ];
    const link = (company: string, individual: string) => ({ company_milestone_id: company, individual_milestone_id: individual });

    function seedCompany() {
      tableData.rows.eos_rocks = rocksRows;
      tableData.rows.eos_rock_milestones = [
        m('C1', 'rock-1', 'Milestone 1 - Run isolation suite', 'not_started', { sort_order: 0, due_date: FUTURE }),
        m('C2', 'rock-1', 'Milestone 2 - Write the matrix', 'not_started', { sort_order: 1, due_date: FUTURE }),
        m('C3', 'rock-1', 'Milestone 3 - Orphan milestone', 'not_started', { sort_order: 2, due_date: FUTURE }),
        m('I1', 'ind-1', 'Build fixtures', 'complete', { sort_order: 0 }),
        m('I2', 'ind-1', 'Write cases', 'in_progress', { sort_order: 1 }),
        m('I3', 'ind-2', 'Review RPCs', 'blocked', { sort_order: 0, due_date: PAST }),
      ];
      tableData.rows.eos_rock_milestone_links = [link('C1', 'I1'), link('C1', 'I2'), link('C2', 'I3')];
    }

    it('headlines Company Rock delivery next to what a person has signed off', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });

      expect(await findTile('Signed off')).toHaveTextContent('0 / 3');
      expect(tile('Delivered')).toHaveTextContent('1 / 3');
      expect(tile('Delivered')).toHaveTextContent('33% of linked milestones');
      expect(tile('Being delivered')).toHaveTextContent('2 / 3');
      expect(tile('Being delivered')).toHaveTextContent('1 with nothing delivering');
      expect(tile('Needs attention')).toHaveTextContent('1blocked deliverables');
      expect(tile('Needs attention')).toHaveTextContent('1overdue deliverables');
      expect(tile('Needs attention')).toHaveTextContent('1with nothing delivering');
      expect(screen.getByText('0 of 3 signed off')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Delivery by the linked Individual milestones: 1 complete, 1 in progress, 1 blocked/ })).toBeInTheDocument();
    });

    it('shows who is delivering the Rock, one row per Individual Rock', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });

      const section = (await screen.findByText('Delivery by owner')).closest('section') as HTMLElement;
      expect(within(section).getByText('Khian Sismundo')).toBeInTheDocument();
      expect(within(section).getByText('Khian Rock')).toBeInTheDocument();
      expect(within(section).getByText('RJ Badua')).toBeInTheDocument();
      expect(within(section).getByText('1 blocked')).toBeInTheDocument();
    });

    it('shows each Company milestone’s delivery in its row, and "Nothing delivering" where nobody is', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      expect(await within(region).findByText(/1\/2 done/)).toBeInTheDocument();
      expect(within(region).getByText(/0\/1 done/)).toBeInTheDocument();
      expect(within(region).getByText('Nothing delivering')).toBeInTheDocument();
    });

    it('counts a milestone with blocked delivery or nothing delivering as needing attention', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      // C2 (its only contributor is blocked) and C3 (nothing delivering).
      const chip = await within(region).findByRole('button', { name: 'Needs attention 2' });
      fireEvent.click(chip);

      expect(within(region).getByText('Write the matrix')).toBeInTheDocument();
      expect(within(region).getByText('Orphan milestone')).toBeInTheDocument();
      expect(within(region).queryByText('Run isolation suite')).toBeNull();
    });

    it('expands a Company milestone to list what delivers it', async () => {
      seedCompany();
      renderSheet({ rock: companyRock });
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      fireEvent.click(await within(region).findByRole('button', { name: /Run isolation suite/ }));
      fireEvent.click(within(region).getByRole('button', { name: /Delivered by 2/ }));

      expect(await within(region).findByText('Build fixtures')).toBeInTheDocument();
      expect(within(region).getByText('Write cases')).toBeInTheDocument();
    });

    it('shows an Individual milestone the Company milestone it supports', async () => {
      seedCompany();
      tableData.rows.eos_rock_milestones = (tableData.rows.eos_rock_milestones as Array<{ id: string }>).filter(r => r.id !== 'C3');
      renderSheet({ rock: individualRock });
      const region = await screen.findByRole('region', { name: 'Milestone list' });

      // Both of this Rock's milestones feed Milestone 1, shown as a short reference on the row.
      expect(await within(region).findAllByText('Supports M1')).toHaveLength(2);

      fireEvent.click(within(region).getByRole('button', { name: /Build fixtures/ }));
      expect(within(region).getByText('Run isolation suite')).toBeInTheDocument(); // clean label, number shown as M1
      expect(within(region).getByText('M1 ·')).toBeInTheDocument();
      expect(within(region).getByText('1 of 2 delivering milestones done')).toBeInTheDocument();
    });

    it('opens the Company Rock from an Individual milestone, only when a handler is supplied', async () => {
      seedCompany();
      const onOpenRock = vi.fn();
      const { unmount } = renderSheet({ rock: individualRock, onOpenRock });
      let region = await screen.findByRole('region', { name: 'Milestone list' });

      fireEvent.click(await within(region).findByRole('button', { name: /Build fixtures/ }));
      fireEvent.click(within(region).getByRole('button', { name: 'Open Company Rock: Harden RBAC' }));
      expect(onOpenRock).toHaveBeenCalledWith('rock-1');
      unmount();

      renderSheet({ rock: individualRock });
      region = await screen.findByRole('region', { name: 'Milestone list' });
      fireEvent.click(await within(region).findByRole('button', { name: /Build fixtures/ }));
      expect(within(region).queryByRole('button', { name: /Open Company Rock/ })).toBeNull();
    });

    it('still opens when the link tables do not exist yet', async () => {
      seedCompany();
      tableData.errors.eos_rock_milestone_links = { code: 'PGRST205', message: 'not found' };
      renderSheet({ rock: companyRock });

      expect(await screen.findByText('Run isolation suite')).toBeInTheDocument();
      expect(screen.queryByText('Milestone relationships could not be loaded.')).toBeNull();
      expect(screen.queryByText('Delivery by owner')).toBeNull();
    });

    it('says so when the relationships fail to load for another reason', async () => {
      seedCompany();
      tableData.errors.eos_rock_milestone_links = { code: '500', message: 'boom' };
      renderSheet({ rock: companyRock });

      expect(await screen.findByText('Milestone relationships could not be loaded.')).toBeInTheDocument();
      expect(screen.getByText('Run isolation suite')).toBeInTheDocument();
    });
  });
});
