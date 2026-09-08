#!/usr/bin/env node

/**
 * Validate the QA baseline cutover contract before a hosted sync.
 *
 * This is deliberately a metadata guard. It does not connect to Supabase,
 * apply migrations, reset a branch, or prove schema parity by itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PRODUCTION_REF = "yxkgdalkbrriasiyyrwk";

function parseArgs(argv) {
  const options = { manifest: process.env.QA_BASELINE_MANIFEST ?? null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") options.manifest = argv[++i];
    else if (arg === "--target-ref") options.targetRef = argv[++i];
    else if (arg === "--target-url") options.targetUrl = argv[++i];
    else if (arg === "--allow-pending") options.allowPending = true;
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function required(value, label, errors) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${label} is required`);
}

function validateManifest(manifest, options = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be a JSON object"];
  }

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!["pending-capture", "verified"].includes(manifest.status)) {
    errors.push("status must be pending-capture or verified");
  }
  if (manifest.status === "pending-capture" && !options.allowPending) {
    errors.push("status is pending-capture; capture and verify the baseline before hosted sync");
  }

  const target = manifest.target ?? {};
  required(target.name, "target.name", errors);
  required(target.projectRef, "target.projectRef", errors);
  required(target.url, "target.url", errors);
  if (target.projectRef === PRODUCTION_REF) errors.push("target.projectRef must not be the production project");
  if (target.url?.includes(`${PRODUCTION_REF}.supabase.co`)) errors.push("target.url must not point at the production project");
  if (options.targetRef && target.projectRef !== options.targetRef) errors.push("target.projectRef does not match --target-ref");
  if (options.targetUrl && target.url !== options.targetUrl) errors.push("target.url does not match --target-url");

  const source = manifest.source ?? {};
  required(source.projectRef, "source.projectRef", errors);
  required(source.capturedAt, "source.capturedAt", errors);
  required(source.commitSha, "source.commitSha", errors);
  required(source.migrationCutoff, "source.migrationCutoff", errors);
  if (source.projectRef !== PRODUCTION_REF) errors.push("source.projectRef must identify production for this baseline");

  const schema = manifest.schema ?? {};
  if (manifest.status === "verified" && schema.inventoryComplete !== true) {
    errors.push("schema.inventoryComplete must be true for a verified baseline");
  }
  const parity = manifest.parity ?? {};
  if (manifest.status === "verified") {
    if (parity.mode !== "application-scope") errors.push("parity.mode must be application-scope for a verified baseline");
    for (const field of ["schemas", "excludedSchemas", "excludedExtensions", "strictSummaryKeys", "countOnlySummaryKeys", "excludedSummaryKeys", "requiredExceptions"]) {
      if (!Array.isArray(parity[field])) errors.push(`parity.${field} must be an array`);
    }
    if (typeof parity.excludedPublications !== "boolean") errors.push("parity.excludedPublications must be boolean");
    if (typeof parity.sanitizedFunctionOverrides !== "boolean") errors.push("parity.sanitizedFunctionOverrides must be boolean");
  }
  required(schema.fingerprint, "schema.fingerprint", errors);
  for (const field of ["extensions", "tables", "views", "functions", "triggers", "policies", "grants", "publications"]) {
    if (!Array.isArray(schema[field])) errors.push(`schema.${field} must be an array`);
  }

  const cron = manifest.cron ?? {};
  if (cron.enabled !== false) errors.push("cron.enabled must be false for QA baseline");
  if (cron.scheduleCount !== 0) errors.push("cron.scheduleCount must be 0 for QA baseline");

  const sync = manifest.sync ?? {};
  if (sync.mode !== "controlled") errors.push("sync.mode must be controlled");
  if (sync.source !== "main") errors.push("sync.source must be main");
  if (sync.automatic === true) errors.push("sync.automatic must be false; QA sync requires an explicit gate");

  return errors;
}

function loadManifest(path) {
  const fullPath = resolve(ROOT, path);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/validate-qa-baseline.mjs --manifest <path> [--target-ref <ref>] [--target-url <url>] [--allow-pending]");
      process.exit(0);
    }
    if (!options.manifest) throw new Error("--manifest or QA_BASELINE_MANIFEST is required");
    const errors = validateManifest(loadManifest(options.manifest), options);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`qa baseline: valid (${options.manifest})`);
  } catch (error) {
    console.error(`qa baseline validation failed: ${error.message}`);
    process.exit(1);
  }
}

export { validateManifest };
