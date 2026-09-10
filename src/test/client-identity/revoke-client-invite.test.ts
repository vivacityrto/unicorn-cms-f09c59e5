import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { revokeClientInvite } from "@/features/client-identity/revokeClientInvite";

describe("revokeClientInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("preserves the cancel-invite payload and returns its response", async () => {
    await expect(revokeClientInvite("invite-42")).resolves.toEqual({ ok: true });
    expect(mocks.invoke).toHaveBeenCalledWith("cancel-invite", {
      body: { invitation_id: "invite-42", reason: "Revoked by tenant admin" },
    });
  });

  it("surfaces structured Edge detail without changing the command contract", async () => {
    const context = {
      json: vi.fn().mockResolvedValue({ detail: "invitation already accepted" }),
    };
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("edge failed"), { context }),
    });

    await expect(revokeClientInvite("invite-42")).rejects.toThrow("invitation already accepted");
  });
});
