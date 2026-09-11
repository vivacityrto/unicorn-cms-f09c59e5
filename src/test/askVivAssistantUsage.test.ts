import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchAskVivAssistantUsage } from "@/hooks/askVivAssistantUsage";

function queryBuilder(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchAskVivAssistantUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T04:00:00.000Z"));
    mocks.from.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads today's usage and maps configured caps and unlimited users", async () => {
    const settings = queryBuilder({
      data: {
        ask_viv_assistant_daily_token_cap: 1_000,
        ask_viv_assistant_unlimited_user_ids: ["user-1"],
      },
    });
    const usage = queryBuilder({ data: { input_tokens: 650, output_tokens: 150 } });
    mocks.from.mockImplementation((table: string) => (table === "app_settings" ? settings : usage));

    await expect(fetchAskVivAssistantUsage("user-1")).resolves.toEqual({
      usedTokens: 800,
      capTokens: 1_000,
      percentUsed: 80,
      unlimited: true,
    });

    expect(settings.select).toHaveBeenCalledWith(
      "ask_viv_assistant_daily_token_cap, ask_viv_assistant_unlimited_user_ids",
    );
    expect(usage.select).toHaveBeenCalledWith("input_tokens, output_tokens");
    expect(usage.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(usage.eq).toHaveBeenNthCalledWith(2, "usage_date", "2026-09-11");
  });

  it("preserves the default cap and zero-usage behavior when rows are absent", async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: null }));

    await expect(fetchAskVivAssistantUsage("user-2")).resolves.toEqual({
      usedTokens: 0,
      capTokens: 500_000,
      percentUsed: 0,
      unlimited: false,
    });
  });

  it("caps display percentage and avoids division when the configured cap is zero", async () => {
    const settings = queryBuilder({
      data: {
        ask_viv_assistant_daily_token_cap: 0,
        ask_viv_assistant_unlimited_user_ids: null,
      },
    });
    const usage = queryBuilder({ data: { input_tokens: 1_000, output_tokens: 1_000 } });
    mocks.from.mockImplementation((table: string) => (table === "app_settings" ? settings : usage));

    await expect(fetchAskVivAssistantUsage("user-3")).resolves.toMatchObject({
      usedTokens: 2_000,
      capTokens: 0,
      percentUsed: 0,
      unlimited: false,
    });
  });
});
