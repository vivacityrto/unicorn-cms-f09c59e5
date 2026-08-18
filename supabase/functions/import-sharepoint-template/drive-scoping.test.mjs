/**
 * Regression: import-sharepoint-template's `import` action must not trust a
 * caller-supplied source_drive_id blindly. Before this fix, handleImport
 * downloaded from any drive_id/item_id the client sent using the app-only
 * Graph token, without verifying it was actually the Master Documents
 * drive — a caller who cleared the staffSharepoint gate could point
 * source_drive_id at an unrelated (e.g. client-tenant) SharePoint drive and
 * have it imported into the shared governance template catalog.
 *
 * See docs/audit-log/entries/2026-08-18-sharepoint-import-drive-scoping.md.
 *
 * Run: node --test supabase/functions/import-sharepoint-template/drive-scoping.test.mjs
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

describe("import-sharepoint-template drive scoping", () => {
  it("defines a shared resolveMasterDriveId helper used by both browse and import", () => {
    assert.match(src, /async function resolveMasterDriveId\(/);
    const browseIdx = src.indexOf("async function handleBrowse");
    const importIdx = src.indexOf("async function handleImport");
    assert.ok(browseIdx >= 0 && importIdx >= 0);
  });

  it("handleImport resolves the master drive and rejects a mismatched source_drive_id before any Graph fetch", () => {
    const importStart = src.indexOf("async function handleImport");
    const nextFnStart = src.indexOf("async function scanDocxMergeFields");
    assert.ok(importStart >= 0 && nextFnStart > importStart);
    const importBody = src.slice(importStart, nextFnStart);

    assert.match(importBody, /resolveMasterDriveId\(supabase\)/);
    assert.match(importBody, /source_drive_id\s*!==\s*masterDrive\.driveId/);
    assert.match(importBody, /status:\s*403/);

    const resolveCallIdx = importBody.indexOf("resolveMasterDriveId(supabase)");
    const mismatchCheckIdx = importBody.indexOf("source_drive_id !== masterDrive.driveId");
    const firstGraphGetIdx = importBody.indexOf("graphGet<DriveItem>");
    assert.ok(resolveCallIdx >= 0 && mismatchCheckIdx > resolveCallIdx);
    assert.ok(firstGraphGetIdx > mismatchCheckIdx, "scoping check runs before the source file is fetched from Graph");
  });

  it("handleBrowse still lists the Master Documents drive via the shared resolver, not a caller-supplied drive", () => {
    const browseStart = src.indexOf("async function handleBrowse");
    const browseBody = src.slice(browseStart);
    assert.match(browseBody, /resolveMasterDriveId\(supabase\)/);
    assert.doesNotMatch(browseBody, /body\.drive_id/);
  });
});
