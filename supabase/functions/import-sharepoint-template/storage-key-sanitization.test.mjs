/**
 * Regression: handleImport's storage upload used the SharePoint file's raw
 * name directly as the Supabase Storage object key. Storage key validation
 * rejects several Unicode punctuation characters common in real document
 * titles — found 2026-09-23 when "Q4.D3–Monthly Trainer Report Form.docx"
 * (an en dash, U+2013, in the real SharePoint filename) 400'd on every
 * upload attempt, aborting the whole import with no version row or storage
 * object ever created. The frontend only ever showed the generic
 * "Edge Function returned a non-2xx status code" (supabase-js doesn't parse
 * the function's JSON error body for non-2xx responses), masking the real
 * cause until the storage_logs request line was found directly.
 *
 * Run: node --test supabase/functions/import-sharepoint-template/storage-key-sanitization.test.mjs
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

describe("import-sharepoint-template storage key sanitization", () => {
  it("defines a sanitizeStorageFileName helper that normalizes dash variants and strips unsafe characters", () => {
    assert.match(src, /function sanitizeStorageFileName\(/);
    const fnStart = src.indexOf("function sanitizeStorageFileName(");
    const fnEnd = src.indexOf("\n}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);

    // en dash (U+2013) specifically — the character that broke the real import —
    // must fall inside a dash-normalizing character class replaced with ascii '-'.
    const enDash = "–";
    const dashReplaceMatch = fnBody.match(/replace\(\/\[([^\]]+)\]\/g,\s*'-'\)/);
    assert.ok(dashReplaceMatch, "expected a replace(...) call normalizing dash-like characters to '-'");
    const dashClassSource = new RegExp(`[${dashReplaceMatch[1]}]`);
    assert.match(enDash, dashClassSource, "en dash (U+2013) must be one of the characters normalized to a plain hyphen");
    // anything else outside a safe key charset gets replaced, not passed through
    assert.match(fnBody, /replace\(\/\[\^A-Za-z0-9\._-\]\/g/);
  });

  it("handleImport's storagePath runs the SharePoint filename through the sanitizer, not the raw name", () => {
    const importStart = src.indexOf("async function handleImport");
    const nextFnStart = src.indexOf("async function scanDocxMergeFields");
    assert.ok(importStart >= 0 && nextFnStart > importStart);
    const importBody = src.slice(importStart, nextFnStart);

    assert.match(importBody, /const storagePath = `governance-templates\/\$\{document_id\}\/v\$\{nextVersion\}\/\$\{sanitizeStorageFileName\(fileName\)\}`/);
    // document_versions.file_name must still keep the real, unsanitized name for display
    assert.match(importBody, /file_name:\s*fileName,/);
  });
});
