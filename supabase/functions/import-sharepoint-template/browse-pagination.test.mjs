/**
 * Regression: handleBrowse's Graph API listing must follow @odata.nextLink
 * rather than trusting a single $top=200 page. Graph caps a single page at
 * 200 items regardless of the requested $top, so any folder with more than
 * 200 children (e.g. the "RTO" master template folder, which has 244) had
 * its listing silently truncated by name — files sorting after the 200th
 * item were invisible in the "Create Document" / governance import picker
 * even though they existed in SharePoint. Found 2026-09-22 when two real
 * templates (uploaded by Dave Richards) couldn't be found via "link or
 * import the template" in the app, despite being visible in SharePoint
 * itself.
 *
 * Run: node --test supabase/functions/import-sharepoint-template/browse-pagination.test.mjs
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

describe("import-sharepoint-template browse pagination", () => {
  it("handleBrowse follows @odata.nextLink instead of returning only the first page", () => {
    const browseStart = src.indexOf("async function handleBrowse");
    assert.ok(browseStart >= 0);
    const browseBody = src.slice(browseStart, browseStart + 2000);

    assert.match(browseBody, /@odata\.nextLink/);
    assert.match(browseBody, /for\s*\(/, "expects a loop that keeps paging while a nextLink is present");
  });

  it("caps the pagination loop so a pathological nextLink chain can't loop forever", () => {
    const browseStart = src.indexOf("async function handleBrowse");
    const browseBody = src.slice(browseStart, browseStart + 2000);
    assert.match(browseBody, /MAX_PAGES/);
  });

  it("accumulates every page's items before mapping the response, not just the last page's", () => {
    const browseStart = src.indexOf("async function handleBrowse");
    const browseEnd = src.indexOf("\n}", browseStart);
    const browseBody = src.slice(browseStart, browseEnd);

    assert.match(browseBody, /driveItems\.push\(/);
    assert.match(browseBody, /driveItems\.map\(/, "the response should map over every accumulated page, not listResp.data.value directly");
  });
});
