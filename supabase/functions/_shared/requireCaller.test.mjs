/**
 * Source-level regression checks for the shared requireCaller helper
 * and for the feature-key taxonomy it exports.
 *
 * Run: node --test supabase/functions/_shared/requireCaller.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "requireCaller.ts"), "utf8");

describe("requireCaller helper", () => {
  it("exports requireCaller and requireCallerByUserId", () => {
    assert.match(src, /export async function requireCaller\(/);
    assert.match(src, /export async function requireCallerByUserId\(/);
  });

  it("gates on check_permission with p_user_id / p_feature_key / p_min_level", () => {
    assert.match(src, /rpc\(\s*["']check_permission["']/);
    assert.match(src, /p_user_id:/);
    assert.match(src, /p_feature_key:/);
    assert.match(src, /p_min_level:/);
  });

  it("does not consult role_type, unicorn_role, or global_role for the gate", () => {
    assert.doesNotMatch(src, /role_type/);
    assert.doesNotMatch(src, /global_role/);
    assert.doesNotMatch(src, /is_vivacity_internal/);
    // unicorn_role is only used by allowClientAdmin (orAllow helper), not the gate.
    const gateBody = src.slice(
      src.indexOf("export async function requireCaller("),
      src.indexOf("export async function requireCallerByUserId("),
    );
    assert.doesNotMatch(gateBody, /unicorn_role/);
  });

  it("supports an orAllow escape hatch for tenant-admin / tenant-member paths", () => {
    assert.match(src, /orAllow\?:/);
    assert.match(src, /export async function allowTenantMember\(/);
    assert.match(src, /export async function allowClientAdmin\(/);
  });

  it("exports the documented feature-key taxonomy", () => {
    const required = [
      "staff.internal",
      "staff.sharepoint.use",
      "staff.email.send",
      "staff.documents.generate",
      "staff.ai.use",
      "staff.research.use",
      "staff.meetings.use",
      "staff.billing.xero_view",
      "staff.integrations.tga",
      "staff.addin.use",
      "admin.permissions.manage",
      "admin.migration.unicorn1",
      "admin.testing.seed",
      "admin.vector.manage",
      "admin.integrations.xero_connect",
      "audits.export_pack",
    ];
    for (const key of required) {
      assert.ok(src.includes(`"${key}"`), `missing FeatureKeys entry for ${key}`);
    }
  });
});
