import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchInitialRegistrationContext } from "@/hooks/fetchInitialRegistrationContext";

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("fetchInitialRegistrationContext", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("short-circuits on an initial-registration lifecycle status", async () => {
    const tenant = query({ data: { lifecycle_status: "Initial Registration" }, error: null });
    mocks.from.mockReturnValue(tenant);

    await expect(fetchInitialRegistrationContext(42)).resolves.toBe(true);
    expect(mocks.from).toHaveBeenCalledWith("tenants");
    expect(tenant.select).toHaveBeenCalledWith("lifecycle_status");
    expect(tenant.eq).toHaveBeenCalledWith("id", 42);
    expect(tenant.maybeSingle).toHaveBeenCalledOnce();
  });

  it("falls back to deduplicated package names and slugs", async () => {
    const tenant = query({ data: { lifecycle_status: "active" }, error: null });
    const packageInstances = query({
      data: [{ package_id: 7 }, { package_id: 7 }, { package_id: null }, { package_id: 9 }],
      error: null,
    });
    const packages = query({
      data: [{ name: "Core", slug: "initial-registration" }],
      error: null,
    });
    mocks.from.mockImplementation((table: string) =>
      table === "tenants" ? tenant : table === "package_instances" ? packageInstances : packages
    );

    await expect(fetchInitialRegistrationContext(42)).resolves.toBe(true);
    expect(packageInstances.select).toHaveBeenCalledWith("package_id");
    expect(packageInstances.eq).toHaveBeenCalledWith("tenant_id", 42);
    expect(packages.select).toHaveBeenCalledWith("name, slug");
    expect(packages.in).toHaveBeenCalledWith("id", [7, 9]);
  });

  it("returns false when no lifecycle or package match exists", async () => {
    const tenant = query({ data: { lifecycle_status: "active" }, error: null });
    const packageInstances = query({ data: [], error: null });
    mocks.from.mockImplementation((table: string) =>
      table === "tenants" ? tenant : packageInstances
    );

    await expect(fetchInitialRegistrationContext(42)).resolves.toBe(false);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});
