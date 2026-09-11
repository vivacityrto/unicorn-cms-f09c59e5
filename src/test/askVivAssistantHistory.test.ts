import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchAskVivAssistantHistory } from "@/hooks/askVivAssistantHistory";

function turnQuery(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

function conversationQuery(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

describe("fetchAskVivAssistantHistory", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("deduplicates assistant turn IDs and loads the newest 30 conversations", async () => {
    const turns = turnQuery({
      data: [
        { conversation_id: "conversation-1" },
        { conversation_id: "conversation-1" },
        { conversation_id: "conversation-2" },
      ],
      error: null,
    });
    const conversations = [
      { id: "conversation-2", title: "Second", updated_at: "2026-09-11T02:00:00Z" },
      { id: "conversation-1", title: null, updated_at: "2026-09-11T01:00:00Z" },
    ];
    const conversationRows = conversationQuery({ data: conversations, error: null });
    mocks.from.mockImplementation((table: string) =>
      table === "ask_viv_turns" ? turns : conversationRows
    );

    await expect(fetchAskVivAssistantHistory()).resolves.toEqual(conversations);
    expect(turns.select).toHaveBeenCalledWith("conversation_id");
    expect(turns.eq).toHaveBeenCalledWith("mode", "assistant");
    expect(conversationRows.select).toHaveBeenCalledWith("id, title, updated_at");
    expect(conversationRows.in).toHaveBeenCalledWith("id", ["conversation-1", "conversation-2"]);
    expect(conversationRows.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(conversationRows.limit).toHaveBeenCalledWith(30);
  });

  it("short-circuits before querying conversations when there are no assistant turns", async () => {
    const turns = turnQuery({ data: [], error: null });
    mocks.from.mockReturnValue(turns);

    await expect(fetchAskVivAssistantHistory()).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("ask_viv_turns");
  });

  it("propagates an assistant-turn query error", async () => {
    const error = new Error("turn query failed");
    mocks.from.mockReturnValue(turnQuery({ data: null, error }));

    await expect(fetchAskVivAssistantHistory()).rejects.toBe(error);
  });

  it("propagates a conversation query error", async () => {
    const error = new Error("conversation query failed");
    mocks.from.mockImplementation((table: string) =>
      table === "ask_viv_turns"
        ? turnQuery({ data: [{ conversation_id: "conversation-1" }], error: null })
        : conversationQuery({ data: null, error })
    );

    await expect(fetchAskVivAssistantHistory()).rejects.toBe(error);
  });
});
