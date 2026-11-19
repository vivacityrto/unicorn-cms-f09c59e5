import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkforcePdpRow } from '@/features/pdp/workforce';

const state = vi.hoisted(() => ({
  tenant: { activeTenantId: 1 as number | null, canManagePortalUsers: true, tenantUserLoading: false },
  pdp: { data: [] as unknown[], isLoading: false, error: null as unknown },
}));

vi.mock('@/contexts/ClientTenantContext', () => ({ useClientTenant: () => state.tenant }));
vi.mock('@/features/pdp/useWorkforcePdp', () => ({ useWorkforcePdp: () => state.pdp }));
vi.mock('@/features/pdp/hooks', () => ({ useCycleSummary: () => ({ data: null, isLoading: false }) }));
vi.mock('@/features/pdp/api', () => ({ getCurrentCycle: () => Promise.resolve(null) }));
vi.mock('@/features/pdp/exportAuditPack', () => ({ exportPdpAuditPack: vi.fn(), resolveTenantName: vi.fn() }));

import StaffPdpsPage from './StaffPdpsPage';

let n = 0;
const row = (over: Partial<WorkforcePdpRow> = {}): WorkforcePdpRow => ({
  user_id: `u${++n}`, tenant_id: 1, audience_code: 'Trainer', cycle_year: 2026, cycle_end_date: '2027-03-31', status: 'active', percent_complete: 50,
  actual_pd_hours: 20, target_pd_hours: 40, days_until_cycle_end: 132, currency_status: 'on_track', staff_name: `Person ${n}`, staff_email: null, tenant_name: 'Org', ...over,
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.search}</output>;
}
const show = (url = '/client/staff-pdps') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <StaffPdpsPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.tenant = { activeTenantId: 1, canManagePortalUsers: true, tenantUserLoading: false };
  state.pdp = {
    isLoading: false,
    error: null,
    data: [
      row({ staff_name: 'Ana Overdue', currency_status: 'overdue', days_until_cycle_end: -10, cycle_end_date: '2026-11-09', percent_complete: 20, actual_pd_hours: 8 }),
      row({ staff_name: 'Ben Atrisk', currency_status: 'at_risk', days_until_cycle_end: 12, percent_complete: 60 }),
      row({ staff_name: 'Cy Done', currency_status: 'current', percent_complete: 100, actual_pd_hours: 40 }),
      row({ staff_name: 'Other Org Person', tenant_id: 2 }),
    ],
  };
});

describe('Staff PDPs page', () => {
  it('shows the access message, not data, to people who cannot manage the portal', () => {
    state.tenant.canManagePortalUsers = false;
    show();
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.queryByText('Ana Overdue')).not.toBeInTheDocument();
  });

  it('only ever shows the active organisation and counts it in the cards', () => {
    show();
    expect(screen.queryByText('Other Org Person')).not.toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Everyone/ })).getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Staff PDPs' })).toBeInTheDocument();
    expect(screen.getByText(/1 PDP is overdue/)).toBeInTheDocument();
  });

  it('filters the table from a card and writes it to the URL', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('status=overdue%2Cat_risk');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Ana Overdue')).toBeInTheDocument();
    expect(within(table).queryByText('Cy Done')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /Everyone/ }));
    expect(screen.getByTestId('where')).not.toHaveTextContent('status');
  });

  it('ignores an unknown status or audience in the address instead of hiding everyone', () => {
    show('/client/staff-pdps?status=bogus&audience=Nobody');
    expect(within(screen.getByRole('table')).getByText('Cy Done')).toBeInTheDocument();
  });

  it('says so when the list may be cut off at 2000 people', () => {
    state.pdp.data = Array.from({ length: 2000 }, () => row());
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/first 2,000 people/);
  });

  it('shows the empty state when nobody has a cycle', () => {
    state.pdp.data = [];
    show();
    expect(screen.getByText('No PDP cycle yet')).toBeInTheDocument();
  });

  it('shows an error without crashing', () => {
    state.pdp.error = new Error('boom');
    show();
    expect(screen.getByText(/Failed to load staff PDP data/)).toBeInTheDocument();
  });
});
