/**
 * Unit tests for webhook HMAC + replay helpers.
 *
 * Run: node --test supabase/functions/_shared/webhook-signature.test.mjs
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WEBHOOK_MAX_AGE_SECONDS,
  timingSafeEqualBytes,
  timingSafeEqualString,
  hexToBytes,
  isWebhookTimestampFresh,
  hmacSha256,
  verifyMailgunSignature,
  verifyXeroSignature,
} from "./webhook-signature.ts";

function nodeHmacHex(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function nodeHmacB64(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest("base64");
}

describe("timingSafeEqualBytes / timingSafeEqualString", () => {
  it("matches node:crypto.timingSafeEqual for equal strings", () => {
    const a = "d2271d12299f6592d9ed08cd54492709";
    const b = "d2271d12299f6592d9ed08cd54492709";
    assert.equal(timingSafeEqualString(a, b), true);
    assert.ok(
      timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")),
    );
  });

  it("rejects a single-character mismatch", () => {
    const a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
    assert.equal(timingSafeEqualString(a, b), false);
  });

  it("rejects unequal lengths without throwing", () => {
    assert.equal(timingSafeEqualString("abc", "ab"), false);
    assert.equal(
      timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1])),
      false,
    );
  });
});

describe("isWebhookTimestampFresh", () => {
  const now = 1_700_000_000;

  it("accepts a timestamp within 5 minutes", () => {
    assert.equal(isWebhookTimestampFresh(now - 60, now), true);
    assert.equal(isWebhookTimestampFresh(String(now + 30), now), true);
    assert.equal(isWebhookTimestampFresh(now, now), true);
  });

  it("rejects a timestamp more than 5 minutes old", () => {
    assert.equal(
      isWebhookTimestampFresh(now - WEBHOOK_MAX_AGE_SECONDS - 1, now),
      false,
    );
  });

  it("rejects a far-future timestamp", () => {
    assert.equal(
      isWebhookTimestampFresh(now + WEBHOOK_MAX_AGE_SECONDS + 1, now),
      false,
    );
  });

  it("rejects non-numeric timestamps", () => {
    assert.equal(isWebhookTimestampFresh("not-a-number", now), false);
    assert.equal(isWebhookTimestampFresh("", now), false);
  });
});

describe("verifyMailgunSignature", () => {
  const key = "test-signing-key";
  const timestamp = "1700000000";
  const token = "a8ce0edb2dd8301dee6c2405235584e45aa91d1e81a80b3746";

  it("accepts a valid hex HMAC", async () => {
    const signature = nodeHmacHex(key, timestamp + token);
    assert.equal(
      await verifyMailgunSignature(key, timestamp, token, signature),
      true,
    );
  });

  it("rejects a tampered signature", async () => {
    const signature = nodeHmacHex(key, timestamp + token);
    const tampered = signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a");
    assert.equal(
      await verifyMailgunSignature(key, timestamp, token, tampered),
      false,
    );
  });

  it("rejects a non-hex signature", async () => {
    assert.equal(
      await verifyMailgunSignature(key, timestamp, token, "not-hex"),
      false,
    );
  });

  it("agrees with Web Crypto hmacSha256", async () => {
    const expected = await hmacSha256(key, timestamp + token);
    const fromNode = hexToBytes(nodeHmacHex(key, timestamp + token));
    assert.ok(fromNode);
    assert.equal(timingSafeEqualBytes(expected, fromNode), true);
  });
});

describe("verifyXeroSignature", () => {
  const key = "xero-webhook-key";
  const body = '{"events":[]}';

  it("accepts a valid base64 HMAC of the raw body", async () => {
    const signature = nodeHmacB64(key, body);
    assert.equal(await verifyXeroSignature(key, body, signature), true);
  });

  it("rejects a mismatched body", async () => {
    const signature = nodeHmacB64(key, body);
    assert.equal(
      await verifyXeroSignature(key, '{"events":[1]}', signature),
      false,
    );
  });

  it("rejects invalid base64", async () => {
    assert.equal(await verifyXeroSignature(key, body, "***"), false);
  });
});
