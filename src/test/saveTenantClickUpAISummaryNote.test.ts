import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { saveTenantClickUpAISummaryNote } from "@/hooks/saveTenantClickUpAISummaryNote";

describe("saveTenantClickUpAISummaryNote", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("inserts the existing tenant-note payload", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert });

    await saveTenantClickUpAISummaryNote({
      tenantId: 42,
      question: "Summarise open tasks",
      response: "Three tasks remain.",
      userId: "user-123",
    });

    expect(mocks.from).toHaveBeenCalledWith("notes");
    expect(insert).toHaveBeenCalledWith({
      tenant_id: 42,
      title: "ClickUp AI: Summarise open tasks",
      note_details: "[ClickUp AI Summary]\n\n**Question:** Summarise open tasks\n\nThree tasks remain.",
      note_type: "ai_summary",
      created_by: "user-123",
      parent_type: "tenant",
      parent_id: 42,
    });
  });

  it("propagates the insert error to the caller", async () => {
    const error = new Error("note insert failed");
    const insert = vi.fn().mockResolvedValue({ error });
    mocks.from.mockReturnValue({ insert });

    await expect(
      saveTenantClickUpAISummaryNote({
        tenantId: 42,
        question: "Question",
        response: "Response",
        userId: "user-123",
      })
    ).rejects.toBe(error);
  });
});
