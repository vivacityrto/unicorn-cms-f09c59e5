import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchAskVivAssistantFlags } from "@/hooks/askVivAssistantAccess";

function queryBuilder(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchAskVivAssistantFlags", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the exact rollout flags from app_settings", async () => {
    const flags = {
      ask_viv_assistant_enabled: true,
      ask_viv_assistant_beta_user_ids: ["user-1"],
      ask_viv_assistant_all_staff: false,
    };
    const query = queryBuilder({ data: flags, error: null });
    mocks.from.mockReturnValue(query);

    await expect(fetchAskVivAssistantFlags()).resolves.toEqual(flags);

    expect(mocks.from).toHaveBeenCalledWith("app_settings");
    expect(query.select).toHaveBeenCalledWith(
      "ask_viv_assistant_enabled, ask_viv_assistant_beta_user_ids, ask_viv_assistant_all_staff",
    );
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns null and logs the existing error when the flags query fails", async () => {
    const error = new Error("flags unavailable");
    const query = queryBuilder({ data: null, error });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.from.mockReturnValue(query);

    await expect(fetchAskVivAssistantFlags()).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledWith("Error fetching Ask Viv Assistant flags:", error);
  });

  it("preserves a null row when the query succeeds without flags", async () => {
    mocks.from.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(fetchAskVivAssistantFlags()).resolves.toBeNull();
  });
});
