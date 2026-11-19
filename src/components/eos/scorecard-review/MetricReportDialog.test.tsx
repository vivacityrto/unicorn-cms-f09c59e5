import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CstClientRow } from '@/features/eos-scorecard/cstBreakdown';
import type { Measure } from '@/features/eos-scorecard/scorecardView';

const mounts = vi.hoisted(() => ({ viv: 0 }));

vi.mock('./VivInsight', () => ({
  VivInsight: () => {
    useEffect(() => {
      mounts.viv += 1;
    }, []);
    return <section aria-label="Viv read">Viv</section>;
  },
}));

const row = (id: number, name: string, csc: string, users: number, active: number): CstClientRow => ({ tenantId: id, name, cscId: csc, cscName: csc, clientUsers: users, activeUsers: active, neverSignedIn: 0, certificates: 0 });
const byWeek = {
  '2026-11-08': [row(1, 'Alpha', 'Ana', 10, 2), row(2, 'Beta', 'Ben', 10, 0)],
  '2026-11-15': [row(1, 'Alpha', 'Ana', 10, 0), row(2, 'Beta', 'Ben', 10, 3)],
};

vi.mock('@/features/eos-scorecard/useMetricReport', () => ({
  useCstWeekRows: () => ({ weekEnding: '2026-11-15', byWeek, current: byWeek['2026-11-15'], isLoading: false, error: null }),
  useCertificateDetail: () => ({ data: [], isLoading: false, error: null }),
  useAcademyActivity: () => ({ data: undefined, isLoading: false, error: null }),
  useNeverSignedInPeople: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('./ClientDetailPanel', () => ({ ClientDetailPanel: () => null }));

import { MetricReportDialog } from './MetricReportDialog';

const base = { id: 'm', name: 'Clients using the portal', description: 'd', category: 'cst', ownerId: null, target: 50, unit: '%', direction: 'higher_is_better', value: 40, status: 'nearly', history: [30, 32, 35, 38, 40], lastEntry: null } as const;
const automatic = { ...base, source: 'automatic', metric: { metric_key: 'cst_rtos_with_activity_pct' } } as unknown as Measure;
const typed = { ...base, source: 'manual', metric: { metric_key: 'typed_by_hand' } } as unknown as Measure;

const open = (measure: Measure) => render(<MetricReportDialog open onOpenChange={() => undefined} measure={measure} weekKey="2026-11-09" weekLabel="9 to 15 November 2026" />);

describe('MetricReportDialog layout', () => {
  beforeEach(() => {
    mounts.viv = 0;
  });

  it('puts what the number is on the left and how it compares on the right when full screen, without resetting Viv', async () => {
    const user = userEvent.setup();
    open(automatic);
    const toggle = screen.getByRole('button', { name: 'Make the report full screen' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Shrink the report' })).toHaveAttribute('aria-pressed', 'true');

    const meaning = screen.getByRole('region', { name: 'What this number means' });
    const compares = screen.getByRole('region', { name: 'How it compares' });
    // They sit in two different panels.
    expect(meaning.parentElement).not.toBe(compares.parentElement);
    expect(meaning.parentElement?.parentElement).toBe(compares.parentElement?.parentElement);
    expect(within(meaning.parentElement as HTMLElement).getByRole('region', { name: 'Viv read' })).toBeInTheDocument();
    expect(within(compares.parentElement as HTMLElement).getByRole('region', { name: 'By CSC' })).toBeInTheDocument();
    // Going full screen and back must not remount Viv, or its answer would be lost.
    await user.click(screen.getByRole('button', { name: 'Shrink the report' }));
    expect(mounts.viv).toBe(1);
  });

  it('stacks everything in one column when it is not full screen', () => {
    open(automatic);
    const meaning = screen.getByRole('region', { name: 'What this number means' });
    const compares = screen.getByRole('region', { name: 'How it compares' });
    expect(meaning.parentElement?.className).toContain('space-y-4');
    expect(compares.parentElement?.className).toContain('space-y-4');
  });

  it('keeps Viv on the left and the comparison on the right for a measure people type in', async () => {
    const user = userEvent.setup();
    open(typed);
    await user.click(screen.getByRole('button', { name: 'Make the report full screen' }));
    const compares = screen.getByRole('region', { name: 'How it compares' });
    expect(screen.getByRole('region', { name: 'Viv read' }).parentElement).not.toBe(compares.parentElement);
  });

  it('lists the clients that went quiet in full when there are only a few', () => {
    open(automatic);
    const changed = screen.getByRole('region', { name: 'What changed since last week' });
    expect(changed).toHaveTextContent('Went quiet (1)');
    expect(within(changed).queryByRole('button', { name: /and \d+ more/ })).not.toBeInTheDocument();
  });
});
