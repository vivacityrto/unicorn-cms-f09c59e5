/**
 * F-026/F-027: global SharePoint site access and cross-tenant sharing-URL
 * resolution must be locked to genuine staff/tenant authorization, not just
 * "authenticated with some tenant_id".
 *
 * Run: node --test supabase/functions/_shared/sharepoint-global-site-gate.test.mjs
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

describe("F-026: browse-sharepoint-folder global site_purpose mode", () => {
  const src = readFn("browse-sharepoint-folder");

  it("requires the staff permission (caller.via === permission), not just the tenant-member orAllow fallback", () => {
    assert.match(src, /if\s*\(sitePurposeEarly\)\s*\{[\s\S]{0,200}!isSuperAdmin/);
  });

  it("allowlists known site_purpose values instead of trusting any string", () => {
    assert.match(src, /ALLOWED_GLOBAL_SITE_PURPOSES/);
    assert.match(src, /ALLOWED_GLOBAL_SITE_PURPOSES\.has\(sitePurposeEarly\)/);
  });

  it("allowlist covers every site_purpose the frontend admin UI offers, including client_success_files", () => {
    const allowlistMatch = src.match(/ALLOWED_GLOBAL_SITE_PURPOSES = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(allowlistMatch, "could not find ALLOWED_GLOBAL_SITE_PURPOSES definition");
    assert.match(allowlistMatch[1], /"client_success_files"/);
  });

  it("still gates every caller behind requireCaller before any DB/Graph access", () => {
    assert.match(src, /requireCaller\(/);
    assert.match(src, /if \(!caller\.ok\) return caller\.response;/);
  });
});

describe("F-027: get-sharepoint-parent-folder tenant binding", () => {
  const src = readFn("get-sharepoint-parent-folder");

  it("requires tenant_id (no longer optional) and checks tenant access", () => {
    assert.match(src, /tenant_id:\s*z\.number\(\)\.int\(\)\.positive\(\)(?!\.optional)/);
    assert.doesNotMatch(src, /tenant_id:\s*z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
    assert.match(src, /hasTenantAccessSafe\(/);
  });

  it("restricts file_url to a sharepoint.com host before resolving it", () => {
    assert.match(src, /isAllowedSharePointHost/);
    const gateIdx = src.search(/isAllowedSharePointHost\(file_url\)/);
    const resolveIdx = src.indexOf("resolveDriveItemFromSharingUrl(file_url)");
    assert.ok(gateIdx >= 0 && resolveIdx > gateIdx, "host check must run before resolving the sharing URL");
  });

  it("binds the resolved drive back to the requesting tenant's configured SharePoint drive", () => {
    assert.match(src, /tenant_sharepoint_settings/);
    assert.match(src, /resolved\.driveId !== spSettings\.drive_id/);
    const bindIdx = src.indexOf("resolved.driveId !== spSettings.drive_id");
    const parentFetchIdx = src.indexOf("Step 1: fetch the item");
    assert.ok(bindIdx >= 0 && parentFetchIdx > bindIdx, "tenant/drive binding must be validated before fetching parent metadata");
  });
});
