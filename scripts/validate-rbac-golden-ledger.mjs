#!/usr/bin/env node

/**
 * Validate the RBAC P1-m preparation ledger before review or regeneration.
 *
 * This is a repository-only metadata guard. It does not connect to Supabase,
 * interpret a candidate row as policy, or change permissions.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXPECTED_ROW_COUNT = 85;
const READINESS_STATES = new Set(["needs_enforcement_inventory", "needs_product_input", "needs_security_review"]);
const REQUIRED_ROW_FIELDS = [
  "feature_key", "label", "action", "target", "actor", "scope", "relationship_proof",
  "first_enforcement_boundary", "denial_case", "owner", "readiness", "policy_state", "next_static_action",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(errors, object, key, path) {
  if (typeof object?.[key] !== "string" || object[key].trim() === "") errors.push(`${path}.${key} must be a non-empty string`);
}

function validateLedger(ledger) {
  const errors = [];
  if (!isObject(ledger)) return ["ledger must be a JSON object"];
  if (ledger.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof ledger.generatedFrom !== "string" || !ledger.generatedFrom.includes("p1-d-static-enforcement-ledger.json")) errors.push("generatedFrom must identify the P1-d ledger");
  if (typeof ledger.sourceCommit !== "string" || !/^[0-9a-f]{40}$/i.test(ledger.sourceCommit)) errors.push("sourceCommit must be a 40-character commit SHA");
  if (typeof ledger.generatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ledger.generatedAt)) errors.push("generatedAt must be an ISO calendar date");
  if (typeof ledger.purpose !== "string" || !/not policy/i.test(ledger.purpose)) errors.push("purpose must explicitly state that this is not policy");

  if (!isObject(ledger.readinessCounts)) errors.push("readinessCounts must be an object");
  else {
    for (const state of READINESS_STATES) {
      if (!Number.isInteger(ledger.readinessCounts[state]) || ledger.readinessCounts[state] < 0) errors.push(`readinessCounts.${state} must be a non-negative integer`);
    }
  }

  if (!Array.isArray(ledger.rows)) return [...errors, "rows must be an array"];
  if (ledger.rows.length !== EXPECTED_ROW_COUNT) errors.push(`rows must contain exactly ${EXPECTED_ROW_COUNT} feature rows`);
  const featureKeys = new Set();
  const observedCounts = new Map();
  ledger.rows.forEach((row, index) => {
    const path = `rows[${index}]`;
    if (!isObject(row)) {
      errors.push(`${path} must be an object`);
      return;
    }
    for (const field of REQUIRED_ROW_FIELDS) requiredString(errors, row, field, path);
    if (typeof row.feature_key === "string") {
      if (featureKeys.has(row.feature_key)) errors.push(`${path}.feature_key duplicates ${row.feature_key}`);
      featureKeys.add(row.feature_key);
    }
    if (typeof row.readiness === "string") {
      if (!READINESS_STATES.has(row.readiness)) errors.push(`${path}.readiness has unsupported value ${JSON.stringify(row.readiness)}`);
      observedCounts.set(row.readiness, (observedCounts.get(row.readiness) ?? 0) + 1);
    }
    if (row.policy_state !== "candidate_not_approved") errors.push(`${path}.policy_state must remain candidate_not_approved`);
    for (const field of ["frontend_gate_refs", "edge_gate_refs", "source_refs"]) {
      if (!Array.isArray(row[field])) errors.push(`${path}.${field} must be an array`);
    }
  });

  if (isObject(ledger.readinessCounts)) {
    for (const state of READINESS_STATES) {
      if (ledger.readinessCounts[state] !== (observedCounts.get(state) ?? 0)) errors.push(`readinessCounts.${state} does not match row count`);
    }
    const declaredTotal = [...READINESS_STATES].reduce((total, state) => total + (ledger.readinessCounts[state] ?? 0), 0);
    if (declaredTotal !== ledger.rows.length) errors.push("readinessCounts total does not match rows length");
  }
  return errors;
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const path = process.argv[2] ?? "docs/kb/reference/rbac-v6/p1/data/p1-m-row-by-row-golden-preparation.json";
    if (path === "--help") throw new Error("Usage: node scripts/validate-rbac-golden-ledger.mjs [json-file]");
    const errors = validateLedger(loadJson(path));
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`rbac golden ledger: valid (${path})`);
  } catch (error) {
    console.error(`rbac golden ledger validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export { validateLedger };
