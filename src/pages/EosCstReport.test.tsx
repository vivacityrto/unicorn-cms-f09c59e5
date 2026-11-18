import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CstReport } from '@/features/eos-cst/cstReport';

const totals = { live_rtos: 0, client_users: 0, active_users: 0, rtos_active: 0, rtos_with_users: 0, never_signed_in: 0, certificates: 0, prior_certificates: 0 };
const rto = (id: number, users: number, active: number, never = 0, certs = 0) => ({
  tenant_id: id,
  tenant_name: `Client ${id}`,
  client_users: users,
  active_users: active,
  never_signed_in: never,
  certificates: certs,
  prior_certificates: 0,
  last_active_at: null,
});

const report: CstReport = {
  period: 'month',
  start: '2026-10-31T13:00:00Z',
  end: '2026-11-30T13:00:00Z',
  prior_start: '2026-09-30T13:00:00Z',
  prior_end: '2026-10-31T13:00:00Z',
  generated_at: '2026-11-18T00:00:00Z',
  totals: { ...totals, live_rtos: 3, client_users: 20, active_users: 6, never_signed_in: 4, certificates: 2, prior_certificates: 5 },
  csc: [
    { ...totals, csc_user_id: 'a', csc_name: 'Alex', live_rtos: 2, client_users: 10, active_users: 6, never_signed_in: 1, certificates: 2, prior_certificates: 5, rtos: [rto(1, 6, 6, 1, 2), rto(2, 4, 0)] },
    { ...totals, csc_user_id: 'b', csc_name: 'Bo', live_rtos: 1, client_users: 10, active_users: 0, never_signed_in: 3, certificates: 0, rtos: [rto(3, 10, 0, 3)] },
  ],
};

vi.mock('@/features/eos-cst/useCstReport', () => ({ useCstReport: () => ({ data: report, isLoading: false, error: null, isFetching: false }) }));
vi.mock('@/features/eos-scorecard/useMetricReport', () => ({
  useAcademyBetween: () => ({
    data: { enrolled: 9, selfEnrolled: 4, automatic: 5, other: 0, completed: 3, topCourses: [{ title: 'Intro to Compliance', enrolled: 6, completed: 2 }], stalled: [], byTenant: { 1: { enrolled: 9, completed: 3 } } },
    isLoading: false,
    error: null,
  }),
  useCertificatesBetween: () => ({ data: [{ id: '1', learner: 'Sam Lee', client: 'Client 1', course: 'Intro to Compliance', issuedAt: '2026-11-03T02:00:00Z', number: null }], isLoading: false, error: null }),
  useNeverSignedInPeople: () => ({ data: [{ id: 'x', name: 'Pat Doe', client: 'Client 3', addedOn: '2026-09-01T00:00:00Z' }], isLoading: false, error: null }),
}));
vi.mock('@/components/eos/scorecard-review/ClientDetailPanel', () => ({ ClientDetailPanel: ({ row }: { row: { name: string } }) => <p>People at {row.name}</p> }));

import EosCstReport from './EosCstReport';

const renderPage = () =>
  render(
    <MemoryRouter>
      <EosCstReport />
    </MemoryRouter>,
  );

describe('Client activity report cards', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('shows four cards, with portal use chosen and explained first', () => {
    renderPage();
    const cards = within(screen.getByRole('region', { name: 'Key numbers' })).getAllByRole('button');
    expect(cards).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Client users using the portal/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Why use of the portal is where it is' })).toBeInTheDocument();
  });

  it('changes the section below when another card is chosen', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Certificates issued/ }));
    expect(screen.getByRole('button', { name: /Certificates issued/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'What is behind the certificates' })).toBeInTheDocument();
    expect(screen.getByText('Sam Lee')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Why use of the portal is where it is' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Users who never signed in/ }));
    expect(screen.getByText('Pat Doe')).toBeInTheDocument();
  });

  it('includes Academy analytics', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = screen.getByRole('button', { name: /Academy: courses finished/ });
    expect(card).toHaveTextContent('3');
    await user.click(card);
    const panel = screen.getByRole('region', { name: 'What is happening in the Academy' });
    expect(within(panel).getByText('Intro to Compliance')).toBeInTheDocument();
    expect(within(panel).getByText('Clients using the Academy')).toBeInTheDocument();
  });

  it('opens a client in place from the portal panel and comes back', async () => {
    const user = userEvent.setup();
    renderPage();
    const panel = screen.getByRole('region', { name: 'Why use of the portal is where it is' });
    await user.click(within(panel).getByRole('button', { name: /Client 3/ }));
    expect(screen.getByText('People at Client 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to Clients/ }));
    expect(within(screen.getByRole('region', { name: 'Why use of the portal is where it is' })).getByRole('button', { name: /Client 3/ })).toBeInTheDocument();
  });
});
