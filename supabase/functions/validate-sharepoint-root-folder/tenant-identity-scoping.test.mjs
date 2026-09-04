/**
 * Regression: validate-sharepoint-root-folder must not accept a pasted
 * root_folder_url purely because it resolves to *some* real SharePoint
 * folder. Before this fix, a resolved folder was marked 'valid' and stored
 * on tenant_sharepoint_settings with no check that the folder actually
 * belonged to the tenant being configured — a staff member could paste (and
 * "validate") a different client's already-provisioned folder link onto the
 * wrong tenant's record, since Save Link / Validate & Save both trust the
 * caller-supplied URL as-is.
 *
 * The fix cross-checks the resolved folder's name + ancestor path against
 * every OTHER tenant's deterministic client-folder name (buildClientFolderName)
 * and refuses the link (invalid, 400) on a match, before the settings row is
 * ever marked valid.
 *
 * Run: node --test supabase/functions/validate-sharepoint-root-folder/tenant-identity-scoping.test.mjs
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

describe("validate-sharepoint-root-folder tenant identity scoping", () => {
  it("imports the shared buildClientFolderName helper used to derive tenant-specific folder names", () => {
    assert.match(src, /buildClientFolderName/);
    assert.match(src, /from ['"]\.\.\/_shared\/graph-app-client\.ts['"]/);
  });

  it("defines findConflictingTenant, querying tenants other than the one being validated", () => {
    assert.match(src, /async function findConflictingTenant\(/);
    const fnStart = src.indexOf("async function findConflictingTenant");
    const fnBody = src.slice(fnStart, fnStart + 1500);
    assert.match(fnBody, /\.neq\(['"]id['"],\s*currentTenantId\)/);
    assert.match(fnBody, /buildClientFolderName\(tenant\.rto_id, tenant\.legal_name, tenant\.name\)/);
  });

  it("calls findConflictingTenant on the resolved folder before it can be marked valid, and rejects with 400 on a match", () => {
    const conflictCallIdx = src.indexOf("findConflictingTenant(");
    const validMarkIdx = src.indexOf("validation_status: 'valid'");
    assert.ok(conflictCallIdx >= 0, "findConflictingTenant is called");
    assert.ok(validMarkIdx > conflictCallIdx, "the valid status is only set after the conflict check runs");

    const checkBlockStart = src.indexOf("if (!test_site_access) {", conflictCallIdx - 200);
    const checkBlockEnd = src.indexOf("// Upsert settings and emit timeline", conflictCallIdx);
    const checkBlock = src.slice(checkBlockStart, checkBlockEnd);
    assert.match(checkBlock, /validation_status:\s*'invalid'/);
    assert.match(checkBlock, /status:\s*400/);
  });

  it("does not require the folder to match the CURRENT tenant's own naming convention (only rejects a match on a different tenant)", () => {
    const fnStart = src.indexOf("async function findConflictingTenant");
    const fnEnd = src.indexOf("async function upsertSettings");
    const fnBody = src.slice(fnStart, fnEnd);
    // Should never compute/compare an expected name for currentTenantId itself.
    assert.doesNotMatch(fnBody, /currentTenantId.{0,40}buildClientFolderName/s);
  });
});
