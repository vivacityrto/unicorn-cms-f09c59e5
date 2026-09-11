import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { transferTgaContactsAsUsers } from "@/hooks/transferTgaContactsAsUsers";

describe("transferTgaContactsAsUsers", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it("deduplicates contacts by email, keeping the first occurrence", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await transferTgaContactsAsUsers(42, [
      { email: "same@example.com", name: "First Copy" },
      { email: "Same@Example.com", name: "Duplicate Copy" },
    ]);

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      "invite-user",
      expect.objectContaining({ body: expect.objectContaining({ first_name: "First" }) })
    );
  });

  it("strips a title prefix and assigns Admin for a Chief Executive contact", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await transferTgaContactsAsUsers(42, [
      { email: "ce@example.com", name: "Mr Brenton Myatt", contact_type: "ChiefExecutive", position: "CEO", phone: "111" },
    ]);

    expect(mocks.invoke).toHaveBeenCalledWith("invite-user", {
      body: {
        email: "ce@example.com",
        first_name: "Brenton",
        last_name: "Myatt",
        invite_as: "CLIENT",
        tenant_id: 42,
        unicorn_role: "Admin",
        skip_email: true,
        job_title: "CEO",
        phone_number: "111",
      },
    });
  });

  it("assigns User role for a non-Chief-Executive contact type", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await transferTgaContactsAsUsers(42, [
      { email: "staff@example.com", name: "Jane Doe", contact_type: "PublicEnquiries" },
    ]);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "invite-user",
      expect.objectContaining({ body: expect.objectContaining({ unicorn_role: "User" }) })
    );
  });

  it("counts created, skipped (via data.code), and errored contacts separately", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: false, code: "ALREADY_MEMBER" }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("write failed") });

    const result = await transferTgaContactsAsUsers(42, [
      { email: "one@example.com", name: "One" },
      { email: "two@example.com", name: "Two" },
      { email: "three@example.com", name: "Three" },
    ]);

    expect(result).toEqual({ created: 1, skipped: 1, errors: ["three@example.com: write failed"] });
  });

  it("treats a thrown ALREADY_MEMBER-shaped error message as a skip, not an error", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("user is already a member") });

    const result = await transferTgaContactsAsUsers(42, [{ email: "one@example.com", name: "One" }]);

    expect(result).toEqual({ created: 0, skipped: 1, errors: [] });
  });

  it("falls back to Unknown for first/last name when the contact has no name", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await transferTgaContactsAsUsers(42, [{ email: "noname@example.com" }]);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "invite-user",
      expect.objectContaining({ body: expect.objectContaining({ first_name: "Unknown", last_name: "Unknown" }) })
    );
  });

  it("skips contacts with no email entirely", async () => {
    const result = await transferTgaContactsAsUsers(42, [{ name: "No Email" }]);

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, skipped: 0, errors: [] });
  });
});
