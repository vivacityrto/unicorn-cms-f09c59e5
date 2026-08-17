/**
 * Regression checks for the shared cron-invoke auth helper and the
 * functions that must call it.
 *
 * Run: node --test supabase/functions/_shared/cron-auth.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const helperSrc = readFileSync(join(here, "cron-auth.ts"), "utf8");

const AFFECTED = [
  "process-notification-outbox",
  "process-notification-queue",
  "generate-notifications",
  "send-action-item-due-reminders",
];
// schedule-task-reminders was briefly added here (v87) then retired outright
// (2026-08-18) — see docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md.
// It's now a 410 stub with no cron-auth dependency, so it's removed from
// this list rather than left asserting a pattern the retired function no
// longer uses.

function functionSrc(name) {
  return readFileSync(join(here, "..", name, "index.ts"), "utf8");
}

describe("cron-auth helper", () => {
  it("constant-time compares CRON_INVOKE_SECRET against x-cron-invoke-secret", () => {
    assert.match(helperSrc, /CRON_INVOKE_SECRET_HEADER\s*=\s*["']x-cron-invoke-secret["']/);
    assert.match(helperSrc, /Deno\.env\.get\(\s*["']CRON_INVOKE_SECRET["']\s*\)/);
    assert.match(helperSrc, /function constantTimeEqual/);
    assert.match(helperSrc, /diff\s*\|\=\s*pa\[i\]\s*\^\s*pb\[i\]/);
  });

  it("rejects an unset or empty CRON_INVOKE_SECRET rather than matching a missing header", () => {
    assert.match(helperSrc, /if\s*\(\s*expected\.length\s*===\s*0\s*\)\s*return false/);
  });

  it("tries auth.getUser and documents that the cron JWT is not a user token", () => {
    assert.match(helperSrc, /auth\.getUser/);
    assert.match(helperSrc, /service_role/);
  });

  it("keeps a transition path for the service_role JWT cron already sends", () => {
    assert.match(helperSrc, /ACCEPT_LEGACY_SERVICE_ROLE_JWT/);
    assert.match(helperSrc, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(helperSrc, /cron_presented_secret_matches/);
  });
});

describe("constantTimeEqual behaviour (inlined copy of the helper)", () => {
  function constantTimeEqual(a, b) {
    const enc = new TextEncoder();
    const ab = enc.encode(a);
    const bb = enc.encode(b);
    const len = Math.max(ab.length, bb.length, 1);
    const pa = new Uint8Array(len);
    const pb = new Uint8Array(len);
    pa.set(ab);
    pb.set(bb);
    let diff = ab.length ^ bb.length;
    for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
    return diff === 0;
  }

  it("accepts equal strings and rejects mismatches and empties-vs-values", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "ab"), false);
    assert.equal(constantTimeEqual("", ""), true);
    assert.equal(constantTimeEqual("", "x"), false);
  });
});

describe("affected cron functions import the shared gate", () => {
  for (const name of AFFECTED) {
    it(`${name} imports isCronAuthorized and returns 401`, () => {
      const src = functionSrc(name);
      assert.match(src, /from ["']\.\.\/_shared\/cron-auth\.ts["']/);
      assert.match(src, /isCronAuthorized\(/);
      assert.match(src, /cronUnauthorizedResponse\(/);
    });
  }

  it("generate-notifications keeps the super-admin preview/broadcast gate", () => {
    const src = functionSrc("generate-notifications");
    assert.match(src, /is_super_admin_safe/);
    assert.doesNotMatch(src, /Scheduled: cron path, no JWT check/);
    assert.match(src, /isPreview \|\| isBroadcast/);
  });

  it("reconcile-invite-delivery-status no longer decodes JWTs without verifying them", () => {
    const src = functionSrc("reconcile-invite-delivery-status");
    assert.doesNotMatch(src, /payload\.role === ["']service_role["']/);
    assert.doesNotMatch(src, /atob\(padded/);
  });
});
