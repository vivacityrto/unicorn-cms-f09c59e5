import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateLedger } from "./validate-rbac-golden-ledger.mjs";

const ledger = JSON.parse(readFileSync(new URL("../docs/kb/reference/rbac-v6/p1/data/p1-m-row-by-row-golden-preparation.json", import.meta.url), "utf8"));

test("accepts the current 85-row preparation ledger", () => {
  assert.deepEqual(validateLedger(ledger), []);
});

test("rejects a row that looks approved or loses a required evidence array", () => {
  const invalid = structuredClone(ledger);
  invalid.rows[0].policy_state = "approved";
  invalid.rows[0].source_refs = null;
  const errors = validateLedger(invalid);
  assert.ok(errors.some((error) => error.includes("policy_state must remain candidate_not_approved")));
  assert.ok(errors.some((error) => error.includes("source_refs must be an array")));
});

test("rejects duplicate rows and stale readiness counts", () => {
  const invalid = structuredClone(ledger);
  invalid.rows[1].feature_key = invalid.rows[0].feature_key;
  invalid.readinessCounts.needs_enforcement_inventory += 1;
  const errors = validateLedger(invalid);
  assert.ok(errors.some((error) => error.includes("duplicates")));
  assert.ok(errors.some((error) => error.includes("does not match row count")));
});
