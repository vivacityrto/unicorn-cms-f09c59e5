/**
 * Adoption checks: converted functions import requireCaller / checkPermission
 * and no longer gate on role_type.
 *
 * Run: node --test supabase/functions/_shared/requireCaller-adoption.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const mustAdopt = [
  "send-composed-email",
  "send-email-graph",
  "send-stage-email",
  "export-compliance-pack",
  "xero-auth",
  "xero-invoice-list",
  "xero-invoice-status",
  "update-role-permission",
  "deliver-governance-document",
  "tenant-lifecycle",
  "bulk-generate-phase-documents",
  "resolve-sharepoint-folder-url",
];

describe("requireCaller adoption", () => {
  for (const name of mustAdopt) {
    it(`${name} imports requireCaller or checkPermission`, () => {
      const src = readFileSync(join(functionsRoot, name, "index.ts"), "utf8");
      assert.match(src, /requireCaller|checkPermission/);
      assert.doesNotMatch(src, /\.select\([^)]*role_type|role_type\s*===/);
    });
  }

  it("no function still selects role_type for a caller gate", () => {
    const dirs = readdirSync(functionsRoot).filter((d) => {
      if (d.startsWith("_")) return false;
      try {
        return statSync(join(functionsRoot, d, "index.ts")).isFile();
      } catch {
        return false;
      }
    });
    const offenders = [];
    for (const d of dirs) {
      const src = readFileSync(join(functionsRoot, d, "index.ts"), "utf8");
      if (/\.select\([^)]*role_type/.test(src)) offenders.push(d);
    }
    assert.deepEqual(offenders, []);
  });
});
