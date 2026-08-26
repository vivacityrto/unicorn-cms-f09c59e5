/**
 * ProtectedRoute integration tests
 *
 * Covers the real guard component (not the shadow logic in useRBAC.test.ts):
 * - deny-by-default for client roles on unlisted internal routes
 * - allow-listed client routes render children
 * - profile-load failure renders Retry/Sign Out recovery instead of an
 *   infinite spinner, and those actions call the real recovery functions
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

vi.mock('@/hooks/useUserAccess', () => ({
  useUserAccess: () => ({
    hasAcademyOnly: false,
    hasFullAccess: true,
    isVivacityStaff: false,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

const mockSignOut = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { disabled: false }, error: null }),
        }),
      }),
    }),
    auth: {
      signOut: () => mockSignOut(),
    },
  },
}));

import { ProtectedRoute } from '@/components/ProtectedRoute';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const clientAdminProfile = {
  user_uuid: 'client-admin-uuid-101',
  unicorn_role: 'Admin',
  global_role: null,
  kpi_role: null,
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRBAC.mockReturnValue({
      canAccessRoute: () => true,
      isSuperAdmin: false,
      canAccessEOS: () => false,
      isVivacityTeam: false,
    });
  });

  it('denies a client role on an unlisted internal route (fail closed)', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'client-admin-uuid-101' },
      profile: clientAdminProfile,
      loading: false,
      profileError: null,
      refreshProfile: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/internal-feature');

    await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('allows a client role onto an explicitly allow-listed client route', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'client-admin-uuid-101' },
      profile: clientAdminProfile,
      loading: false,
      profileError: null,
      refreshProfile: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/settings');

    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });

  it('denies a client role on /settings/calendar despite the /settings exact match', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'client-admin-uuid-101' },
      profile: clientAdminProfile,
      loading: false,
      profileError: null,
      refreshProfile: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/settings/calendar');

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

      renderAt('/profile');

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

      renderAt('/profile');

      await userEvent.click(await screen.findByRole('button', { name: 'Sign Out' }));
      expect(signOut).toHaveBeenCalledTimes(1);
    });
  });
});
