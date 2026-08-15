import { describe, expect, it } from "vitest";
import {
  allowlistFromAppBaseUrl,
  constantTimeEqual,
  parseBearerToken,
} from "./requireCaller-helpers.ts";

describe("parseBearerToken", () => {
  it("accepts exactly Bearer <token>", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("rejects a missing header", () => {
    expect(parseBearerToken(null)).toBeNull();
  });

  it("rejects a raw token with no Bearer scheme", () => {
    expect(parseBearerToken("abc.def.ghi")).toBeNull();
  });

  it("rejects a prefix-only strip candidate (Bearer glued to token)", () => {
    expect(parseBearerToken("Bearerabc.def.ghi")).toBeNull();
  });

  it("rejects extra parts", () => {
    expect(parseBearerToken("Bearer abc extra")).toBeNull();
  });

  it("rejects an empty token after Bearer", () => {
    expect(parseBearerToken("Bearer ")).toBeNull();
  });
});

describe("allowlistFromAppBaseUrl", () => {
  it("includes the trimmed base and the www/apex variant", () => {
    const set = allowlistFromAppBaseUrl("https://unicorn-cms.au/");
    expect(set.has("https://unicorn-cms.au")).toBe(true);
    expect(set.has("https://www.unicorn-cms.au")).toBe(true);
  });

  it("does not allow every origin", () => {
    const set = allowlistFromAppBaseUrl("https://unicorn-cms.au");
    expect(set.has("https://evil.example")).toBe(false);
    expect(set.has("*")).toBe(false);
  });

  it("returns an empty set when APP_BASE_URL is missing", () => {
    expect(allowlistFromAppBaseUrl(null).size).toBe(0);
    expect(allowlistFromAppBaseUrl("").size).toBe(0);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal secrets", () => {
    expect(constantTimeEqual("shared-secret", "shared-secret")).toBe(true);
  });

  it("returns false for mismatched secrets and missing values", () => {
    expect(constantTimeEqual("shared-secret", "other-secret")).toBe(false);
    expect(constantTimeEqual("shared-secret", "")).toBe(false);
    expect(constantTimeEqual("", "shared-secret")).toBe(false);
  });
});
