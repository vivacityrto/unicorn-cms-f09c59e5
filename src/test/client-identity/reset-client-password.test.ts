import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { resetClientPassword } from "@/features/client-identity/resetClientPassword";

describe("resetClientPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({
      data: { ok: true, email: "person@example.com" },
      error: null,
    });
  });

  it("preserves the send-password-reset payload and returns its response", async () => {
    await expect(resetClientPassword("user-42")).resolves.toEqual({
      ok: true,
      email: "person@example.com",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("send-password-reset", {
      body: { user_uuid: "user-42" },
    });
  });

  it("preserves structured Edge detail and error code", async () => {
    const context = {
      json: vi.fn().mockResolvedValue({
        code: "AUTH_USER_NOT_FOUND",
        detail: "This user has not yet activated their account.",
      }),
    };
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("edge failed"), { context }),
    });

    const error = await resetClientPassword("user-42").catch(
      (value: unknown) => value as Error & { code?: string },
    );
    expect(error).toMatchObject({
      message: "This user has not yet activated their account.",
      code: "AUTH_USER_NOT_FOUND",
    });
  });

  it("falls back to the Supabase error message when no structured detail is available", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: new Error("password reset unavailable"),
    });

    await expect(resetClientPassword("user-42")).rejects.toThrow("password reset unavailable");
  });
});
