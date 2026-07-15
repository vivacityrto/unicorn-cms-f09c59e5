/**
 * Local (Node) smoke helpers for send-invitation-email possession proof.
 * Mirrors the SHA-256 hex hashing used at invitation-token creation time
 * (invite-user / resend-invite) and in send-invitation-email.
 *
 * Run: node --test supabase/functions/send-invitation-email/possession-proof.test.mjs
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hashesMatch(a, b) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

describe("invitation token possession proof", () => {
  it("matches invite-user style UUID token hashing", () => {
    const token = "550e8400-e29b-41d4-a716-446655440000";
    const stored = sha256Hex(token);
    assert.equal(stored.length, 64);
    assert.equal(hashesMatch(sha256Hex(token), stored), true);
  });

  it("rejects mismatched plaintext", () => {
    const stored = sha256Hex("correct-token");
    assert.equal(hashesMatch(sha256Hex("wrong-token"), stored), false);
  });

  it("rejects truncated hash", () => {
    const stored = sha256Hex("correct-token");
    assert.equal(hashesMatch(stored.slice(0, 32), stored), false);
  });
});
