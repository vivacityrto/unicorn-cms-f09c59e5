import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { sendClientInvite } from "@/features/client-identity/sendClientInvite";

describe("sendClientInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("preserves the invite-user payload while normalizing user input", async () => {
    await expect(
      sendClientInvite(42, {
        email: "  Person@Example.COM ",
        firstName: "  Person ",
        lastName: " Example ",
        accessLevel: "secondary",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.invoke).toHaveBeenCalledWith("invite-user", {
      body: {
        email: "person@example.com",
        first_name: "Person",
        last_name: "Example",
        invite_as: "CLIENT",
        tenant_id: 42,
        unicorn_role: "Admin",
        relationship_role: "secondary_contact",
      },
    });
  });

  it("preserves Edge error detail and code for the caller", async () => {
    const context = {
      json: vi.fn().mockResolvedValue({ detail: "secondary contact exists", code: "SECONDARY_CONTACT_TAKEN" }),
    };
    mocks.invoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error("edge failed"), { context }) });

    const error = await sendClientInvite(42, {
      email: "person@example.com",
      firstName: "Person",
      lastName: "Example",
      accessLevel: "secondary",
    }).catch((value: unknown) => value as Error & { code?: string });

    expect(error).toMatchObject({ message: "secondary contact exists", code: "SECONDARY_CONTACT_TAKEN" });
  });

  it("does not invoke the Edge function without an active tenant", async () => {
    await expect(
      sendClientInvite(null, {
        email: "person@example.com",
        firstName: "Person",
        lastName: "Example",
        accessLevel: "user",
      }),
    ).rejects.toThrow("No active tenant");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
