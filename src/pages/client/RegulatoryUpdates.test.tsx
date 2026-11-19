import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const now = Date.now();
const iso = (days: number) => new Date(now - days * 86_400_000).toISOString();

const events = [
  { id: 'e1', detected_at: iso(3), impact_level: 'critical', change_summary_md: '### Change summary\n\nNew rules on third-party arrangements apply now.', affected_areas_json: [{ area: 'Third-party arrangements', standard_clause: 'Standard 1.3' }, { area: 'Records' }], research_job_id: 'j1', regulator_watchlist: { name: 'ASQA', url: 'https://asqa.gov.au', category: 'regulator' } },
  { id: 'e2', detected_at: iso(70), impact_level: 'low', change_summary_md: 'A small wording tidy-up in the guidance.', affected_areas_json: [], research_job_id: null, regulator_watchlist: { name: 'DEWR', url: null, category: 'government' } },
  { id: 'e3', detected_at: iso(5), impact_level: 'high', change_summary_md: 'Updated student support guidance.', affected_areas_json: null, research_job_id: null, regulator_watchlist: { name: 'ASQA', url: null, category: 'regulator' } },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain = (rows: unknown, single = false) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => Promise.resolve({ data: rows, error: null });
    q.eq = () => (single ? { single: () => Promise.resolve({ data: events[0], error: null }) } : Promise.resolve({ data: [{ citations_json: [{ index: 1, url: 'https://asqa.gov.au/news' }] }], error: null }));
    return q;
  };
  return { supabase: { from: (table: string) => (table === 'regulator_change_events' ? { select: () => ({ order: () => Promise.resolve({ data: events, error: null }), eq: () => ({ single: () => Promise.resolve({ data: events[0], error: null }) }) }) } : chain([], false)) } };
});
vi.mock('@/components/help-center', () => ({ useHelpCenter: () => ({ openHelpCenter: vi.fn(), canAccess: true }) }));

import RegulatoryUpdatesPage from './RegulatoryUpdatesPage';
import RegulatoryUpdateDetailPage from './RegulatoryUpdateDetailPage';

const wrap = (ui: React.ReactElement, path = '/client/regulatory-updates') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/client/regulatory-updates" element={ui} />
          <Route path="/client/regulatory-updates/:eventId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('RegulatoryUpdatesPage', () => {
  it('shows how many updates sit at each impact level and what is recent', async () => {
    wrap(<RegulatoryUpdatesPage />);
    await screen.findByRole('list', { name: 'Summary' });
    const banner = screen.getByRole('region', { name: 'Regulatory updates' });
    expect(banner).toHaveTextContent('3 updates');
    expect(banner).toHaveTextContent('2 in the last 30 days');
    expect(banner).toHaveTextContent('2 high or critical');
    const filter = screen.getByRole('group', { name: 'Filter by impact' });
    expect(within(filter).getByRole('button', { name: /Critical/ })).toHaveTextContent('1');
    expect(within(filter).getByRole('button', { name: /Moderate/ })).toHaveTextContent('0');
  });

  it('filters by impact and by search, and each card links to its update', async () => {
    const user = userEvent.setup();
    wrap(<RegulatoryUpdatesPage />);
    await screen.findByRole('list', { name: 'Summary' });
    expect(screen.getAllByRole('link', { name: /ASQA/ })).toHaveLength(2);
    await user.click(within(screen.getByRole('group', { name: 'Filter by impact' })).getByRole('button', { name: /Critical/ }));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/client/regulatory-updates/e1');
    expect(links[0]).toHaveTextContent('2 areas affected');
    await user.click(within(screen.getByRole('group', { name: 'Filter by impact' })).getByRole('button', { name: /All updates/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search updates' }), 'wording');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveTextContent('DEWR');
  });
});

describe('RegulatoryUpdateDetailPage', () => {
  it('shows the summary, affected areas, a glance card and a way to ask the consultant', async () => {
    wrap(<RegulatoryUpdateDetailPage />, '/client/regulatory-updates/e1');
    expect(await screen.findByRole('region', { name: 'Change summary' })).toHaveTextContent('New rules on third-party arrangements apply now.');
    expect(screen.getByRole('region', { name: 'Affected areas' })).toHaveTextContent('Third-party arrangements');
    const glance = screen.getByRole('region', { name: 'At a glance' });
    expect(glance).toHaveTextContent('Critical impact');
    expect(glance).toHaveTextContent('2');
    expect(within(glance).getByRole('link', { name: /Open the regulator page/ })).toHaveAttribute('href', 'https://asqa.gov.au');
    expect(screen.getByRole('button', { name: /Message your CSC/ })).toBeInTheDocument();
    expect(screen.getByText(/Human review required/)).toBeInTheDocument();
  });
});
