import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { copyClientInviteLink } from "@/features/client-identity/copyClientInviteLink";

describe("copyClientInviteLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { action_link: "https://example.test/invite/42" }, error: null });
  });

  it("preserves the copy-link command payload and returns the action link", async () => {
    await expect(copyClientInviteLink("invite-42")).resolves.toEqual({
      action_link: "https://example.test/invite/42",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("resend-invite", {
      body: { invitation_id: "invite-42", skip_email: true },
    });
  });

  it("surfaces structured Edge detail without changing the command contract", async () => {
    const context = {
      json: vi.fn().mockResolvedValue({ detail: "invitation is no longer pending" }),
    };
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("edge failed"), { context }),
    });

    await expect(copyClientInviteLink("invite-42")).rejects.toThrow("invitation is no longer pending");
  });

  it("rejects a successful response that does not contain an action link", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });

    await expect(copyClientInviteLink("invite-42")).rejects.toThrow(
      "The resend-invite function did not return a link.",
    );
  });
});
