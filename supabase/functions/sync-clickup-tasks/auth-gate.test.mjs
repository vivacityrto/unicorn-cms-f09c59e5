/**
 * Regression: sync-clickup-tasks must require a Super Admin caller before
 * running any mode (sync_all, sync_task, sync_by_tenant). Previously this
 * function had no authorization at all — any request with a valid anon
 * key could trigger a full ClickUp workspace pull or rewrite tenant_id
 * associations on existing rows via sync_by_tenant.
 *
 * Run: node --test supabase/functions/sync-clickup-tasks/auth-gate.test.mjs
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

describe("sync-clickup-tasks authorization gate", () => {
  it("gates on requireCaller Version A (admin.team_users.manage, full)", () => {
    assert.match(src, /from ["']\.\.\/_shared\/requireCaller\.ts["']/);
    assert.match(
      src,
      /requireCaller\(req,\s*["']admin\.team_users\.manage["'],\s*["']full["']\)/,
    );
    assert.match(src, /if \(caller instanceof Response\) return caller/);
  });

  it("runs the gate before any mode branch (sync_all/sync_task/sync_by_tenant)", () => {
    const gateIdx = src.indexOf("const caller = await requireCaller(req,");
    const syncAllIdx = src.indexOf('mode === "sync_all"');
    const syncTaskIdx = src.indexOf('mode === "sync_task"');
    const syncByTenantIdx = src.indexOf('mode === "sync_by_tenant"');
    assert.ok(gateIdx >= 0, "requireCaller call present");
    assert.ok(gateIdx < syncAllIdx, "gate precedes sync_all branch");
    assert.ok(gateIdx < syncTaskIdx, "gate precedes sync_task branch");
    assert.ok(gateIdx < syncByTenantIdx, "gate precedes sync_by_tenant branch");
  });

  it("runs the gate after the OPTIONS preflight short-circuit", () => {
    const optionsIdx = src.indexOf('req.method === "OPTIONS"');
    const gateIdx = src.indexOf("const caller = await requireCaller(req,");
    assert.ok(optionsIdx >= 0 && optionsIdx < gateIdx);
  });

  it("uses request-aware CORS, not a wildcard", () => {
    assert.match(src, /corsHeadersFor\(req\)/);
    assert.doesNotMatch(src, /Access-Control-Allow-Origin["']:\s*["']\*/);
  });
});
