#!/usr/bin/env node

/**
 * Validate a local Client Health run-ledger record.
 *
 * This guard is intentionally offline. It does not run jobs, write a ledger,
 * connect to Supabase, or decide a health status.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const STATUSES = new Set(["success", "partial", "failed", "aborted"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(errors, object, path, allowed) {
  if (!isObject(object)) return;
  for (const key of Object.keys(object)) if (!allowed.has(key)) errors.push(`${path}.${key} is not a recognized run-ledger field`);
}

function requiredString(errors, object, key, path) {
  if (typeof object?.[key] !== "string" || object[key].trim() === "") errors.push(`${path}.${key} must be a non-empty string`);
}

function requiredUtc(errors, object, key, path) {
  requiredString(errors, object, key, path);
  if (typeof object?.[key] === "string" && !ISO_DATE_TIME.test(object[key])) errors.push(`${path}.${key} must be an explicit UTC ISO timestamp`);
}

function nonNegativeInteger(errors, object, key, path) {
  if (!Number.isInteger(object?.[key]) || object[key] < 0) errors.push(`${path}.${key} must be a non-negative integer`);
}

function percentage(errors, object, key, path) {
  if (typeof object?.[key] !== "number" || !Number.isFinite(object[key]) || object[key] < 0 || object[key] > 100) errors.push(`${path}.${key} must be a number from 0 to 100`);
}

function validateRunLedger(record) {
  const errors = [];
  if (!isObject(record)) return ["record must be a JSON object"];
  checkKeys(errors, record, "record", new Set(["run_id", "metric", "contract_version", "status", "requested_at", "started_at", "completed_at", "source_watermark", "input", "output", "source_quality", "error", "owner", "retry_key", "retention_ref"]));
  for (const key of ["run_id", "metric", "contract_version", "owner", "retry_key", "retention_ref"]) requiredString(errors, record, key, "record");
  requiredString(errors, record, "status", "record");
  if (typeof record.status === "string" && !STATUSES.has(record.status)) errors.push(`record.status has unsupported value ${JSON.stringify(record.status)}`);
  for (const key of ["requested_at", "started_at", "completed_at"]) requiredUtc(errors, record, key, "record");
  if (record.source_watermark !== null && typeof record.source_watermark !== "string") errors.push("record.source_watermark must be a string or null");
  if (typeof record.source_watermark === "string" && !ISO_DATE_TIME.test(record.source_watermark)) errors.push("record.source_watermark must be an explicit UTC ISO timestamp or null");

  for (const [section, keys] of [["input", ["row_count", "distinct_tenant_count", "skipped_count", "invalid_count", "error_count"]], ["output", ["row_count", "distinct_tenant_count"]]]) {
    if (!isObject(record[section])) errors.push(`record.${section} must be an object`);
    else {
      checkKeys(errors, record[section], `record.${section}`, new Set(keys));
      for (const key of keys) nonNegativeInteger(errors, record[section], key, `record.${section}`);
    }
  }
  if (!isObject(record.source_quality)) errors.push("record.source_quality must be an object");
  else {
    checkKeys(errors, record.source_quality, "record.source_quality", new Set(["freshness_percent", "coverage_percent"]));
    percentage(errors, record.source_quality, "freshness_percent", "record.source_quality");
    percentage(errors, record.source_quality, "coverage_percent", "record.source_quality");
  }
  if (!isObject(record.error)) errors.push("record.error must be an object");
  else {
    checkKeys(errors, record.error, "record.error", new Set(["class", "diagnostic_ref"]));
    if (record.error.class !== null) requiredString(errors, record.error, "class", "record.error");
    if (record.error.diagnostic_ref !== null) requiredString(errors, record.error, "diagnostic_ref", "record.error");
  }

  const input = record.input;
  const output = record.output;
  if (record.status === "success" && isObject(input) && isObject(output)) {
    if (input.skipped_count !== 0 || input.invalid_count !== 0 || input.error_count !== 0) errors.push("success runs cannot have skipped, invalid, or error inputs; use partial or failed");
    if (output.distinct_tenant_count !== input.distinct_tenant_count) errors.push("success output tenant coverage must equal input tenant coverage");
  }
  if (["failed", "aborted"].includes(record.status) && isObject(record.error) && record.error.class === null) errors.push(`${record.status} runs require error.class for protected diagnostics`);
  if (record.status === "partial" && isObject(input) && isObject(output) && output.distinct_tenant_count >= input.distinct_tenant_count && input.skipped_count === 0 && input.invalid_count === 0 && input.error_count === 0) errors.push("partial runs must record incomplete input/output coverage or an explicit input error");
  return errors;
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const path = process.argv[2] ?? "docs/kb/reference/client-health-activity-analytics/h0/data/run-ledger.success.example.json";
    if (path === "--help") throw new Error("Usage: node scripts/validate-client-health-run-ledger.mjs [json-file]");
    const errors = validateRunLedger(loadJson(path));
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`client-health run ledger: valid (${path})`);
  } catch (error) {
    console.error(`client-health run-ledger validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export { validateRunLedger };
