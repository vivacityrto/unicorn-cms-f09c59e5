/**
 * Regression checks for send-email-graph tenant IDOR gate.
 *
 * Run: node --test supabase/functions/send-email-graph/auth-gate.test.mjs
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

describe("send-email-graph tenant access gate", () => {
  it("calls has_tenant_access_safe with the confirmed pg_proc args", () => {
    assert.match(src, /rpc\(\s*["']has_tenant_access_safe["']/);
    assert.match(src, /p_tenant_id:\s*tenantId/);
    assert.match(src, /p_user_id:\s*user\.id/);
  });

  it("returns 403 FORBIDDEN when the RPC denies access", () => {
    assert.match(src, /if\s*\(\s*!ok\s*\)\s*return jsonResponse\(\s*req,\s*403,\s*\{\s*code:\s*["']FORBIDDEN["']/);
  });

  it("gates staff.email.send callers through has_tenant_access_safe too — staff permission alone is not enough to dry-run/merge-read another tenant's data", () => {
    assert.match(src, /requireCaller\(/);
    assert.match(src, /featureKey:\s*FeatureKeys\.staffEmailSend/);
    const requireCallerIdx = src.indexOf("requireCaller(");
    const tenantAccessIdx = src.indexOf('rpc("has_tenant_access_safe"');
    assert.ok(tenantAccessIdx > requireCallerIdx, "has_tenant_access_safe runs after the requireCaller gate, not instead of it");
  });

  it("requires tenant_id before any tenant data read", () => {
    const tenantIdIdx = src.indexOf("tenant_id is required");
    const rpcIdx = src.indexOf("has_tenant_access_safe");
    const mergeIdx = src.indexOf("mergeData");
    const dryRunIdx = src.indexOf("if (dry_run)");
    assert.ok(tenantIdIdx >= 0, "tenant_id required check present");
    assert.ok(rpcIdx >= 0 && mergeIdx >= 0 && dryRunIdx >= 0);
    assert.ok(tenantIdIdx < rpcIdx, "require tenant_id before RPC");
    assert.ok(rpcIdx < mergeIdx, "RPC before merge_data");
    assert.ok(rpcIdx < dryRunIdx, "RPC before dry_run return (not a read oracle)");
  });
});
