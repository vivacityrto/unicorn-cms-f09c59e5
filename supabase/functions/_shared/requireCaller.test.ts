import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowlistFromAppBaseUrl,
  constantTimeEqual,
  parseBearerToken,
} from "./requireCaller-helpers.ts";

describe("parseBearerToken", () => {
  it("accepts exactly Bearer <token>", () => {
    assert.equal(parseBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  });

  it("rejects a missing header", () => {
    assert.equal(parseBearerToken(null), null);
  });

  it("rejects a raw token with no Bearer scheme", () => {
    assert.equal(parseBearerToken("abc.def.ghi"), null);
  });

  it("rejects a prefix-only strip candidate (Bearer glued to token)", () => {
    assert.equal(parseBearerToken("Bearerabc.def.ghi"), null);
  });

  it("rejects extra parts", () => {
    assert.equal(parseBearerToken("Bearer abc extra"), null);
  });

  it("rejects an empty token after Bearer", () => {
    assert.equal(parseBearerToken("Bearer "), null);
  });
});

describe("allowlistFromAppBaseUrl", () => {
  it("includes the trimmed base and the www/apex variant", () => {
    const set = allowlistFromAppBaseUrl("https://unicorn-cms.au/");
    assert.equal(set.has("https://unicorn-cms.au"), true);
    assert.equal(set.has("https://www.unicorn-cms.au"), true);
  });

  it("does not allow every origin", () => {
    const set = allowlistFromAppBaseUrl("https://unicorn-cms.au");
    assert.equal(set.has("https://evil.example"), false);
    assert.equal(set.has("*"), false);
  });

  it("returns an empty set when APP_BASE_URL is missing", () => {
    assert.equal(allowlistFromAppBaseUrl(null).size, 0);
    assert.equal(allowlistFromAppBaseUrl("").size, 0);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal secrets", () => {
    assert.equal(constantTimeEqual("shared-secret", "shared-secret"), true);
  });

  it("returns false for mismatched secrets and missing values", () => {
    assert.equal(constantTimeEqual("shared-secret", "other-secret"), false);
    assert.equal(constantTimeEqual("shared-secret", ""), false);
    assert.equal(constantTimeEqual("", "shared-secret"), false);
  });
});
