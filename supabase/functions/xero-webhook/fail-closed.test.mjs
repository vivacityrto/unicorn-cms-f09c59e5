/**
 * Source-shape regression: xero-webhook must fail closed.
 *
 * Run: node --test supabase/functions/xero-webhook/fail-closed.test.mjs
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

describe("xero-webhook fail-closed shape", () => {
  it("reads XERO_WEBHOOK_KEY at module load", () => {
    const envIdx = src.indexOf('Deno.env.get("XERO_WEBHOOK_KEY")');
    const serveIdx = src.search(/Deno\.serve\s*\(/);
    assert.ok(envIdx >= 0, "reads the webhook key");
    assert.ok(serveIdx > envIdx, "key is read before Deno.serve()");
  });

  it("returns 500 when the webhook key is missing", () => {
    assert.match(src, /XERO_WEBHOOK_KEY is not set/);
    assert.match(src, /status:\s*500/);
  });

  it("verifies HMAC via the shared constant-time helper", () => {
    assert.match(src, /verifyXeroSignature/);
    assert.doesNotMatch(src, /signature\s*!==\s*expectedSignature/);
  });
});
