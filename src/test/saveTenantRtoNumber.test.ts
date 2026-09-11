import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { saveTenantRtoNumber } from "@/hooks/saveTenantRtoNumber";

describe("saveTenantRtoNumber", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("updates the tenant with the RTO number and a current timestamp", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ update });

    await saveTenantRtoNumber(42, "RTO-123");

    expect(mocks.from).toHaveBeenCalledWith("tenants");
    expect(update).toHaveBeenCalledWith({
      rto_id: "RTO-123",
      updated_at: expect.any(String),
    });
    expect(eq).toHaveBeenCalledWith("id", 42);
    const [{ updated_at: updatedAt }] = update.mock.calls[0];
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
  });

  it("propagates the update error to the caller", async () => {
    const error = new Error("tenant update failed");
    const eq = vi.fn().mockResolvedValue({ error });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ update });

    await expect(saveTenantRtoNumber(42, "RTO-123")).rejects.toBe(error);
  });
});
