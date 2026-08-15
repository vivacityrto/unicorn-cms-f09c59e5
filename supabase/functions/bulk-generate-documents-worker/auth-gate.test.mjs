/**
 * Regression checks for bulk-generate-documents-worker JWT handling (C1).
 *
 * The worker used to decode `exp` from an unverified JWT payload. A
 * decoded-but-unverified claim is not evidence of anything — verify via
 * admin.auth.getUser, then read exp from getClaims.
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

describe("bulk-generate-documents-worker caller JWT verification", () => {
  it("verifies the caller token with auth.getUser", () => {
    assert.match(src, /\.auth\.getUser\(/);
  });

  it("reads exp from verified getClaims, not a local payload decode", () => {
    assert.match(src, /\.auth\.getClaims\(/);
    assert.match(src, /claimsData\?\.claims\?\.exp/);
    assert.doesNotMatch(src, /atob\(/);
    assert.doesNotMatch(src, /function jwtExpMs/);
  });

  it("rejects an invalid caller token before leasing work", () => {
    const getUserIdx = src.indexOf(".auth.getUser(");
    const leaseIdx = src.indexOf("lease_bulk_document_job_items");
    const unauthorizedIdx = src.indexOf("Invalid or expired caller token");
    assert.ok(getUserIdx >= 0, "getUser present");
    assert.ok(leaseIdx >= 0, "lease RPC present");
    assert.ok(unauthorizedIdx >= 0, "401 body present");
    assert.ok(getUserIdx < leaseIdx, "getUser before leasing");
    assert.ok(unauthorizedIdx < leaseIdx, "401 path defined before leasing");
  });
});
