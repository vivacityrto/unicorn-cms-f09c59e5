import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

import { promoteContactViaInvite } from "@/features/client-identity/promoteContact";

const contact = {
  id: 7,
  first_name: "Taylor",
  last_name: "Contact",
  email: "taylor@example.com",
  position_type: null,
  status: "active" as const,
  promoted_to_user_id: null,
  promoted_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("promoteContactViaInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("preserves the real-email invite-user promotion contract", async () => {
    await expect(promoteContactViaInvite(42, contact, "secondary_contact")).resolves.toEqual({
      data: { ok: true },
      error: null,
    });

    expect(mocks.invoke).toHaveBeenCalledWith("invite-user", {
      body: {
        email: "taylor@example.com",
        first_name: "Taylor",
        last_name: "Contact",
        invite_as: "CLIENT",
        tenant_id: 42,
        unicorn_role: "Admin",
        relationship_role: "secondary_contact",
        skip_email: false,
        job_title: null,
      },
    });
  });

  it("keeps the authentication guard before invoking the Edge function", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await expect(promoteContactViaInvite(42, contact, "user")).rejects.toThrow("Authentication required");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
