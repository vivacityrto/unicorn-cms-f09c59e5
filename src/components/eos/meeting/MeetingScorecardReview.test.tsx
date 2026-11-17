/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { EosScorecardMetric } from '@/types/eos';

type Status = 'green' | 'amber' | 'red' | 'no_data';
let live: { id: string; latestStatus: Status; latestEntry: { week_ending: string; value: number } | null }[];

vi.mock('@/hooks/useScorecardMetrics', () => ({ useScorecardMetrics: () => ({ metrics: live }) }));
vi.mock('@/components/eos/ScorecardEntryGrid', () => ({
  ScorecardEntryGrid: ({ metric }: { metric: { id: string; name: string } }) => (
    <div data-testid={`grid-${metric.id}`}>entry form for {metric.name}</div>
  ),
}));

import { MeetingScorecardReview } from './MeetingScorecardReview';

const recent = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
const metric = (id: string, name: string): EosScorecardMetric => ({
  id, tenant_id: 1, name, frequency: 'weekly', is_active: true, display_order: 0, unit: 'Count', target_value: 10,
  created_at: '2026-01-01', updated_at: '2026-01-01',
});
const entry = (value: number) => ({ week_ending: recent, value });

const metrics = [metric('a', 'Alpha'), metric('b', 'Bravo'), metric('c', 'Charlie'), metric('d', 'Delta')];

beforeEach(() => {
  live = [
    { id: 'a', latestStatus: 'green', latestEntry: entry(12) },
    { id: 'b', latestStatus: 'red', latestEntry: entry(2) },
    { id: 'c', latestStatus: 'amber', latestEntry: entry(9) },
    { id: 'd', latestStatus: 'green', latestEntry: entry(11) },
  ];
});
afterEach(cleanup);

describe('MeetingScorecardReview', () => {
  it('lists the to-discuss metrics first and keeps on-track metrics closed', () => {
    render(<MeetingScorecardReview metrics={metrics} cap={5} />);
    expect(screen.getByText(/to discuss/)).toBeInTheDocument();
    const bravo = screen.getByRole('button', { name: /Bravo/ });
    const charlie = screen.getByRole('button', { name: /Charlie/ });
    // Off track comes before at risk.
    expect(bravo.compareDocumentPosition(charlie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: /2 on track/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Alpha/ })).toBeNull();
  });

  it('uses the cap for how many to-discuss metrics start expanded, and never hides the rest', () => {
    render(<MeetingScorecardReview metrics={metrics} cap={1} />);
    expect(screen.getByTestId('grid-b')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-c')).toBeNull();
    // The second to-discuss metric is still listed and opens on demand.
    fireEvent.click(screen.getByRole('button', { name: /Charlie/ }));
    expect(screen.getByTestId('grid-c')).toBeInTheDocument();
  });

  it('lets an on-track metric record this week without leaving the segment', () => {
    render(<MeetingScorecardReview metrics={metrics} cap={5} />);
    fireEvent.click(screen.getByRole('button', { name: /2 on track/ }));
    expect(screen.queryByTestId('grid-a')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.getByTestId('grid-a')).toHaveTextContent('entry form for Alpha');
    // Closing the metric hides its form again.
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.queryByTestId('grid-a')).toBeNull();
  });

  it('keeps a metric form open when recording its value turns it from off track to on track', () => {
    const { rerender } = render(<MeetingScorecardReview metrics={metrics} cap={5} />);
    expect(screen.getByTestId('grid-b')).toBeInTheDocument();
    // The recorded value arrives: Bravo is now green and leaves the to-discuss list.
    live = live.map((m) => (m.id === 'b' ? { ...m, latestStatus: 'green', latestEntry: entry(15) } : m));
    rerender(<MeetingScorecardReview metrics={metrics} cap={5} />);
    expect(screen.getByRole('button', { name: /3 on track/ })).toBeInTheDocument();
    expect(screen.getByTestId('grid-b')).toBeInTheDocument();
  });

  it('says so when everything is on track', () => {
    live = live.map((m) => ({ ...m, latestStatus: 'green' as Status, latestEntry: entry(12) }));
    render(<MeetingScorecardReview metrics={metrics} cap={5} />);
    expect(screen.getByText(/Every metric is on track/)).toBeInTheDocument();
  });
});
