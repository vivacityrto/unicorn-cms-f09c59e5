import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchAskVivAssistantMessages } from "@/hooks/askVivAssistantMessages";

function queryBuilder(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchAskVivAssistantMessages", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("loads turns in chronological order and normalizes their roles", async () => {
    const query = queryBuilder({
      data: [
        { id: "turn-1", role: "user", content: "What is the status?", created_at: "2026-09-11T01:00:00Z" },
        { id: "turn-2", role: "assistant", content: "Here is the status.", created_at: "2026-09-11T01:00:02Z" },
        { id: "turn-3", role: "unexpected", content: "Legacy content", created_at: "2026-09-11T01:00:03Z" },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(query);

    await expect(fetchAskVivAssistantMessages("conversation-1")).resolves.toEqual([
      { id: "turn-1", role: "user", content: "What is the status?", created_at: "2026-09-11T01:00:00Z" },
      { id: "turn-2", role: "assistant", content: "Here is the status.", created_at: "2026-09-11T01:00:02Z" },
      { id: "turn-3", role: "user", content: "Legacy content", created_at: "2026-09-11T01:00:03Z" },
    ]);

    expect(mocks.from).toHaveBeenCalledWith("ask_viv_turns");
    expect(query.select).toHaveBeenCalledWith("id, role, content, created_at");
    expect(query.eq).toHaveBeenCalledWith("conversation_id", "conversation-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("returns an empty message list when the conversation has no turns", async () => {
    mocks.from.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(fetchAskVivAssistantMessages("conversation-empty")).resolves.toEqual([]);
  });

  it("preserves the conversation query error", async () => {
    const error = new Error("conversation unavailable");
    mocks.from.mockReturnValue(queryBuilder({ data: null, error }));

    await expect(fetchAskVivAssistantMessages("conversation-error")).rejects.toBe(error);
  });
});
