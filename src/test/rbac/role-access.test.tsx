import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ADMIN_ROUTES, EOS_ROUTES, isClientAccessibleRoute } from "@/hooks/useRBAC";
import { usePermissionDetailed } from "@/hooks/usePermission";

/**
 * Role-Based Access Control (RBAC) Test Suite
 *
 * Route/module-level checks below exercise the real exports from
 * useRBAC.tsx (ADMIN_ROUTES / EOS_ROUTES / isClientAccessibleRoute),
 * organized by role rather than by route category — src/test/rbac/useRBAC.test.ts
 * covers the same logic from the route-category angle, so treat that file
 * as the source of truth if the two ever disagree.
 *
 * Feature-level checks (Resource Hub content management, system
 * configuration) go through the real usePermissionDetailed() hook against
 * mocked role_permissions rows shaped like the live table (verified via a
 * read-only query on 2026-08-26 — see the RBAC/security remediation
 * project memory).
 *
 * This file previously contained 22 `expect(true).toBe(true)` placeholder
 * tests (F-023 in docs/audit-report-2026-08-26.md) plus a stale fixture
 * using non-existent role strings ("Client Admin"/"Client User" — the real
 * values are "Admin"/"User"). Rewritten 2026-08-26.
 */

// Real client-role values (unicorn_role), not the "Client Admin"/"Client User"
// strings the old placeholder fixtures used — those never matched anything
// the app actually checks against.
function isVivacityTeam(role: string): boolean {
  return ["Super Admin", "Team Leader", "Team Member"].includes(role);
}

function canAccessRoute(role: string, path: string): boolean {
  const isClientRoute = isClientAccessibleRoute(path);
  if (!isClientRoute && !isVivacityTeam(role)) return false;
  if (ADMIN_ROUTES.some((r) => path.startsWith(r))) return role === "Super Admin";
  if (EOS_ROUTES.some((r) => path.startsWith(r))) return isVivacityTeam(role);
  return true;
}

describe("Role-Based Access Control — routes/modules", () => {
  describe("SuperAdmin", () => {
    it("has access to admin modules", () => {
      expect(canAccessRoute("Super Admin", "/manage-users")).toBe(true);
      expect(canAccessRoute("Super Admin", "/admin/manage-packages")).toBe(true);
    });

    it("has access to EOS modules", () => {
      expect(canAccessRoute("Super Admin", "/eos/scorecard")).toBe(true);
    });

    it("has access to tenant-scoped client routes too (cross-tenant visibility is enforced by RLS, not this route gate)", () => {
      expect(canAccessRoute("Super Admin", "/client/home")).toBe(true);
    });
  });

  describe("Team Leader", () => {
    it("has access to EOS modules", () => {
      expect(canAccessRoute("Team Leader", "/eos/rocks")).toBe(true);
    });

    it("does NOT have access to admin modules", () => {
      expect(canAccessRoute("Team Leader", "/manage-users")).toBe(false);
      expect(canAccessRoute("Team Leader", "/admin/manage-packages")).toBe(false);
    });
  });

  describe("Team Member", () => {
    it("has access to EOS modules", () => {
      expect(canAccessRoute("Team Member", "/eos/qc")).toBe(true);
    });

    it("does NOT have access to admin modules", () => {
      expect(canAccessRoute("Team Member", "/manage-users")).toBe(false);
    });
  });

  describe("Client Admin / Client User (unicorn_role 'Admin' / 'User')", () => {
    it("has access to their own client-portal routes only", () => {
      expect(canAccessRoute("Admin", "/client/home")).toBe(true);
      expect(canAccessRoute("User", "/client/packages")).toBe(true);
    });

    it("does NOT have access to unlisted internal routes (fail closed)", () => {
      expect(canAccessRoute("Admin", "/clients")).toBe(false);
      expect(canAccessRoute("User", "/internal-feature")).toBe(false);
    });

    it("does NOT have access to admin or EOS modules", () => {
      expect(canAccessRoute("Admin", "/manage-users")).toBe(false);
      expect(canAccessRoute("Admin", "/eos/rocks")).toBe(false);
    });
  });
});

// ── Feature-level (role_permissions table) checks ──────────────────────────

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockRolePermissionsSelect = vi.fn();
const mockUserRolesSelect = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "role_permissions") {
        return { select: mockRolePermissionsSelect };
      }
      if (table === "user_roles") {
        return { select: () => ({ eq: mockUserRolesSelect }) };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  },
}));

// Shape verified against the live role_permissions table on 2026-08-26.
const ROLE_PERMISSIONS_FIXTURE = [
  { feature_key: "admin.system_config.manage", role: "Super Admin", level: "full" },
  { feature_key: "admin.system_config.manage", role: "Team Leader", level: "none" },
  { feature_key: "resource_hub.approve", role: "Super Admin", level: "full" },
  { feature_key: "resource_hub.approve", role: "Team Leader", level: "full" },
];

function renderPermission(featureKey: string, role: string, isSuperAdmin: boolean) {
  mockUseAuth.mockReturnValue({
    user: { id: `${role}-uuid` },
    profile: { unicorn_role: role },
    isSuperAdmin: () => isSuperAdmin,
  });
  mockRolePermissionsSelect.mockResolvedValue({ data: ROLE_PERMISSIONS_FIXTURE, error: null });
  mockUserRolesSelect.mockResolvedValue({ data: [], error: null });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => usePermissionDetailed(featureKey, "full"), {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

describe("Role-Based Access Control — feature permissions (role_permissions)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Team Leader has Resource Hub content management (resource_hub.approve = full)", async () => {
    const { result } = renderPermission("resource_hub.approve", "Team Leader", false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.granted).toBe(true);
  });

  it("Team Leader does NOT have system configuration access (admin.system_config.manage = none)", async () => {
    const { result } = renderPermission("admin.system_config.manage", "Team Leader", false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.granted).toBe(false);
  });

  it("Team Member does NOT have system configuration access (no role_permissions row at all)", async () => {
    const { result } = renderPermission("admin.system_config.manage", "Team Member", false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.granted).toBe(false);
  });

  it("Super Admin always has access regardless of the role_permissions table", async () => {
    const { result } = renderPermission("admin.system_config.manage", "Super Admin", true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.granted).toBe(true);
  });
});

/**
 * Deliberately not covered here (removed rather than left as placeholders):
 *
 * - "Client Admin can manage tenant members" — this goes through
 *   useAuth().hasTenantAdmin(tenantId), which checks the tenant_members
 *   table directly, not role_permissions/usePermissionDetailed. Needs its
 *   own test against that hook, not a variant of the fixture above.
 * - "Archived users are denied access / redirected to login" — verified
 *   2026-08-26 that no frontend code (useAuth.tsx, useRBAC.tsx,
 *   ProtectedRoute.tsx) reads `profile.archived`, and no Postgres function
 *   gates login/access on it either (only ProtectedRoute's separate
 *   `disabled`-column check exists). Writing a passing test for this would
 *   assert a control that doesn't exist. If archived-user denial is
 *   intended product behavior, that's an open gap to implement, not a test
 *   gap to fill.
 */
