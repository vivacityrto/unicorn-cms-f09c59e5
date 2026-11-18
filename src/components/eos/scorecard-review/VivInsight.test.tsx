import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ScorecardMetric } from '@/types/scorecard';
import { buildMeasures, lastCompletedWeekKey } from '@/features/eos-scorecard/scorecardView';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me', tenant_id: 6372 } }) }));

import { VivInsight } from './VivInsight';

const weekKey = lastCompletedWeekKey();
const metric: ScorecardMetric = {
  id: 'm1', scorecard_id: 's1', tenant_id: 6372, name: 'Clients using the portal', description: 'Share of clients.', category: 'CST', owner_id: null,
  target_value: 50, unit: '%', direction: 'higher_is_better', frequency: 'weekly', metric_source: 'automatic', metric_key: 'cst_rtos_with_activity_pct',
  example_result: null, is_active: true, is_archived: false, display_order: 0, created_at: '', updated_at: '',
  recentEntries: [{ id: 'e1', metric_id: 'm1', tenant_id: 6372, week_ending: weekKey, value: 34.5, actual_value: 34.5, entered_by: 'u', entered_at: '', entry_source: 'system' }],
};
const [measure] = buildMeasures([metric], weekKey);

const answer = {
  insight: {
    headline: 'Fewer clients used the portal this week.',
    why: ['Alpha Training has nine users and none were active.'],
    actions: [{ action: 'Call Alpha Training', detail: 'Ask what stopped them.', who: 'Sam', clients: ['Alpha Training'] }],
    watch: 'Beta College',
  },
  generated_at: '2026-11-18T01:00:00Z',
  model: 'claude-sonnet-5',
  week_key: weekKey,
};

const renderIt = (props: Partial<React.ComponentProps<typeof VivInsight>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VivInsight measure={measure} weekKey={weekKey} {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => invoke.mockReset());

describe('VivInsight', () => {
  it('waits to be asked: nothing runs until the button is pressed', () => {
    renderIt();
    expect(screen.getByRole('button', { name: 'Explain this number' })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('asks for this measure and week, then shows the read in plain sections', async () => {
    invoke.mockResolvedValue({ data: answer, error: null });
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('button', { name: 'Explain this number' }));
    expect(await screen.findByText('Fewer clients used the portal this week.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('scorecard-insight', { body: { metric_id: 'm1', week_key: weekKey } });
    expect(screen.getByText('What may be behind it')).toBeInTheDocument();
    expect(screen.getByText(/1\. Call Alpha Training/)).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText(/Start with: Alpha Training/)).toBeInTheDocument();
    expect(screen.getByText(/Keep an eye on:/)).toBeInTheDocument();
    expect(screen.getByText(/Written by AI/)).toBeInTheDocument();
  });

  it('asks straight away when opened from the Ask Viv button, and only once', async () => {
    invoke.mockResolvedValue({ data: answer, error: null });
    renderIt({ autoStart: true });
    expect(await screen.findByText('Fewer clients used the portal this week.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('says what went wrong in the words the function gave, and lets you try again', async () => {
    const response = new Response(JSON.stringify({ error: 'Viv is busy. Please try again in a minute.' }), { status: 429 });
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: response } });
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('button', { name: 'Explain this number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Viv is busy. Please try again in a minute.');

    invoke.mockResolvedValueOnce({ data: answer, error: null });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Fewer clients used the portal this week.')).toBeInTheDocument());
  });
});
