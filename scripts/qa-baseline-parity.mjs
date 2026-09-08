#!/usr/bin/env node

/**
 * Compare a QA metadata capture with the recorded production baseline.
 * The capture is expected to come from a read-only catalog query; this tool
 * never connects to Supabase or changes hosted state.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifest } from "./validate-qa-baseline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PRODUCTION_REF = "yxkgdalkbrriasiyyrwk";

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--baseline") options.baseline = argv[++i];
    else if (arg === "--actual") options.actual = argv[++i];
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function parityErrors(baseline, actual) {
  const errors = validateManifest(baseline);
  if (errors.length) return errors.map((error) => `baseline: ${error}`);
  if (!actual || typeof actual !== "object") return ["actual capture must be a JSON object"];
  if (actual.projectRef === PRODUCTION_REF) errors.push("actual.projectRef must not be the production project");
  if (actual.projectRef !== baseline.target?.projectRef) errors.push("actual.projectRef does not match baseline.target.projectRef");
  if (actual.productionUrlReferences > 0) errors.push("actual capture contains production URL references");
  if (actual.cronRelationPresent !== false) errors.push("actual cronRelationPresent must be false");
  if (actual.cronScheduleCount !== 0 && actual.cronScheduleCount !== null) errors.push("actual cronScheduleCount must be 0 or null when cron is absent");
  if (actual.migrationFailures > 0) errors.push("actual capture reports migration failures");
  if (!Number.isInteger(actual.migrationCount) || actual.migrationCount <= 0) errors.push("actual migrationCount must be a positive integer");
  if (typeof actual.latestMigration !== "string" || actual.latestMigration.trim() === "") errors.push("actual latestMigration is required");
  if (actual.nonEmptyApplicationTables !== 0) errors.push("actual nonEmptyApplicationTables must be 0");

  const parity = baseline.parity ?? {};
  if (parity.mode !== "application-scope") errors.push("baseline parity.mode must be application-scope");
  if (actual.scope?.mode !== parity.mode) errors.push("actual scope.mode does not match baseline parity.mode");
  for (const field of ["schemas", "excludedSchemas", "excludedExtensions"]) {
    if (JSON.stringify(actual.scope?.[field]) !== JSON.stringify(parity[field])) {
      errors.push(`actual scope.${field} does not match baseline parity scope`);
    }
  }
  if (actual.scope?.excludedPublications !== parity.excludedPublications) {
    errors.push("actual scope.excludedPublications does not match baseline parity scope");
  }
  if (actual.scope?.sanitizedFunctionOverrides !== parity.sanitizedFunctionOverrides) {
    errors.push("actual scope.sanitizedFunctionOverrides does not match baseline parity scope");
  }

  const expected = baseline.schema?.summary ?? {};
  const observed = actual.schemaSummary ?? {};
  for (const key of parity.strictSummaryKeys ?? []) {
    if (expected[key]?.count !== observed[key]?.count) errors.push(`schema summary count mismatch for ${key}`);
    if (expected[key]?.fingerprint !== observed[key]?.fingerprint) errors.push(`schema summary fingerprint mismatch for ${key}`);
  }
  for (const key of parity.countOnlySummaryKeys ?? []) {
    if (expected[key]?.count !== observed[key]?.count) errors.push(`schema summary count mismatch for ${key}`);
  }
  const actualExceptions = new Set(actual.exceptions ?? []);
  for (const requiredException of parity.requiredExceptions ?? []) {
    if (!actualExceptions.has(requiredException)) errors.push(`actual capture is missing required exception: ${requiredException}`);
  }

  const critical = baseline.schema?.criticalObjects;
  if (critical) {
    if (critical.policyCount !== actual.criticalPolicyCount) errors.push("critical policy count mismatch");
    if (critical.policyFingerprint !== actual.criticalPolicyFingerprint) errors.push("critical policy fingerprint mismatch");
    if (critical.columnCount !== actual.criticalColumnCount) errors.push("critical column count mismatch");
    if (critical.columnFingerprint !== actual.criticalColumnFingerprint) errors.push("critical column fingerprint mismatch");
    if (critical.foreignKeyCount !== actual.criticalForeignKeyCount) errors.push("critical foreign-key count mismatch");
    if (critical.foreignKeyFingerprint !== actual.criticalForeignKeyFingerprint) errors.push("critical foreign-key fingerprint mismatch");
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/qa-baseline-parity.mjs --baseline <manifest> --actual <capture>");
      process.exit(0);
    }
    if (!options.baseline || !options.actual) throw new Error("--baseline and --actual are required");
    const errors = parityErrors(loadJson(options.baseline), loadJson(options.actual));
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("qa baseline parity: pass");
  } catch (error) {
    console.error(`qa baseline parity failed: ${error.message}`);
    process.exit(1);
  }
}

export { parityErrors };
