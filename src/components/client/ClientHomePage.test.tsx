import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';

const state = vi.hoisted(() => ({ packages: [] as unknown[] }));

vi.mock('@/components/help-center', () => ({ useHelpCenter: () => ({ openHelpCenter: vi.fn(), canAccess: true }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { first_name: 'Carl' } }) }));
vi.mock('@/hooks/useClientActingUser', () => ({ useClientActingUser: () => ({ actingUser: null }) }));
vi.mock('@/contexts/ClientPreviewContext', () => ({ useClientPreview: () => ({ isPreviewMode: false }) }));
vi.mock('@/contexts/ClientTenantContext', () => ({ useClientTenant: () => ({ activeTenantId: 1 }) }));
vi.mock('@/hooks/use-client-home-hero', () => ({
  useClientHomeHero: () => ({
    data: { member_since: '2026-06-01', csc_user_id: 'u1', csc_display_name: 'Nova Canto', csc_email: 'nova@vivacity.com.au', csc_role_label: 'CSC', csc_avatar_url: null, audits_total: 0 },
  }),
}));
vi.mock('@/hooks/use-client-home-feed', () => ({
  useClientHomeFeed: () => ({ comingUp: [], needsAttention: [], recentActivity: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/use-client-package-dashboard', () => ({
  useClientPackageDashboards: () => ({ data: state.packages, isLoading: false }),
}));
vi.mock('./home/HomeVivacityServicesSection', () => ({ HomeVivacityServicesSection: () => null }));
vi.mock('./ClientUpcomingAuditSection', () => ({ ClientUpcomingAuditSection: () => null }));
vi.mock('./AuditPreparationSection', () => ({ AuditPreparationSection: () => null }));
vi.mock('./ClientAuditReportsSection', () => ({ ClientAuditReportsSection: () => null }));

import { ClientHomePage } from './ClientHomePage';

const row = (over: Partial<ClientPackageDashboardRow> = {}) =>
  ({
    package_instance_id: 1, tenant_id: 1, package_name: 'Ruby RTO Membership', package_type: null, progress_mode: null, manager_id: null,
    is_complete: false, start_date: '2026-06-01', end_date: '2099-03-01', hours_included: 40, hours_added: 0, hours_total: 40, hours_used: 38,
    hours_remaining: 2, hours_pct_used: 95, stages_total: 8, stages_complete: 2, current_stage_sortorder: 3, current_stage_shortname: 'Setup Client',
    open_tasks: 4, overdue_tasks: 2, last_activity_at: '2020-01-01T00:00:00Z', pinned_note_title: null, pinned_note_text: null,
    pinned_note_priority: null, pinned_note_updated_at: null, pinned_note_severity: null, status_pill: 'stuck', ...over,
  }) as ClientPackageDashboardRow;

const page = () => render(<MemoryRouter><ClientHomePage /></MemoryRouter>);

describe('ClientHomePage', () => {
  it('keeps the greeting heading the smoke test looks for', () => {
    state.packages = [];
    page();
    expect(screen.getByRole('heading', { level: 1, name: /good (morning|afternoon|evening), Carl/i })).toBeInTheDocument();
  });

  it('shows key numbers, a package card with a plain reason for Stuck, and a summary', () => {
    state.packages = [row()];
    page();
    const numbers = screen.getByRole('region', { name: 'Key numbers' });
    expect(within(numbers).getByText('2 overdue')).toBeInTheDocument();
    expect(within(numbers).getByText('2 h')).toBeInTheDocument();
    const packages = screen.getByRole('region', { name: 'Your packages' });
    expect(within(packages).getByText('Ruby RTO Membership')).toBeInTheDocument();
    expect(within(packages).getByText(/hours used/i)).toBeInTheDocument();
    expect(within(packages).getByText(/2 overdue tasks/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'At a glance' })).toHaveTextContent('2 of 8 stages are complete');
  });

  it('says so when there are no active packages and does not draw empty numbers', () => {
    state.packages = [row({ is_complete: true })];
    page();
    expect(screen.queryByRole('region', { name: 'Key numbers' })).not.toBeInTheDocument();
    expect(screen.getByText('No active packages right now.')).toBeInTheDocument();
  });
});
