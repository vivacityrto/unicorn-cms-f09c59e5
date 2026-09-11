import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { deleteAskVivAssistantConversation } from "@/hooks/deleteAskVivAssistantConversation";

function queryBuilder(result: unknown) {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("deleteAskVivAssistantConversation", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("deletes exactly the requested Ask Viv conversation", async () => {
    const query = queryBuilder({ data: null, error: null });
    mocks.from.mockReturnValue(query);

    await expect(deleteAskVivAssistantConversation("conversation-1")).resolves.toBeUndefined();

    expect(mocks.from).toHaveBeenCalledWith("ask_viv_conversations");
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("id", "conversation-1");
  });

  it("preserves the delete error for the caller to handle", async () => {
    const error = new Error("conversation delete unavailable");
    mocks.from.mockReturnValue(queryBuilder({ data: null, error }));

    await expect(deleteAskVivAssistantConversation("conversation-error")).rejects.toBe(error);
  });
});
