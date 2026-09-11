import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchAskVivSuggestedFaqs } from "@/hooks/askVivSuggestedFaqs";

function queryBuilder(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchAskVivSuggestedFaqs", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("reads and maps ranked suggested prompts from the exact table contract", async () => {
    const query = queryBuilder({
      data: [
        { id: "faq-1", prompt_text: "What is the audit status?", category: "audits" },
        { id: "faq-2", prompt_text: "Show recent notes", category: null },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(query);

    await expect(fetchAskVivSuggestedFaqs()).resolves.toEqual([
      { id: "faq-1", prompt: "What is the audit status?", category: "audits" },
      { id: "faq-2", prompt: "Show recent notes", category: null },
    ]);

    expect(mocks.from).toHaveBeenCalledWith("ask_viv_suggested_faqs");
    expect(query.select).toHaveBeenCalledWith("id, prompt_text, category");
    expect(query.order).toHaveBeenCalledWith("rank", { ascending: true });
  });

  it("returns an empty list when the query succeeds without rows", async () => {
    mocks.from.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(fetchAskVivSuggestedFaqs()).resolves.toEqual([]);
  });

  it("preserves the existing query error for React Query to handle", async () => {
    const error = new Error("suggested prompts unavailable");
    mocks.from.mockReturnValue(queryBuilder({ data: null, error }));

    await expect(fetchAskVivSuggestedFaqs()).rejects.toBe(error);
  });
});
