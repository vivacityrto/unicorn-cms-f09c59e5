import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MilestoneTable } from '@/components/eos/rocks/detail/MilestoneTable';
import { buildDeliveryData } from '@/utils/milestoneDelivery';
import type { PanelMilestone } from '@/utils/rockPanelMetrics';
import type { RockTodo } from '@/utils/rockTodos';
import type { RockMilestoneStatus } from '@/types/eos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

const milestone = (status: RockMilestoneStatus): PanelMilestone => ({
  id: 'm1', title: 'M1 - Follow-ups', label: 'Follow-ups', number: 1, status, priority: null, ownerId: null,
  dueDate: null, exitCriteria: null, evidenceUrl: null, order: 0,
});

const todo = (over: Partial<RockTodo> = {}): RockTodo => ({
  todoId: 't1', linkId: 'l1', rockId: 'r1', milestoneId: 'm1', title: 'Call the leads', status: 'Complete',
  dueDate: '2026-12-31', ownerId: null, ownerName: null, ...over,
});

/** Delivery data where `m1` is fed by milestones with the given statuses. */
const feeders = (m1Status: RockMilestoneStatus, feederStatuses: RockMilestoneStatus[]) =>
  buildDeliveryData({
    milestones: [
      { id: 'm1', rock_id: 'r1', title: 'M1 - Follow-ups', status: m1Status, owner_id: null, due_date: null },
      ...feederStatuses.map((status, i) => ({ id: `f${i}`, rock_id: 'r2', title: `Feeder ${i}`, status, owner_id: null, due_date: null })),
    ],
    rocks: [
      { id: 'r1', title: 'Rock', owner_id: null, rock_level: 'team' },
      { id: 'r2', title: 'Feeder Rock', owner_id: null, rock_level: 'individual' },
    ],
    links: feederStatuses.map((_, i) => ({ company_milestone_id: 'm1', individual_milestone_id: `f${i}` })),
  });

function renderRow(opts: { rockLevel: 'team' | 'company'; status: RockMilestoneStatus; todos?: RockTodo[]; feederStatuses?: RockMilestoneStatus[] }) {
  render(
    <MilestoneTable
      milestones={[milestone(opts.status)]}
      attentionIds={new Set()}
      tasksByMilestone={new Map()}
      todosByMilestone={new Map(opts.todos ? [['m1', opts.todos]] : [])}
      deliveryData={feeders(opts.status, opts.feederStatuses ?? [])}
      rockLevel={opts.rockLevel}
      hasRows
      rockOwnerId={null}
      todayIso="2026-11-17"
    />,
  );
}

describe('MilestoneTable: the last column', () => {
  it('shows the milestone’s own To-Do progress on a signed-off Team milestone that nothing feeds (not "0/0 done")', () => {
    renderRow({ rockLevel: 'team', status: 'complete', todos: [todo()] });
    expect(screen.getByText(/1\/1 tasks/)).toBeTruthy();
    expect(screen.queryByText(/0\/0 done/)).toBeNull();
  });

  it('shows the To-Do progress on a Company milestone that nothing delivers yet, instead of only "Nothing delivering"', () => {
    renderRow({ rockLevel: 'company', status: 'in_progress', todos: [todo({ status: 'Open' }), todo({ todoId: 't2', linkId: 'l2' })] });
    expect(screen.getByText(/1\/2 tasks/)).toBeTruthy();
    expect(screen.queryByText('Nothing delivering')).toBeNull();
  });

  it('still warns "Nothing delivering" when there is nothing delivering and no To-Do to show', () => {
    renderRow({ rockLevel: 'company', status: 'in_progress' });
    expect(screen.getByText('Nothing delivering')).toBeTruthy();
  });

  it('keeps showing delivery when other milestones are feeding it', () => {
    renderRow({ rockLevel: 'company', status: 'in_progress', todos: [todo()], feederStatuses: ['complete', 'in_progress'] });
    expect(screen.getByText(/1\/2 done/)).toBeTruthy();
    expect(screen.queryByText(/tasks$/)).toBeNull();
  });

  it('shows a dash for a signed-off Team milestone with neither delivery nor To-Dos', () => {
    renderRow({ rockLevel: 'team', status: 'complete' });
    expect(screen.getByText('—')).toBeTruthy();
  });
});
