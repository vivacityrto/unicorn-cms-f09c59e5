import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchTgaLinkSyncStatus } from "@/hooks/fetchTgaLinkSyncStatus";

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchTgaLinkSyncStatus", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("loads the status for the exact tenant and RTO pair", async () => {
    const data = {
      last_sync_at: "2026-09-11T02:00:00Z",
      last_sync_status: "success",
      last_sync_error: null,
    };
    const builder = query({ data, error: null });
    mocks.from.mockReturnValue(builder);

    await expect(fetchTgaLinkSyncStatus(42, "RTO-123")).resolves.toEqual(data);
    expect(mocks.from).toHaveBeenCalledWith("tga_links");
    expect(builder.select).toHaveBeenCalledWith("last_sync_at, last_sync_status, last_sync_error");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "tenant_id", 42);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "rto_number", "RTO-123");
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns null for a missing row or query error", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: new Error("read failed") }));

    await expect(fetchTgaLinkSyncStatus(42, "RTO-123")).resolves.toBeNull();
  });
});
