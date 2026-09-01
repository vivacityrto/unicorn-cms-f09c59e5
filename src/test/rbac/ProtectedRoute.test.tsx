/**
 * ProtectedRoute integration tests
 *
 * Covers the real guard component (not the shadow logic in useRBAC.test.ts):
 * - deny-by-default for client roles on unlisted internal routes
 * - allow-listed client routes render children
 * - profile-load failure renders Retry/Sign Out recovery instead of an
 *   infinite spinner, and those actions call the real recovery functions
 * - the four explicit guard tiers (plain, requireSuperAdmin, allowedRoles,
 *   allowVivacityTeam) and location-sensitive admin/EOS behavior, added as
 *   PR 0 of docs/kb/reference/dashboard-direct-layout-migration-plan-2026-09-01.md
 *   ("guard/verification foundation") -- these tiers are the ones every
 *   subsequent DashboardLayout-composition PR must preserve exactly when
 *   moving a page's route registration, so a regression here is exactly the
 *   class of bug that plan exists to prevent (see PR #490, a guard-ordering
 *   regression in #489 found by exactly this kind of review).
 * - anonymous and disabled-account terminal states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseRBAC = vi.fn();
vi.mock('@/hooks/useRBAC', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useRBAC')>('@/hooks/useRBAC');
  return {
    ...actual,
    useRBAC: () => mockUseRBAC(),
  };
});

const mockUseUserAccess = vi.fn();
vi.mock('@/hooks/useUserAccess', () => ({
  useUserAccess: () => mockUseUserAccess(),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

const mockSignOut = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
    }),
    auth: {
      signOut: () => mockSignOut(),
    },
  },
}));

import { ProtectedRoute } from '@/components/ProtectedRoute';

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        <Route path="/academy" element={<div>Academy Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

function renderProtected(
  path: string,
  props: { requireSuperAdmin?: boolean; allowedRoles?: string[]; allowVivacityTeam?: boolean } = {}
) {
  return renderAt(
    path,
    <ProtectedRoute {...props}>
      <div>Protected Content</div>
    </ProtectedRoute>
  );
}

const clientAdminProfile = {
  user_uuid: 'client-admin-uuid-101',
  unicorn_role: 'Admin',
  global_role: null,
  kpi_role: null,
};

function staffProfile(unicorn_role: string, overrides: Partial<typeof clientAdminProfile> = {}) {
  return {
    user_uuid: `staff-${unicorn_role.replace(/\s+/g, '-').toLowerCase()}`,
    unicorn_role,
    global_role: null,
    kpi_role: null,
    ...overrides,
  };
}

function authedAs(profile: typeof clientAdminProfile) {
  mockUseAuth.mockReturnValue({
    user: { id: profile.user_uuid },
    profile,
    loading: false,
    profileError: null,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { disabled: false }, error: null });
    mockUseUserAccess.mockReturnValue({
      hasAcademyOnly: false,
      hasFullAccess: true,
      isVivacityStaff: false,
      isLoading: false,
    });
    mockUseRBAC.mockReturnValue({
      canAccessRoute: () => true,
      isSuperAdmin: false,
      canAccessEOS: () => false,
      isVivacityTeam: false,
    });
  });

  it('denies a client role on an unlisted internal route (fail closed)', async () => {
    authedAs(clientAdminProfile);
    renderProtected('/internal-feature');

    await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('allows a client role onto an explicitly allow-listed client route', async () => {
    authedAs(clientAdminProfile);
    renderProtected('/settings');

    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });

  it('denies a client role on /settings/calendar despite the /settings exact match', async () => {
    authedAs(clientAdminProfile);
    renderProtected('/settings/calendar');

    await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  describe('profile-load failure recovery', () => {
    it('renders Retry/Sign Out instead of an infinite spinner, and Retry calls refreshProfile', async () => {
      const refreshProfile = vi.fn();
      mockUseAuth.mockReturnValue({
        user: { id: 'client-admin-uuid-101' },
        profile: null,
        loading: false,
        profileError: 'We could not load your account profile. Please try again.',
        refreshProfile,
        signOut: vi.fn(),
      });

      renderProtected('/profile');

      expect(await screen.findByText("We couldn't load your account")).toBeInTheDocument();
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refreshProfile).toHaveBeenCalledTimes(1);
    });

    it('Sign Out calls the real signOut function', async () => {
      const signOut = vi.fn();
      mockUseAuth.mockReturnValue({
        user: { id: 'client-admin-uuid-101' },
        profile: null,
        loading: false,
        profileError: 'Your account profile is not available. Please contact support if this continues.',
        refreshProfile: vi.fn(),
        signOut,
      });

      renderProtected('/profile');

      await userEvent.click(await screen.findByRole('button', { name: 'Sign Out' }));
      expect(signOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('anonymous session', () => {
    it('redirects to /login without rendering children', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        profile: null,
        loading: false,
        profileError: null,
        refreshProfile: vi.fn(),
        signOut: vi.fn(),
      });

      renderProtected('/some-staff-page');

      await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('disabled account', () => {
    it('renders the Account Disabled card instead of children, and Sign Out signs out', async () => {
      authedAs(staffProfile('Team Member'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });
      mockMaybeSingle.mockResolvedValue({ data: { disabled: true }, error: null });

      renderProtected('/some-staff-page');

      expect(await screen.findByText('Account Disabled')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('academy-only user redirect', () => {
    it('redirects off a non-academy route to /academy', async () => {
      authedAs(staffProfile('User'));
      mockUseUserAccess.mockReturnValue({
        hasAcademyOnly: true,
        hasFullAccess: false,
        isVivacityStaff: false,
        isLoading: false,
      });

      renderProtected('/some-staff-page');

      await waitFor(() => expect(screen.getByText('Academy Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('does not redirect while already on an academy route', async () => {
      authedAs(staffProfile('User'));
      mockUseUserAccess.mockReturnValue({
        hasAcademyOnly: true,
        hasFullAccess: false,
        isVivacityStaff: false,
        isLoading: false,
      });

      renderProtected('/academy/courses');

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });
  });

  describe('requireSuperAdmin tier', () => {
    it('allows a SuperAdmin through', async () => {
      authedAs(staffProfile('Super Admin'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: true,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/superadmin/workforce-pdp', { requireSuperAdmin: true });

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });

    it('redirects a non-SuperAdmin Vivacity staff member to /dashboard without rendering children', async () => {
      authedAs(staffProfile('Team Leader'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/superadmin/workforce-pdp', { requireSuperAdmin: true });

      await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('allowedRoles tier (e.g. ACADEMY_BUILDER_ROLES)', () => {
    const ACADEMY_BUILDER_ROLES = ['Team Leader', 'Integrator', 'CSC'];

    it('allows a role explicitly on the list', async () => {
      authedAs(staffProfile('CSC'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/superadmin/academy/certificates', { allowedRoles: ACADEMY_BUILDER_ROLES });

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });

    it('allows SuperAdmin through implicitly even when not named on the list', async () => {
      authedAs(staffProfile('Super Admin'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: true,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/superadmin/academy/certificates', { allowedRoles: ACADEMY_BUILDER_ROLES });

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });

    it('redirects a Vivacity staff role not on the list and not SuperAdmin', async () => {
      authedAs(staffProfile('BGT'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/superadmin/academy/certificates', { allowedRoles: ACADEMY_BUILDER_ROLES });

      await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('allowVivacityTeam tier (broadens an admin-prefixed route to any internal staff)', () => {
    it('allows a non-SuperAdmin Vivacity staff member onto an admin-prefixed route', async () => {
      authedAs(staffProfile('Team Member'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => false, // not administration:access -- only allowVivacityTeam should let this through
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/administration/contacts', { allowVivacityTeam: true });

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });

    it('does not let a client role through the same admin-prefixed route despite allowVivacityTeam', async () => {
      // allowVivacityTeam only widens the *admin-route* check below the earlier
      // deny-by-default client gate -- it must never let a client-role user in.
      authedAs(clientAdminProfile);
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => false,
        isSuperAdmin: false,
        canAccessEOS: () => false,
        isVivacityTeam: false,
      });

      renderProtected('/administration/contacts', { allowVivacityTeam: true });

      await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('plain location-sensitive admin route (/admin/*, /administration/*)', () => {
    it('renders for a user canAccessRoute allows (e.g. real SuperAdmin)', async () => {
      authedAs(staffProfile('Super Admin'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: true,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/admin/team-users');

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });

    it('redirects a Vivacity staff member canAccessRoute denies, with no allowVivacityTeam escape hatch', async () => {
      authedAs(staffProfile('Team Member'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => false,
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/admin/team-users');

      await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('plain location-sensitive EOS route (/eos/*, /processes)', () => {
    it('renders for a user canAccessEOS allows', async () => {
      authedAs(staffProfile('Team Leader'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => true,
        isVivacityTeam: true,
      });

      renderProtected('/eos/scorecard');

      await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    });

    it('redirects a Vivacity staff member canAccessEOS denies', async () => {
      authedAs(staffProfile('BGT'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => false,
        isVivacityTeam: true,
      });

      renderProtected('/eos/scorecard');

      await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('applies the same EOS gate to /processes', async () => {
      authedAs(staffProfile('BGT'));
      mockUseRBAC.mockReturnValue({
        canAccessRoute: () => true,
        isSuperAdmin: false,
        canAccessEOS: () => false,
        isVivacityTeam: true,
      });

      renderProtected('/processes');

      await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });
});
