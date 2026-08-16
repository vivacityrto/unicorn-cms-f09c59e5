/**
 * Source-shape regression: mailgun-webhooks must fail closed.
 *
 * Run: node --test supabase/functions/mailgun-webhooks/fail-closed.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8",
);

describe("mailgun-webhooks fail-closed shape", () => {
  it("reads MAILGUN_WEBHOOK_SIGNING_KEY at module load, not MAILGUN_API_KEY", () => {
    const envIdx = src.indexOf('Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY")');
    const serveIdx = src.search(/\bserve\s*\(/);
    assert.ok(envIdx >= 0, "reads the signing key");
    assert.ok(serveIdx > envIdx, "key is read before serve()");
    assert.doesNotMatch(src, /MAILGUN_API_KEY/);
  });

  it("returns 500 when the signing key is missing", () => {
    assert.match(src, /json\(\s*500/);
    assert.match(src, /MAILGUN_WEBHOOK_SIGNING_KEY is not set/);
  });

  it("verifies HMAC via the shared constant-time helper", () => {
    assert.match(src, /verifyMailgunSignature/);
    assert.doesNotMatch(src, /mySig\s*===\s*sig\.signature/);
  });

  it("rejects stale Mailgun timestamps", () => {
    assert.match(src, /isWebhookTimestampFresh/);
  });
});
