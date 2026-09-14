import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateRunLedger } from "./validate-client-health-run-ledger.mjs";

const success = JSON.parse(readFileSync(new URL("../docs/kb/reference/client-health-activity-analytics/h0/data/run-ledger.success.example.json", import.meta.url), "utf8"));
const partial = JSON.parse(readFileSync(new URL("../docs/kb/reference/client-health-activity-analytics/h0/data/run-ledger.partial.example.json", import.meta.url), "utf8"));

test("accepts complete success and explicit partial synthetic runs", () => {
  assert.deepEqual(validateRunLedger(success), []);
  assert.deepEqual(validateRunLedger(partial), []);
});

test("rejects a success run with incomplete coverage", () => {
  const invalid = structuredClone(success);
  invalid.input.skipped_count = 1;
  invalid.output.distinct_tenant_count = 1;
  const errors = validateRunLedger(invalid);
  assert.ok(errors.some((error) => error.includes("success runs cannot have skipped")));
  assert.ok(errors.some((error) => error.includes("success output tenant coverage")));
});

test("rejects failed runs without a protected diagnostic class or valid timestamps", () => {
  const invalid = structuredClone(success);
  invalid.status = "failed";
  invalid.error.class = null;
  invalid.requested_at = "2026-09-14";
  const errors = validateRunLedger(invalid);
  assert.ok(errors.some((error) => error.includes("failed runs require error.class")));
  assert.ok(errors.some((error) => error.includes("explicit UTC ISO timestamp")));
});

test("rejects unknown fields instead of widening the run contract", () => {
  const invalid = structuredClone(success);
  invalid.output.health_status = "healthy";
  const errors = validateRunLedger(invalid);
  assert.ok(errors.some((error) => error.includes("health_status is not a recognized run-ledger field")));
});
