/**
 * Regression checks for cron-only edge function invoke-secret auth.
 *
 * Run: node --test supabase/functions/_shared/cron-invoke-auth.test.mjs
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function sha256Bytes(input) {
  return createHash("sha256").update(input, "utf8").digest();
}

function cronInvokeSecretMatches(presented, expected) {
  if (!expected) return false;
  const a = sha256Bytes(expected);
  const b = sha256Bytes(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

describe("cron invoke secret comparison", () => {
  it("accepts an exact match", () => {
    assert.equal(cronInvokeSecretMatches("correct-secret", "correct-secret"), true);
  });

  it("rejects a mismatched secret", () => {
    assert.equal(cronInvokeSecretMatches("wrong-secret", "correct-secret"), false);
  });

  it("rejects an empty presented value", () => {
    assert.equal(cronInvokeSecretMatches("", "correct-secret"), false);
  });

  it("rejects when the expected secret is unset (fail-closed)", () => {
    assert.equal(cronInvokeSecretMatches("anything", ""), false);
    assert.equal(cronInvokeSecretMatches("", ""), false);
  });

  it("does not treat equal-length wrong secrets as a match", () => {
    assert.equal(cronInvokeSecretMatches("aaaaaaaa", "bbbbbbbb"), false);
  });
});

const CRON_FUNCTIONS = [
  "reconcile-invite-delivery-status",
  "xero-invoice-sync-all",
  "sync-outlook-calendar-cron",
];

describe("cron-only functions no longer decode unverified JWT claims", () => {
  for (const name of CRON_FUNCTIONS) {
    const src = readFileSync(join(here, "..", name, "index.ts"), "utf8");

    it(`${name} gates on authorizeCronInvoke`, () => {
      assert.match(src, /authorizeCronInvoke/);
      assert.match(src, /from ["']\.\.\/_shared\/cron-invoke-auth\.ts["']/);
    });

    it(`${name} does not decode a JWT payload for role=service_role`, () => {
      assert.doesNotMatch(src, /role\s*===\s*["']service_role["']/);
      assert.doesNotMatch(src, /atob\(/);
      assert.doesNotMatch(src, /split\(["']\.["']\)/);
    });
  }
});

describe("shared helper is constant-time on digests", () => {
  const src = readFileSync(join(here, "cron-invoke-auth.ts"), "utf8");

  it("hashes both sides with SHA-256 before comparing", () => {
    assert.match(src, /SHA-256/);
    assert.match(src, /timingSafeEqualBytes/);
    assert.match(src, /cronInvokeSecretMatches/);
  });

  it("reads CRON_INVOKE_SECRET and x-cron-invoke-secret", () => {
    assert.match(src, /CRON_INVOKE_SECRET/);
    assert.match(src, /x-cron-invoke-secret/);
  });

  it("fails closed when the env secret is missing", () => {
    assert.match(src, /if\s*\(\s*!expected\s*\)\s*return false/);
  });
});
