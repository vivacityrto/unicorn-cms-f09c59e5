/**
 * Source-shape regression: rock-task-sync must fail closed and only act on a
 * verified, parsed event.
 *
 * Run: node --test supabase/functions/rock-task-sync/fail-closed.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "index.ts"), "utf8");
const config = readFileSync(join(dir, "../../config.toml"), "utf8");

describe("rock-task-sync fail-closed shape", () => {
  it("reads ROCK_TASK_SYNC_SECRET at module load, before Deno.serve", () => {
    const envIdx = src.indexOf('Deno.env.get("ROCK_TASK_SYNC_SECRET")');
    const serveIdx = src.search(/Deno\.serve\s*\(/);
    assert.ok(envIdx >= 0, "reads the signing secret");
    assert.ok(serveIdx > envIdx, "secret is read before Deno.serve()");
  });

  it("returns 500 when the secret is missing", () => {
    assert.match(src, /ROCK_TASK_SYNC_SECRET is not set/);
    assert.match(src, /Webhook is not configured", \{ status: 500 \}/);
  });

  it("only accepts POST", () => {
    assert.match(src, /req\.method !== "POST"[\s\S]{0,80}405/);
  });

  it("verifies the signature with the shared constant-time helper before parsing the body", () => {
    const verifyIdx = src.indexOf("verifyHmacSha256Hex(SYNC_SECRET");
    const parseIdx = src.indexOf("JSON.parse(rawBody)");
    assert.ok(verifyIdx >= 0, "calls verifyHmacSha256Hex");
    assert.ok(parseIdx > verifyIdx, "JSON.parse happens after signature verification");
    assert.match(src, /Invalid signature", \{ status: 401 \}/);
  });

  it("caps the request body size before verifying", () => {
    assert.match(src, /MAX_BODY_BYTES/);
    assert.match(src, /413/);
  });

  it("applies events only through the service-role RPC with an expected tenant", () => {
    assert.match(src, /rpc\("apply_rock_task_sync_event"/);
    assert.match(src, /p_expected_tenant_id: EXPECTED_TENANT_ID/);
    assert.doesNotMatch(src, /\.from\(["']eos_rock_milestones["']\)/, "never writes milestones directly");
  });

  it("returns a retryable 500 on RPC failure and a non-retryable 422 for a rejected milestone", () => {
    assert.match(src, /sync_failed[\s\S]{0,40}500/);
    assert.match(src, /outcome === "rejected"[\s\S]{0,300}422/);
  });

  it("is registered without JWT verification and carries the documented auth opt-out", () => {
    assert.match(config, /\[functions\.rock-task-sync\]\s*[^\[]*verify_jwt = false/);
    assert.match(src, /\/\/ auth-gate: none --/);
  });
});
