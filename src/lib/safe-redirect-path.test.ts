import { describe, expect, it } from "vitest";
import {
  buildTrustedAppUrl,
  extractGoTrueToken,
  isSafeRelative,
  stripTrustedLinkKeys,
} from "../../supabase/functions/_shared/safe-redirect-path";

describe("isSafeRelative", () => {
  it("accepts a same-origin path", () => {
    expect(isSafeRelative("/reset-password")).toBe(true);
    expect(isSafeRelative("/auth/callback")).toBe(true);
    expect(isSafeRelative("/activate")).toBe(true);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(isSafeRelative("https://evil.example/phish")).toBe(false);
    expect(isSafeRelative("http://evil.example/phish")).toBe(false);
    expect(isSafeRelative("//evil.example/phish")).toBe(false);
    expect(isSafeRelative("https://unicorn-cms.au/reset-password")).toBe(false);
  });

  it("rejects backslash and scheme smuggling", () => {
    expect(isSafeRelative("/\\evil.example")).toBe(false);
    expect(isSafeRelative("/foo://evil.example")).toBe(false);
    expect(isSafeRelative("reset-password")).toBe(false);
    expect(isSafeRelative("")).toBe(false);
  });
});

describe("stripTrustedLinkKeys + spread order", () => {
  it("drops caller-supplied trusted keys so APP_BASE_URL wins", () => {
    const mergeVars: Record<string, unknown> = {
      first_name: "Ada",
      appBaseUrl: "https://evil.example",
      action_link: "https://evil.example/steal",
      redirect_to: "https://evil.example/phish",
      redirectTo: "https://evil.example/phish2",
      emailRedirectTo: "https://evil.example/phish3",
    };
    for (const k of ["appBaseUrl", "action_link", "redirect_to"]) delete mergeVars[k];
    const vars = {
      preview_text: "Hello",
      ...mergeVars,
      appBaseUrl: "https://unicorn-cms.au",
    };

    expect(vars.appBaseUrl).toBe("https://unicorn-cms.au");
    expect(vars).not.toHaveProperty("action_link");
    expect(vars).not.toHaveProperty("redirect_to");
    expect(vars.first_name).toBe("Ada");
    expect(vars.preview_text).toBe("Hello");
  });

  it("stripTrustedLinkKeys removes the full trusted set", () => {
    const cleaned = stripTrustedLinkKeys({
      first_name: "Ada",
      appBaseUrl: "https://evil.example",
      action_link: "https://evil.example/steal",
      redirect_to: "https://evil.example/phish",
      redirectTo: "https://evil.example/phish2",
      emailRedirectTo: "https://evil.example/phish3",
    });
    expect(cleaned).toEqual({ first_name: "Ada" });
  });
});

describe("buildTrustedAppUrl", () => {
  it("joins APP_BASE_URL and a relative path without a double slash", () => {
    expect(buildTrustedAppUrl("https://unicorn-cms.au/", "/activate")).toBe(
      "https://unicorn-cms.au/activate",
    );
    expect(buildTrustedAppUrl("https://unicorn-cms.au", "/reset-password")).toBe(
      "https://unicorn-cms.au/reset-password",
    );
  });
});

describe("extractGoTrueToken", () => {
  it("reads the token query param from a GoTrue action_link", () => {
    const link =
      "https://yxkgdalkbrriasiyyrwk.supabase.co/auth/v1/verify?token=abc123&type=recovery&redirect_to=https://evil.example";
    expect(extractGoTrueToken(link)).toBe("abc123");
  });

  it("returns null for a non-URL", () => {
    expect(extractGoTrueToken("not-a-url")).toBeNull();
  });
});
