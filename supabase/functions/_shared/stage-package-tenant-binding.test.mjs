/**
 * F-033/F-034/F-035: functions that accept a caller-supplied tenant_id
 * plus a package/phase/stage identifier must bind that identifier to the
 * claimed tenant via package_instances before any service-role read or
 * write — presence-only validation lets an authenticated caller read or
 * mutate another tenant's data by supplying a valid but mismatched id.
 *
 * `stage_instances` has no tenant_id column (per AGENTS.md / the
 * remediation handoff): ownership must be resolved through
 * stage_instances.packageinstance_id -> package_instances.tenant_id,
 * never trusted directly off the request body.
 *
 * Run: node --test supabase/functions/_shared/stage-package-tenant-binding.test.mjs
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

function indexOfFirst(src, patterns) {
  const idxs = patterns
    .map((p) => src.search(p))
    .filter((i) => i >= 0);
  assert.ok(idxs.length > 0, `none of ${patterns} matched`);
  return Math.min(...idxs);
}

describe("stage/package -> tenant binding before service-role access", () => {
  it("calculate-phase-completeness validates package_instances(tenant_id, package_id) and phase_stages(package_id, phase_id) before loading requirements", () => {
    const src = readFn("calculate-phase-completeness");
    assert.match(src, /from\("package_instances"\)/);
    assert.match(src, /\.eq\("tenant_id", tenant_id\)/);
    assert.match(src, /\.eq\("package_id", package_id\)/);
    assert.match(src, /from\("phase_stages"\)/);
    assert.match(src, /!packageInstance \|\| !phaseStage/);

    const validationAt = indexOfFirst(src, [/if \(packageError \|\| phaseError \|\| !packageInstance \|\| !phaseStage\)/]);
    const requirementsLoadAt = src.indexOf('from("phase_requirements")');
    assert.ok(requirementsLoadAt > validationAt, "tenant/phase binding must be validated before loading phase requirements");
  });

  it("research-evidence-gap-check resolves stage_instances -> package_instances and requires a tenant match before creating the job", () => {
    const src = readFn("research-evidence-gap-check");
    assert.match(src, /from\("stage_instances"\)/);
    assert.match(src, /packageinstance_id/);
    assert.match(src, /from\("package_instances"\)/);
    assert.match(src, /\.eq\("id", stageInstance\.packageinstance_id\)/);
    assert.match(src, /\.eq\("tenant_id", tenant_id\)/);

    const validationAt = indexOfFirst(src, [/if \(packageError \|\| !packageInstance\)/]);
    const jobInsertAt = src.indexOf('from("research_jobs")\n      .insert');
    assert.ok(jobInsertAt === -1 || jobInsertAt > validationAt, "tenant/stage binding must be validated before creating the research job");
  });

  it("create-client-audit validates an optional linked_stage_instance_id belongs to the subject tenant before inserting the audit", () => {
    const src = readFn("create-client-audit");
    assert.match(src, /linked_stage_instance_id/);
    assert.match(src, /from\("stage_instances"\)/);
    assert.match(src, /from\("package_instances"\)/);
    assert.match(src, /\.eq\("tenant_id", subject_tenant_id\)/);
    assert.match(src, /Linked stage instance does not belong to this tenant/);

    const validationAt = indexOfFirst(src, [/Linked stage instance does not belong to this tenant/]);
    const auditInsertAt = src.indexOf("// Insert audit");
    assert.ok(auditInsertAt > validationAt, "linked-stage tenant binding must be validated before the audit insert");
  });

  it("create-client-audit no longer treats a truthy unicorn_role as proof of staff authorization", () => {
    const src = readFn("create-client-audit");
    assert.doesNotMatch(src, /isStaff\s*=\s*!!userRow\?\.unicorn_role/);
    assert.match(src, /requireCaller\(/);
  });
});
