import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { setTenantUserRelationshipRole } from "@/features/client-identity/setRelationshipRole";

describe("setTenantUserRelationshipRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("keeps the transactional RPC payload and returns the legacy projection patch", async () => {
    await expect(setTenantUserRelationshipRole(42, "user-7", "secondary_contact")).resolves.toEqual({
      role: "parent",
      primary_contact: false,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("set_relationship_role", {
      p_tenant_id: 42,
      p_user_id: "user-7",
      p_relationship_role: "secondary_contact",
      p_reason: null,
    });
  });

  it("propagates the RPC error without synthesizing a client-side success", async () => {
    const error = new Error("role update rejected");
    mocks.rpc.mockResolvedValueOnce({ data: null, error });

    await expect(setTenantUserRelationshipRole(42, "user-7", "user")).rejects.toBe(error);
  });
});
