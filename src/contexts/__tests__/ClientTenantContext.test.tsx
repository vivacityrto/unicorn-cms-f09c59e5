/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ClientTenantProvider, useClientTenant } from "@/contexts/ClientTenantContext";

// ---- Mocks ------------------------------------------------------------

const mockProfile: { user_uuid: string; tenant_id: number | null } | null = {
  user_uuid: "u-1",
  tenant_id: 7532,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

vi.mock("@/contexts/ClientPreviewContext", () => ({
  useClientPreview: () => ({ isPreviewMode: false, previewTenant: null }),
}));

// Configurable supabase mock
type RelationshipRole =
  | "primary_contact"
  | "secondary_contact"
  | "user"
  | "academy_user"
  | null;

type TURow = {
  tenant_id: number;
  access_scope: string;
  relationship_role: RelationshipRole;
};

const dbState: {
  tenantUserRows: TURow[]; // rows for user u-1 across all tenants (for resolution)
} = { tenantUserRows: [] };

vi.mock("@/integrations/supabase/client", () => {
  const tenantsBuilder = () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: { logo_path: null, academy_access_enabled: false },
          error: null,
        }),
      }),
    }),
  });

  interface TenantUsersQueryBuilder {
    select: () => TenantUsersQueryBuilder;
    eq: (col: string, val: unknown) => TenantUsersQueryBuilder;
    maybeSingle: () => Promise<{ data: TURow | null; error: null }>;
    then: (resolve: (v: { data: TURow[]; error: null }) => void) => void;
  }

  const tenantUsersBuilder = () => {
    let filterTenant: number | null = null;
    const builder: TenantUsersQueryBuilder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        if (col === "tenant_id") filterTenant = Number(val);
        return builder;
      },
      maybeSingle: async () => {
        const row =
          filterTenant != null
            ? dbState.tenantUserRows.find((r) => r.tenant_id === filterTenant) ?? null
            : dbState.tenantUserRows[0] ?? null;
        return { data: row, error: null };
      },
      then: (resolve: (v: { data: TURow[]; error: null }) => void) =>
        resolve({ data: dbState.tenantUserRows, error: null }),
    };
    return builder;
  };

  return {
    supabase: {
      from: (table: string) =>
        table === "tenant_users" ? tenantUsersBuilder() : tenantsBuilder(),
      storage: {
        from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }),
      },
    },
  };
});

// ---- Harness ----------------------------------------------------------

let captured: ReturnType<typeof useClientTenant> | null = null;
function Probe() {
  captured = useClientTenant();
  return null;
}

function renderCtx() {
  captured = null;
  return render(
    <ClientTenantProvider>
      <Probe />
    </ClientTenantProvider>
  );
}

beforeEach(() => {
  mockProfile.user_uuid = "u-1";
  mockProfile.tenant_id = 7532;
  dbState.tenantUserRows = [];
});

// ---- Tests ------------------------------------------------------------

describe("ClientTenantContext gating", () => {
  it("primary_contact + full scope -> portal + manage users true", async () => {
    dbState.tenantUserRows = [
      { tenant_id: 7532, access_scope: "full", relationship_role: "primary_contact" },
    ];
    renderCtx();
    await waitFor(() => expect(captured?.tenantUserLoading).toBe(false));
    expect(captured?.canAccessClientPortal).toBe(true);
    expect(captured?.canManagePortalUsers).toBe(true);
    expect(captured?.isAcademyOnly).toBe(false);
  });

  it("secondary_contact + full scope -> portal + manage users true", async () => {
    dbState.tenantUserRows = [
      { tenant_id: 7532, access_scope: "full", relationship_role: "secondary_contact" },
    ];
    renderCtx();
    await waitFor(() => expect(captured?.tenantUserLoading).toBe(false));
    expect(captured?.canAccessClientPortal).toBe(true);
    expect(captured?.canManagePortalUsers).toBe(true);
    expect(captured?.isAcademyOnly).toBe(false);
  });

  it("user + full scope -> portal true, manage false, academyOnly false", async () => {
    dbState.tenantUserRows = [
      { tenant_id: 7532, access_scope: "full", relationship_role: "user" },
    ];
    renderCtx();
    await waitFor(() => expect(captured?.tenantUserLoading).toBe(false));
    expect(captured?.canAccessClientPortal).toBe(true);
    expect(captured?.canManagePortalUsers).toBe(false);
    expect(captured?.isAcademyOnly).toBe(false);
  });

  it("academy_user + academy_only scope -> isAcademyOnly true, portal false", async () => {
    dbState.tenantUserRows = [
      { tenant_id: 7532, access_scope: "academy_only", relationship_role: "academy_user" },
    ];
    renderCtx();
    await waitFor(() => expect(captured?.tenantUserLoading).toBe(false));
    expect(captured?.canAccessClientPortal).toBe(false);
    expect(captured?.canManagePortalUsers).toBe(false);
    expect(captured?.isAcademyOnly).toBe(true);
  });

  it("relationship_role null + full scope -> all three false (defensive)", async () => {
    dbState.tenantUserRows = [
      { tenant_id: 7532, access_scope: "full", relationship_role: null },
    ];
    renderCtx();
    await waitFor(() => expect(captured?.tenantUserLoading).toBe(false));
    expect(captured?.canAccessClientPortal).toBe(false);
    expect(captured?.canManagePortalUsers).toBe(false);
    expect(captured?.isAcademyOnly).toBe(false);
  });

  it("loading state -> all gates false", async () => {
    dbState.tenantUserRows = [];
    renderCtx();
    expect(captured?.canAccessClientPortal).toBe(false);
    expect(captured?.canManagePortalUsers).toBe(false);
    expect(captured?.isAcademyOnly).toBe(false);
  });

  it("resilient resolution: users.tenant_id null + exactly one tenant_users row -> resolves & grants secondary access", async () => {
    mockProfile.tenant_id = null;
    dbState.tenantUserRows = [
      { tenant_id: 9001, access_scope: "full", relationship_role: "secondary_contact" },
    ];
    renderCtx();
    await waitFor(() => expect(captured?.activeTenantId).toBe(9001));
    await waitFor(() => expect(captured?.tenantUserLoading).toBe(false));
    expect(captured?.canAccessClientPortal).toBe(true);
  });

  it("multi-row defensiveness: users.tenant_id null + 2 tenant_users rows -> activeTenantId stays null and warns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProfile.tenant_id = null;
    dbState.tenantUserRows = [
      { tenant_id: 9001, access_scope: "full", relationship_role: "secondary_contact" },
      { tenant_id: 9002, access_scope: "full", relationship_role: "primary_contact" },
    ];
    renderCtx();
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("refusing to pick")
      );
    });
    expect(captured?.activeTenantId).toBeNull();
    expect(captured?.canAccessClientPortal).toBe(false);
    expect(captured?.canManagePortalUsers).toBe(false);
    expect(captured?.isAcademyOnly).toBe(false);
    warnSpy.mockRestore();
  });
});
