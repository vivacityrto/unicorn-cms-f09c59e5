import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { resendClientInvite } from "@/features/client-identity/resendClientInvite";

describe("resendClientInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("preserves the resend-invite command payload and returns its response", async () => {
    await expect(resendClientInvite("invite-42")).resolves.toEqual({ ok: true });
    expect(mocks.invoke).toHaveBeenCalledWith("resend-invite", {
      body: { invitation_id: "invite-42" },
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

    await expect(resendClientInvite("invite-42")).rejects.toThrow("invitation is no longer pending");
  });
});
