import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Regression: after "End Vivacity Academy Access" the tenant is refetched as
// disabled (header badge), but the Academy Access switch used to keep the value
// it was initialised with, so the page still looked enabled.

let tenantRows: unknown[] = [];

vi.mock("@/hooks/academy/useTenantAcademyAccess", () => ({
  useTenantSummaries: () => ({ data: tenantRows, isLoading: false }),
  useUpdateTenantAccess: () => ({ mutate: vi.fn(), isPending: false }),
  usePackageCourseRules: () => ({ data: [] }),
  useAddPackageCourseRule: () => ({ mutate: vi.fn() }),
  useRemovePackageCourseRule: () => ({ mutate: vi.fn() }),
  useRuleFormOptions: () => ({ packages: [], courses: [] }),
}));
vi.mock("@/hooks/usePermission", () => ({ usePermission: () => true }));
vi.mock("@/components/client/TenantInviteDialog", () => ({ TenantInviteDialog: () => null }));
vi.mock("@/components/client/ViewAsClientButton", () => ({ ViewAsClientButton: () => null }));
vi.mock("@/components/client/AcademyActivityDashboard", () => ({ AcademyActivityDashboard: () => null }));
vi.mock("@/components/client/ClientTimelineTab", () => ({ ClientTimelineTab: () => null }));
vi.mock("@/components/academy/admin/AcademyTenantUsersPanel", () => ({ AcademyTenantUsersPanel: () => null }));

import AcademyTenantDetail from "@/pages/superadmin/AcademyTenantDetail";

const tenant = (enabled: boolean) => ({
  id: 42,
  name: "Test Academy",
  academy_access_enabled: enabled,
  academy_max_users: 1,
  academy_subscription_expires_at: null,
  metadata: { academy_solo: { tier: "solo", status: enabled ? "activate" : "end" } },
  enrolled_count: 0,
  tenant_type: "academy_solo",
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/superadmin/academy/tenant-access/42"]}>
      <Routes>
        <Route path="/superadmin/academy/tenant-access/:tenantId" element={<AcademyTenantDetail />} />
      </Routes>
    </MemoryRouter>,
  );

describe("AcademyTenantDetail academy access switch", () => {
  beforeEach(() => {
    tenantRows = [tenant(true)];
  });

  it("starts on for an enabled tenant", () => {
    renderPage();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("turns off and disables invites when the tenant is refetched as disabled", async () => {
    const { rerender } = renderPage();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");

    tenantRows = [tenant(false)];
    rerender(
      <MemoryRouter initialEntries={["/superadmin/academy/tenant-access/42"]}>
        <Routes>
          <Route path="/superadmin/academy/tenant-access/:tenantId" element={<AcademyTenantDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"),
    );
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Invite Academy User/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
