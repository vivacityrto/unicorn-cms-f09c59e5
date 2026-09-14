#!/usr/bin/env node

/**
 * Validate local Client Health consultant evidence before consolidation.
 *
 * This is a fail-closed, repository-only guard. It reads JSON from disk and
 * never connects to Supabase, sends reports, or infers a health policy.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FORBIDDEN_KEYS = new Set([
  "tenant_id",
  "client_id",
  "client_name",
  "email",
  "phone",
  "contact_details",
  "raw_note",
  "raw_notes",
  "transcript",
  "attachment",
  "screenshot",
  "credential",
  "credentials",
  "password",
  "secret",
  "token",
]);
const FORBIDDEN_TEXT = [
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]+/i,
  /\b(?:eyJ|sk_live_|pk_live_)[A-Za-z0-9._-]+/,
  /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i,
];

const ENUMS = {
  lifecycle: new Set(["onboarding", "delivery", "renewal", "other"]),
  ownership: new Set(["client", "vivacity", "shared", "third_party", "unknown"]),
  sourceClass: new Set(["consultant_experience", "synthetic_example", "repository_evidence", "external_source"]),
  freshness: new Set(["current", "dated", "unknown"]),
  coverage: new Set(["representative", "partial", "single_case", "unknown"]),
  confidence: new Set(["high", "medium", "low"]),
  classification: new Set(["observation", "interpretation", "proposal", "decision_request", "open_question"]),
  sensitivity: new Set(["public_process", "internal", "restricted", "unknown"]),
  redaction: new Set(["synthetic", "deidentified", "irreversibly_redacted", "not_applicable"]),
  reviewStatus: new Set(["unreviewed", "consultant_complete", "consolidated", "accepted", "rejected", "inconclusive"]),
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(errors, object, key, path) {
  if (typeof object?.[key] !== "string" || object[key].trim() === "") errors.push(`${path}.${key} must be a non-empty string`);
}

function checkKeys(errors, object, path, allowedKeys) {
  if (!isObject(object)) return;
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) errors.push(`${path}.${key} is not a recognized evidence field`);
  }
}

function requireEnum(errors, object, key, path, values) {
  requireString(errors, object, key, path);
  if (typeof object?.[key] === "string" && !values.has(object[key])) errors.push(`${path}.${key} has unsupported value ${JSON.stringify(object[key])}`);
}

function requireDateTime(errors, object, key, path) {
  requireString(errors, object, key, path);
  if (typeof object?.[key] === "string" && !ISO_DATE_TIME.test(object[key])) errors.push(`${path}.${key} must be an explicit UTC ISO timestamp`);
}

function scanSafeContent(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSafeContent(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string" && FORBIDDEN_TEXT.some((pattern) => pattern.test(value))) errors.push(`${path} contains identifier- or credential-shaped text`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) errors.push(`${path}.${key} is not allowed in a handback record`);
    scanSafeContent(child, `${path}.${key}`, errors);
  }
}

function validateEvidenceRecord(record) {
  const errors = [];
  if (!isObject(record)) return ["record must be a JSON object"];

  checkKeys(errors, record, "record", new Set([
    "evidence_id", "report_id", "claim_type", "subject_grain", "scope", "observation_window", "claim",
    "operational_context", "ownership", "source", "quality", "classification", "sensitivity", "redaction",
    "review", "contradictions", "supersedes", "implementation_use",
  ]));
  for (const key of ["evidence_id", "report_id", "claim_type", "subject_grain", "claim", "operational_context"]) requireString(errors, record, key, "record");
  if (!isObject(record.scope)) errors.push("record.scope must be an object");
  else {
    checkKeys(errors, record.scope, "record.scope", new Set(["package", "lifecycle", "cohort"]));
    for (const key of ["package", "cohort"]) requireString(errors, record.scope, key, "record.scope");
    requireEnum(errors, record.scope, "lifecycle", "record.scope", ENUMS.lifecycle);
  }
  if (!isObject(record.observation_window)) errors.push("record.observation_window must be an object");
  else {
    checkKeys(errors, record.observation_window, "record.observation_window", new Set(["starts_at", "ends_at", "timezone"]));
    for (const key of ["starts_at", "ends_at"]) requireDateTime(errors, record.observation_window, key, "record.observation_window");
    requireString(errors, record.observation_window, "timezone", "record.observation_window");
  }
  requireEnum(errors, record, "ownership", "record", ENUMS.ownership);
  if (!isObject(record.source)) errors.push("record.source must be an object");
  else {
    checkKeys(errors, record.source, "record.source", new Set(["class", "reference", "observed_at", "effective_at", "as_of"]));
    requireEnum(errors, record.source, "class", "record.source", ENUMS.sourceClass);
    requireString(errors, record.source, "reference", "record.source");
    for (const key of ["observed_at", "effective_at", "as_of"]) requireDateTime(errors, record.source, key, "record.source");
  }
  if (!isObject(record.quality)) errors.push("record.quality must be an object");
  else {
    checkKeys(errors, record.quality, "record.quality", new Set(["freshness", "coverage", "confidence", "limitations"]));
    requireEnum(errors, record.quality, "freshness", "record.quality", ENUMS.freshness);
    requireEnum(errors, record.quality, "coverage", "record.quality", ENUMS.coverage);
    requireEnum(errors, record.quality, "confidence", "record.quality", ENUMS.confidence);
    requireString(errors, record.quality, "limitations", "record.quality");
  }
  requireEnum(errors, record, "classification", "record", ENUMS.classification);
  requireEnum(errors, record, "sensitivity", "record", ENUMS.sensitivity);
  requireEnum(errors, record, "redaction", "record", ENUMS.redaction);
  if (!isObject(record.review)) errors.push("record.review must be an object");
  else {
    checkKeys(errors, record.review, "record.review", new Set(["status", "reviewer", "reviewed_at"]));
    requireEnum(errors, record.review, "status", "record.review", ENUMS.reviewStatus);
    requireString(errors, record.review, "reviewer", "record.review");
    requireDateTime(errors, record.review, "reviewed_at", "record.review");
  }
  for (const key of ["contradictions", "supersedes"]) {
    if (!Array.isArray(record[key]) || record[key].some((item) => typeof item !== "string" || item.trim() === "")) errors.push(`record.${key} must be an array of non-empty strings`);
  }
  if (record.implementation_use !== "blocked_pending_policy") errors.push("record.implementation_use must remain blocked_pending_policy");
  if (["consultant_experience", "synthetic_example"].includes(record.source?.class) && !["synthetic", "deidentified", "irreversibly_redacted"].includes(record.redaction)) {
    errors.push("consultant or synthetic evidence requires an explicit safe redaction value");
  }
  scanSafeContent(record, "record", errors);
  return errors;
}

function validateEvidenceDocument(document) {
  if (Array.isArray(document) && document.length === 0) return ["document must contain at least one evidence record"];
  const records = Array.isArray(document) ? document : [document];
  return records.flatMap((record, index) => validateEvidenceRecord(record).map((error) => `record[${index}]: ${error}`));
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const path = process.argv[2];
    if (!path || path === "--help") throw new Error("Usage: node scripts/validate-client-health-evidence.mjs <json-file>");
    const errors = validateEvidenceDocument(loadJson(path));
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`client-health evidence: valid (${path})`);
  } catch (error) {
    console.error(`client-health evidence validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export { validateEvidenceDocument, validateEvidenceRecord };
