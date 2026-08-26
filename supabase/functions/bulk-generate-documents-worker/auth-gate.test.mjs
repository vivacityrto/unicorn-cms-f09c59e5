/**
 * Regression checks for bulk-generate-documents-worker's caller gate.
 *
 * The worker used to decode `exp` from an unverified JWT payload (the old
 * "C1" fix made it verify via admin.auth.getUser then read exp from
 * getClaims). That model was superseded by a documented architecture
 * change (see the file's own "Auth model" header comment): this is a
 * machine-to-machine worker gated by a shared secret
 * (BULK_DOCUMENT_WORKER_SECRET via requireSharedSecret), not a browser
 * caller — x-caller-authorization is checked only for structural presence
 * and is never verified against Supabase Auth. Every staff-gated
 * downstream call instead authenticates as a dedicated system account.
 *
 * These checks were rewritten on 2026-08-26 (RBAC/security remediation
 * pass) after discovering the old JWT-verification assertions had gone
 * stale — this suite was excluded from the normal `npx vitest run` command
 * (F-022) and nobody had run it since the architecture changed.
 *
 * Run: node --test supabase/functions/bulk-generate-documents-worker/auth-gate.test.mjs
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

describe("bulk-generate-documents-worker caller gate", () => {
  it("gates on a shared secret (requireSharedSecret) before any other check", () => {
    assert.match(src, /requireSharedSecret\(/);
    assert.match(src, /WORKER_SECRET_ENV\s*=\s*['"]BULK_DOCUMENT_WORKER_SECRET['"]/);
    const secretGateIdx = src.indexOf("requireSharedSecret(req");
    const methodCheckIdx = src.indexOf("req.method !== 'POST'");
    assert.ok(secretGateIdx >= 0, "requireSharedSecret call present");
    assert.ok(secretGateIdx < methodCheckIdx, "secret gate runs before the method check / any work");
  });

  it("does not use the retired unverified-JWT-decode pattern (atob/jwtExpMs)", () => {
    assert.doesNotMatch(src, /atob\(/);
    assert.doesNotMatch(src, /function jwtExpMs/);
  });

  it("treats x-caller-authorization as structural-presence-only, not an auth check", () => {
    assert.match(src, /callerAuth\s*=\s*req\.headers\.get\(\s*['"]x-caller-authorization['"]\s*\)/);
    assert.match(src, /parseBearerToken\(callerAuth\)/);
    assert.doesNotMatch(src, /\.auth\.getUser\(\s*callerToken\s*\)/);
    assert.doesNotMatch(src, /\.auth\.getClaims\(\s*callerToken\s*\)/);
  });

  it("never calls cancel_bulk_document_job (that RPC must only run under a real staff JWT, per its own safety note)", () => {
    assert.doesNotMatch(src, /rpc\(\s*['"]cancel_bulk_document_job['"]/);
  });
});
