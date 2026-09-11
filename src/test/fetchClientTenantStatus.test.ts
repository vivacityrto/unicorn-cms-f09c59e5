import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchClientTenantStatus } from "@/hooks/fetchClientTenantStatus";

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchClientTenantStatus", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("loads status and merged-tenant metadata for the exact tenant", async () => {
    const builder = query({
      data: { status: "merged", metadata: { merged_into: 84 } },
      error: null,
    });
    mocks.from.mockReturnValue(builder);

    await expect(fetchClientTenantStatus(42)).resolves.toEqual({
      status: "merged",
      mergedInto: 84,
    });
    expect(mocks.from).toHaveBeenCalledWith("tenants");
    expect(builder.select).toHaveBeenCalledWith("status, metadata");
    expect(builder.eq).toHaveBeenCalledWith("id", 42);
    expect(builder.single).toHaveBeenCalledOnce();
  });

  it("returns null when the query has no data or an error", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: new Error("read failed") }));

    await expect(fetchClientTenantStatus(42)).resolves.toBeNull();
  });
});
