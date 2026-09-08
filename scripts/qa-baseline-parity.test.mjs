import assert from "node:assert/strict";
import test from "node:test";

import { parityErrors } from "./qa-baseline-parity.mjs";

const baseline = {
  schemaVersion: 1,
  status: "verified",
  target: { name: "qa", projectRef: "qa-project-ref", url: "https://qa-project-ref.supabase.co" },
  source: { projectRef: "yxkgdalkbrriasiyyrwk", capturedAt: "2026-09-07", commitSha: "abc", migrationCutoff: "20260907052028" },
  schema: {
    inventoryComplete: true,
    fingerprint: "sha256:all",
    extensions: [], tables: [], views: [], functions: [], triggers: [], policies: [], grants: [], publications: [],
    summary: {
      extensions: { count: 1, fingerprint: "e" }, tables: { count: 2, fingerprint: "t" }, views: { count: 3, fingerprint: "v" },
      functions: { count: 4, fingerprint: "f" }, triggers: { count: 5, fingerprint: "tr" }, policies: { count: 6, fingerprint: "p" }, publications: { count: 7, fingerprint: "pub" },
    },
    criticalObjects: { policyCount: 8, policyFingerprint: "cp", columnCount: 9, columnFingerprint: "cc", foreignKeyCount: 10, foreignKeyFingerprint: "cf" },
  },
  cron: { enabled: false, scheduleCount: 0 },
  parity: {
    mode: "application-scope",
    schemas: ["public", "private"],
    excludedSchemas: ["auth", "storage", "realtime"],
    excludedExtensions: ["pg_cron", "pg_net"],
    excludedPublications: true,
    sanitizedFunctionOverrides: true,
    strictSummaryKeys: ["extensions", "tables", "views"],
    countOnlySummaryKeys: ["functions", "triggers", "policies"],
    excludedSummaryKeys: ["publications"],
    requiredExceptions: ["managed", "cron", "sanitized", "type"],
  },
  sync: { mode: "controlled", source: "main", automatic: false },
};

const actual = {
  projectRef: "qa-project-ref",
  scope: { mode: "application-scope", schemas: ["public", "private"], excludedSchemas: ["auth", "storage", "realtime"], excludedExtensions: ["pg_cron", "pg_net"], excludedPublications: true, sanitizedFunctionOverrides: true },
  productionUrlReferences: 0,
  cronRelationPresent: false,
  cronScheduleCount: 0,
  migrationFailures: 0,
  migrationCount: 1,
  latestMigration: "20260908000000",
  nonEmptyApplicationTables: 0,
  exceptions: ["managed", "cron", "sanitized", "type"],
  schemaSummary: {
    extensions: { count: 1, fingerprint: "e" }, tables: { count: 2, fingerprint: "t" }, views: { count: 3, fingerprint: "v" },
    functions: { count: 4, fingerprint: "f" }, triggers: { count: 5, fingerprint: "tr" }, policies: { count: 6, fingerprint: "p" }, publications: { count: 7, fingerprint: "pub" },
  },
  criticalPolicyCount: 8, criticalPolicyFingerprint: "cp", criticalColumnCount: 9, criticalColumnFingerprint: "cc", criticalForeignKeyCount: 10, criticalForeignKeyFingerprint: "cf",
};

test("passes matching cron-free QA metadata", () => {
  assert.deepEqual(parityErrors(baseline, actual), []);
});

test("rejects drift and production side effects", () => {
  const errors = parityErrors(baseline, { ...actual, productionUrlReferences: 1, cronRelationPresent: true, cronScheduleCount: 2, schemaSummary: { ...actual.schemaSummary, tables: { count: 99, fingerprint: "changed" } } });
  assert.equal(errors.some((error) => error.includes("production URL")), true);
  assert.equal(errors.some((error) => error.includes("cronScheduleCount")), true);
  assert.equal(errors.some((error) => error.includes("tables")), true);
});
