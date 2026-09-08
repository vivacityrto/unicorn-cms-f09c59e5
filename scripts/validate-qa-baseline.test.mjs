import assert from "node:assert/strict";
import test from "node:test";

import { validateManifest } from "./validate-qa-baseline.mjs";

const validManifest = {
  schemaVersion: 1,
  status: "verified",
  target: { name: "tenant-isolation-qa", projectRef: "qa-project-ref", url: "https://qa-project-ref.supabase.co" },
  source: { projectRef: "yxkgdalkbrriasiyyrwk", capturedAt: "2026-09-07T00:00:00Z", commitSha: "b24bbca57", migrationCutoff: "20260907000000" },
  schema: { inventoryComplete: true, fingerprint: "sha256:example", extensions: [], tables: [], views: [], functions: [], triggers: [], policies: [], grants: [], publications: [] },
  cron: { enabled: false, scheduleCount: 0 },
  parity: { mode: "application-scope", schemas: ["public", "private"], excludedSchemas: ["auth", "storage", "realtime"], excludedExtensions: ["pg_cron", "pg_net"], excludedPublications: true, sanitizedFunctionOverrides: true, strictSummaryKeys: ["extensions"], countOnlySummaryKeys: [], excludedSummaryKeys: ["publications"], requiredExceptions: [] },
  sync: { mode: "controlled", source: "main", automatic: false },
};

test("accepts a verified, non-production, cron-free controlled baseline", () => {
  assert.deepEqual(validateManifest(validManifest), []);
});

test("rejects production targets and automatic sync", () => {
  const errors = validateManifest({
    ...validManifest,
    target: { ...validManifest.target, projectRef: "yxkgdalkbrriasiyyrwk", url: "https://yxkgdalkbrriasiyyrwk.supabase.co" },
    cron: { enabled: true, scheduleCount: 1 },
    sync: { ...validManifest.sync, automatic: true },
  });
  assert.equal(errors.some((error) => error.includes("production project")), true);
  assert.equal(errors.some((error) => error.includes("scheduleCount")), true);
  assert.equal(errors.some((error) => error.includes("automatic")), true);
});

test("does not allow an unverified baseline for hosted sync", () => {
  const errors = validateManifest({ ...validManifest, status: "pending-capture" });
  assert.equal(errors.some((error) => error.includes("pending-capture")), true);
  assert.deepEqual(validateManifest({ ...validManifest, status: "pending-capture" }, { allowPending: true }), []);
});
