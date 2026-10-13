/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useClientPackageHoursByType } from "../use-client-package-hours-by-type";
import { useClientPackageHoursRecent } from "../use-client-package-hours-recent";
import { useClientPackageHoursTimeline } from "../use-client-package-hours-timeline";

// Regression guard: these three panels used to read security_invoker views over
// time_entries, whose RLS hides every row from a real client user (only the
// author and Vivacity staff pass). They must go through the tenant-gated
// SECURITY DEFINER RPCs instead, never .from() on the views.

let activeTenantId: number | null = 7532;

vi.mock("@/contexts/ClientTenantContext", () => ({
  useClientTenant: () => ({ activeTenantId }),
}));

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const CASES = [
  { name: "by type", hook: useClientPackageHoursByType, fn: "get_client_package_hours_by_type" },
  { name: "recent / time log", hook: useClientPackageHoursRecent, fn: "get_client_package_hours_recent" },
  { name: "timeline", hook: useClientPackageHoursTimeline, fn: "get_client_package_hours_timeline" },
] as const;

describe.each(CASES)("client package hours hook: $name", ({ hook, fn }) => {
  beforeEach(() => {
    activeTenantId = 7532;
    rpc.mockReset();
    from.mockReset();
  });

  it("calls the tenant-gated RPC with tenant and package ids, never the view", async () => {
    const rows = [{ package_instance_id: 99, tenant_id: 7532 }];
    rpc.mockResolvedValue({ data: rows, error: null });

    const { result } = renderHook(() => hook(99), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith(fn, { p_tenant_id: 7532, p_package_instance_id: 99 });
    expect(from).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(rows);
  });

  it("returns an empty list when the RPC returns null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => hook(99), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("surfaces RPC errors instead of rendering an empty panel", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Access denied" } });

    const { result } = renderHook(() => hook(99), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Access denied");
  });

  it("does not query without an active tenant or package", () => {
    activeTenantId = null;
    const noTenant = renderHook(() => hook(99), { wrapper: wrapper() });
    expect(noTenant.result.current.fetchStatus).toBe("idle");

    activeTenantId = 7532;
    const noPackage = renderHook(() => hook(null), { wrapper: wrapper() });
    expect(noPackage.result.current.fetchStatus).toBe("idle");

    expect(rpc).not.toHaveBeenCalled();
  });
});
