/**
 * Source-pattern checks for upload-portal-document (Deno isn't available locally).
 *
 * The function inserts with the service role and takes ids from the multipart form, so the linked
 * ids must be resolved to the tenant before anything is written, and the member gate must respect
 * access_scope. Behaviour of the resolver itself is covered by linked-ids.node-test.ts.
 *
 * Run: node --test supabase/functions/upload-portal-document/index.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "index.ts"), "utf8");

describe("upload-portal-document", () => {
  it("checks linked ids after the caller gate and before any storage write", () => {
    const gate = src.indexOf("await requireCaller(");
    const check = src.indexOf("await checkLinkedIds(");
    const upload = src.indexOf(".upload(storage_path");
    assert.ok(gate > -1 && check > -1 && upload > -1);
    assert.ok(gate < check, "linked ids are checked only after the caller is authorised");
    assert.ok(check < upload, "linked ids are checked before the file is stored");
  });

  it("passes every linked id to the check and rejects on failure", () => {
    for (const field of ["stageId: linkedStageId", "packageId: linkedPackageId", "taskId: linkedTaskId",
      "evidenceItemId: evidenceRequestItemId", "categoryId,"]) {
      assert.ok(src.includes(field), field);
    }
    assert.match(src, /if \(!linkCheck\.ok\)\s*\{\s*return json\(req, linkCheck\.status/);
  });

  it("treats the member (fallback) path as the restricted caller", () => {
    assert.match(src, /caller\.via === "fallback"/);
  });

  it("uses a full-scope member check, not the shared scope-blind helper", () => {
    assert.match(src, /\.eq\("access_scope", "full"\)/);
    assert.ok(!/allowTenantMember/.test(src));
  });
});
