import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { transferTgaDetails } from "@/hooks/transferTgaDetails";

function profileQuery(result: unknown) {
  return {
    upsert: vi.fn(() => Promise.resolve(result)),
  };
}

function tenantQuery(result: unknown) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("transferTgaDetails", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("normalizes summary fields and updates the tenant name for a legal name", async () => {
    const profile = profileQuery({ data: null, error: null });
    const tenant = tenantQuery({ data: null, error: new Error("ignored secondary error") });
    mocks.from.mockImplementation((table: string) => table === "tenant_profile" ? profile : tenant);

    await expect(transferTgaDetails(42, "user-7", {
      legal_name: "Acme &amp; Co",
      trading_name: "Acme Trading",
      abn: "12 345 678 901",
      acn: "123 456 789",
      web_address: "https://acme.example",
      organisation_type: "Registered Training Organisation",
    })).resolves.toBeUndefined();

    expect(profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 42,
        updated_by: "user-7",
        legal_name: "Acme & Co",
        trading_name: "Acme Trading",
        abn: "12 345 678 901",
        acn: "123 456 789",
        website: "https://acme.example",
        org_type: "registered_training_organisation",
        updated_at: expect.any(String),
      }),
      { onConflict: "tenant_id" }
    );
    expect(tenant.update).toHaveBeenCalledWith({
      name: "Acme & Co",
      updated_at: expect.any(String),
    });
    expect(tenant.eq).toHaveBeenCalledWith("id", 42);
  });

  it("does not perform the secondary tenant-name update without a legal name", async () => {
    const profile = profileQuery({ data: null, error: null });
    const tenant = tenantQuery({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => table === "tenant_profile" ? profile : tenant);

    await expect(transferTgaDetails(42, "user-7", { trading_name: "Acme Trading" })).resolves.toBeUndefined();

    expect(profile.upsert).toHaveBeenCalledOnce();
    expect(tenant.update).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("propagates a tenant-profile write error and skips the secondary update", async () => {
    const profile = profileQuery({ data: null, error: new Error("profile write failed") });
    const tenant = tenantQuery({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => table === "tenant_profile" ? profile : tenant);

    await expect(
      transferTgaDetails(42, "user-7", { legal_name: "Acme" })
    ).rejects.toThrow("profile write failed");
    expect(tenant.update).not.toHaveBeenCalled();
  });
});
