/**
 * Sweep: every edge function that takes tenant_id from the request body
 * must assert membership via has_tenant_access_safe (or already be
 * staff/super-admin gated) before using that value.
 *
 * Mirrors:
 *   grep -rn "body.tenant_id\|tenant_id = body\|tenantId = body" supabase/functions/
 *
 * Run: node --test supabase/functions/_shared/tenant-body-id-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFn(name) {
  return readFileSync(join(functionsRoot, name, "index.ts"), "utf8");
}

const MUST_CALL_RPC = [
  "activate-ghost-user",
  "browse-sharepoint-folder",
  "bulk-account-actions",
  "bulk-send-invitations",
  "generate-membership-certificate",
  "link-sharepoint-document",
  "outlook-auth",
];

const ALREADY_STAFF_GATED = {
  "embed-ask-viv-corpus": /Super Admin role required/,
  "embed-ask-viv-documents": /Super Admin role required/,
  "xero-invoice-list": /Vivacity staff only/,
  "xero-invoice-status": /Vivacity staff only/,
};

describe("body-supplied tenant_id membership sweep", () => {
  it("shared helper calls has_tenant_access_safe(p_tenant_id, p_user_id)", () => {
    const helper = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "auth-helpers.ts"),
      "utf8",
    );
    assert.match(helper, /rpc\(\s*["']has_tenant_access_safe["']/);
    assert.match(helper, /p_tenant_id:/);
    assert.match(helper, /p_user_id:/);
  });

  function deniesWith403(src) {
    // Explicit 403 in the function, or requireCaller which returns 403.
    return /403/.test(src) || /if\s*\(\s*!caller\.ok\s*\)\s*return caller\.response/.test(src);
  }

  for (const name of MUST_CALL_RPC) {
    it(`${name} calls hasTenantAccessSafe and returns 403 on denial`, () => {
      const src = readFn(name);
      assert.match(src, /hasTenantAccessSafe\(/);
      assert.ok(deniesWith403(src), `${name} must return 403 (literal or requireCaller)`);
    });
  }

  for (const [name, gate] of Object.entries(ALREADY_STAFF_GATED)) {
    it(`${name} keeps its existing staff/super-admin gate`, () => {
      const src = readFn(name);
      assert.match(src, gate);
      assert.ok(deniesWith403(src), `${name} must return 403 (literal or requireCaller)`);
    });
  }
});
