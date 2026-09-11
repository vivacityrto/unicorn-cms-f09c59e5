import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchTgaDebugData } from "@/hooks/fetchTgaDebugData";

function runQuery(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

function payloadQuery(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchTgaDebugData", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("loads both latest debug rows with their exact filters and limits", async () => {
    const runData = { id: "run-1", status: "complete", created_at: "2026-09-11T02:00:00Z" };
    const payloadData = { record_count: 4, fetched_at: "2026-09-11T02:01:00Z", endpoint: "tga" };
    const run = runQuery({ data: runData, error: null });
    const payload = payloadQuery({ data: payloadData, error: null });
    mocks.from.mockImplementation((table: string) =>
      table === "tga_rest_sync_jobs" ? run : payload
    );

    await expect(fetchTgaDebugData(42, "RTO-123")).resolves.toEqual({ runData, payloadData });
    expect(run.select).toHaveBeenCalledWith("id, status, created_at, rto_id, scope_counts, last_error, payload");
    expect(run.eq).toHaveBeenCalledWith("tenant_id", 42);
    expect(run.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(run.limit).toHaveBeenCalledWith(1);
    expect(payload.select).toHaveBeenCalledWith("record_count, fetched_at, endpoint, http_status, payload");
    expect(payload.eq).toHaveBeenNthCalledWith(1, "tenant_id", 42);
    expect(payload.eq).toHaveBeenNthCalledWith(2, "rto_code", "RTO-123");
    expect(payload.order).toHaveBeenCalledWith("fetched_at", { ascending: false });
    expect(payload.limit).toHaveBeenCalledWith(1);
  });

  it("returns null data when either debug query has an error", async () => {
    mocks.from.mockImplementation((table: string) =>
      table === "tga_rest_sync_jobs"
        ? runQuery({ data: null, error: new Error("run read failed") })
        : payloadQuery({ data: null, error: new Error("payload read failed") })
    );

    await expect(fetchTgaDebugData(42, "RTO-123")).resolves.toEqual({
      runData: null,
      payloadData: null,
    });
  });
});
