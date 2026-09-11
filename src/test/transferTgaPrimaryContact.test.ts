import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { transferTgaPrimaryContact } from "@/hooks/transferTgaPrimaryContact";

function query(result: unknown) {
  return {
    upsert: vi.fn(() => Promise.resolve(result)),
  };
}

describe("transferTgaPrimaryContact", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("prefers a Chief Executive contact and preserves the exact profile upsert", async () => {
    const builder = query({ data: null, error: null });
    mocks.from.mockReturnValue(builder);
    const contacts = [
      { contact_type: "PublicEnquiries", name: "Public Desk", email: "public@example.com", phone: "111" },
      { contact_type: "ChiefExecutive", name: "Chief Executive", email: "chief@example.com", phone: "222" },
    ];

    await expect(transferTgaPrimaryContact(42, "user-7", contacts)).resolves.toBe("Chief Executive");
    expect(mocks.from).toHaveBeenCalledWith("tenant_profile");
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 42,
        updated_by: "user-7",
        primary_contact_name: "Chief Executive",
        primary_contact_email: "chief@example.com",
        primary_contact_phone: "222",
        updated_at: expect.any(String),
      }),
      { onConflict: "tenant_id" }
    );
  });

  it("falls back to the first contact when no Chief Executive exists", async () => {
    const builder = query({ data: null, error: null });
    mocks.from.mockReturnValue(builder);
    const contacts = [{ contact_type: "PublicEnquiries", name: "Public Desk", email: null, phone: null }];

    await expect(transferTgaPrimaryContact(42, "user-7", contacts)).resolves.toBe("Public Desk");
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        primary_contact_name: "Public Desk",
        primary_contact_email: null,
        primary_contact_phone: null,
      }),
      { onConflict: "tenant_id" }
    );
  });

  it("propagates an upsert error to the caller", async () => {
    const error = new Error("profile write failed");
    mocks.from.mockReturnValue(query({ data: null, error }));

    await expect(
      transferTgaPrimaryContact(42, "user-7", [{ name: "Chief Executive", contact_type: "ChiefExecutive" }])
    ).rejects.toThrow("profile write failed");
  });
});
