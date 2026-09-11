import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchTenantHeadOfficeTransferDate } from "@/hooks/fetchTenantHeadOfficeTransferDate";

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchTenantHeadOfficeTransferDate", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("loads the head-office transfer date for the exact tenant", async () => {
    const builder = query({ data: { transfer_date: "2026-09-10" }, error: null });
    mocks.from.mockReturnValue(builder);

    await expect(fetchTenantHeadOfficeTransferDate(42)).resolves.toBe("2026-09-10");
    expect(mocks.from).toHaveBeenCalledWith("tenant_addresses");
    expect(builder.select).toHaveBeenCalledWith("transfer_date");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "tenant_id", 42);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "address_type", "HO");
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns null for a missing row or query error", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: new Error("read failed") }));

    await expect(fetchTenantHeadOfficeTransferDate(42)).resolves.toBeNull();
  });
});
