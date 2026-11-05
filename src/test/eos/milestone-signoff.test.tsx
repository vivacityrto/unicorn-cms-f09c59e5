import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestoneTable } from '@/components/eos/rocks/detail/MilestoneTable';
import { SignOffMilestoneDialog, type SignOffTarget } from '@/components/eos/rocks/signoff/SignOffMilestoneDialog';
import { buildDeliveryData, companyMilestoneDelivery } from '@/utils/milestoneDelivery';
import { canSignOffMilestone, signOffCautions, signOffUnavailableReason } from '@/utils/milestoneSignOff';
import type { PanelMilestone } from '@/utils/rockPanelMetrics';
import type { RockMilestoneStatus } from '@/types/eos';

const db = vi.hoisted(() => ({
  rows: [{ id: 'm1' }] as Array<{ id: string }>,
  error: null as { message: string } | null,
  calls: [] as Array<[string, ...unknown[]]>,
  toasts: [] as Array<{ title: string; variant?: string; description?: string }>,
}));

vi.mock('@/hooks/use-toast', () => ({ toast: (t: { title: string }) => db.toasts.push(t) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      db.calls.push(['from', table]);
      const builder: Record<string, unknown> = {};
      builder.update = (values: unknown) => { db.calls.push(['update', values]); return builder; };
      builder.eq = (column: string, value: unknown) => { db.calls.push(['eq', column, value]); return builder; };
      builder.in = (column: string, values: unknown) => { db.calls.push(['in', column, values]); return builder; };
      builder.select = () => { db.calls.push(['select']); return builder; };
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: db.error ? null : db.rows, error: db.error });
      return builder;
    },
  },
}));

const milestone = (over: Partial<PanelMilestone> = {}): PanelMilestone => ({
  id: 'c1', title: 'M4 - Fixtures', label: 'Fixtures', number: 4, status: 'in_progress', priority: 'high', ownerId: null,
  dueDate: null, exitCriteria: 'Six cases pass', evidenceUrl: 'https://example.com/evidence', order: 0, ...over,
});

const delivery = (individualStatuses: RockMilestoneStatus[]) =>
  buildDeliveryData({
    milestones: [
      { id: 'c1', rock_id: 'company', title: 'M4 - Fixtures', status: 'in_progress', owner_id: null, due_date: null },
      ...individualStatuses.map((status, i) => ({ id: `i${i}`, rock_id: 'indiv', title: `Task ${i}`, status, owner_id: null, due_date: null })),
    ],
    rocks: [{ id: 'company', title: 'Company', owner_id: null, rock_level: 'company' }, { id: 'indiv', title: 'Individual', owner_id: null, rock_level: 'individual' }],
    links: individualStatuses.map((_, i) => ({ company_milestone_id: 'c1', individual_milestone_id: `i${i}` })),
  });

function renderTable(m: PanelMilestone, support: { canManage: boolean } | undefined, deliveryData = delivery(['complete'])) {
  const onSignOff = vi.fn();
  render(
    <MilestoneTable
      milestones={[m]}
      attentionIds={new Set()}
      tasksByMilestone={new Map()}
      deliveryData={deliveryData}
      rockLevel="company"
      hasRows
      rockOwnerId={null}
      todayIso="2026-11-05"
      signOffSupport={support ? { ...support, onSignOff } : undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: m.label, expanded: false }));
  return { onSignOff };
}

beforeEach(() => {
  db.rows = [{ id: 'm1' }];
  db.error = null;
  db.calls = [];
  db.toasts = [];
});

describe('milestone sign-off rules', () => {
  it('allows sign-off only from live statuses', () => {
    expect((['not_started', 'in_progress', 'off_track'] as const).every(canSignOffMilestone)).toBe(true);
    expect((['blocked', 'complete', 'deferred'] as const).some(canSignOffMilestone)).toBe(false);
  });

  it('explains a blocked milestone, and stays quiet for the others', () => {
    expect(signOffUnavailableReason('blocked')).toMatch(/Resolve the blocker/);
    expect(signOffUnavailableReason('complete')).toBeNull();
    expect(signOffUnavailableReason('in_progress')).toBeNull();
  });

  it('has no cautions when delivery is done and evidence and criteria are recorded', () => {
    const d = companyMilestoneDelivery('c1', delivery(['complete', 'complete']));
    expect(signOffCautions({ delivery: d, evidenceUrl: 'https://x.test', exitCriteria: 'Done' })).toEqual([]);
  });

  it('cautions about unfinished delivery, nothing delivering, and missing evidence or criteria, but never refuses', () => {
    const partial = companyMilestoneDelivery('c1', delivery(['complete', 'in_progress']));
    expect(signOffCautions({ delivery: partial, evidenceUrl: 'https://x.test', exitCriteria: 'Done' })).toEqual([
      'Only 1 of 2 delivering milestones are complete.',
    ]);
    const none = companyMilestoneDelivery('c1', delivery([]));
    expect(signOffCautions({ delivery: none, evidenceUrl: null, exitCriteria: null })).toHaveLength(3);
    expect(signOffCautions({ delivery: null, evidenceUrl: null, exitCriteria: 'Done' })).toEqual(['No evidence link is recorded.']);
  });
});

describe('MilestoneTable: Sign off button', () => {
  it('offers Sign off on an open milestone and hands over what the dialog needs', () => {
    const { onSignOff } = renderTable(milestone(), { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sign off milestone: Fixtures' }));
    expect(onSignOff).toHaveBeenCalledWith({
      id: 'c1', label: 'Fixtures', exitCriteria: 'Six cases pass', evidenceHref: 'https://example.com/evidence', cautions: [],
    });
  });

  it('still offers it when delivery is not finished, with the shortfall as a caution', () => {
    const { onSignOff } = renderTable(milestone(), { canManage: true }, delivery(['complete', 'in_progress']));
    fireEvent.click(screen.getByRole('button', { name: 'Sign off milestone: Fixtures' }));
    expect(onSignOff.mock.calls[0][0].cautions).toEqual(['Only 1 of 2 delivering milestones are complete.']);
  });

  it.each(['complete', 'deferred'] as const)('does not offer it on a %s milestone', status => {
    renderTable(milestone({ status }), { canManage: true });
    expect(screen.queryByRole('button', { name: /Sign off milestone/ })).toBeNull();
  });

  it('says to resolve the blocker first on a blocked milestone instead of offering it', () => {
    renderTable(milestone({ status: 'blocked' }), { canManage: true });
    expect(screen.queryByRole('button', { name: /Sign off milestone/ })).toBeNull();
    expect(screen.getByText('Resolve the blocker first, then sign this milestone off.')).toBeInTheDocument();
  });

  it('is hidden from people who cannot manage the Rock, and when sign-off is not supported', () => {
    renderTable(milestone(), { canManage: false });
    expect(screen.queryByRole('button', { name: /Sign off milestone/ })).toBeNull();
  });

  it('is absent without sign-off support (legacy milestones)', () => {
    renderTable(milestone(), undefined);
    expect(screen.queryByRole('button', { name: /Sign off milestone/ })).toBeNull();
  });
});

describe('SignOffMilestoneDialog', () => {
  const target: SignOffTarget = {
    id: 'm1', label: 'Fixtures', exitCriteria: 'Six cases pass', evidenceHref: 'https://example.com/evidence',
    cautions: ['Only 1 of 2 delivering milestones are complete.'],
  };

  function renderDialog(over: Partial<SignOffTarget> = {}) {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <SignOffMilestoneDialog open onOpenChange={onOpenChange} target={{ ...target, ...over }} />
      </QueryClientProvider>,
    );
    return { onOpenChange, dialog: screen.getByRole('dialog', { name: 'Sign off this milestone' }) };
  }

  it('shows what done meant, the evidence, and any cautions before confirming', () => {
    const { dialog } = renderDialog();
    expect(within(dialog).getByText('Six cases pass')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open the evidence' })).toHaveAttribute('href', 'https://example.com/evidence');
    expect(within(dialog).getByRole('note', { name: 'Before you sign off' })).toHaveTextContent('Only 1 of 2 delivering milestones are complete.');
    expect(db.calls).toEqual([]);
  });

  it('completes only that milestone, and only while it is still open', async () => {
    const { dialog, onOpenChange } = renderDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign off milestone' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(db.calls).toEqual([
      ['from', 'eos_rock_milestones'],
      ['update', { status: 'complete' }],
      ['eq', 'id', 'm1'],
      ['in', 'status', ['not_started', 'in_progress', 'off_track']],
      ['select'],
    ]);
    expect(db.toasts).toEqual([{ title: 'Milestone signed off' }]);
  });

  it('treats "no row updated" as a refusal: stays open and says the milestone changed', async () => {
    db.rows = [];
    const { dialog, onOpenChange } = renderDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign off milestone' }));
    await waitFor(() => expect(db.toasts).toHaveLength(1));
    expect(db.toasts[0]).toMatchObject({ title: 'Could not sign the milestone off', variant: 'destructive' });
    expect(db.toasts[0].description).toMatch(/changed since you opened it/);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('stays open and reports a database error', async () => {
    db.error = { message: 'permission denied' };
    const { dialog, onOpenChange } = renderDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign off milestone' }));
    await waitFor(() => expect(db.toasts).toHaveLength(1));
    expect(db.toasts[0]).toMatchObject({ variant: 'destructive' });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
