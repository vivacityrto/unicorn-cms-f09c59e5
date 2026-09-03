#!/usr/bin/env node
// Committed lint-debt baseline (Phase 2.5 PR 1, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// `npm run lint` fails outright today (~4,000 pre-existing errors) and
// lint-ratchet.mjs only guards against NEW regressions in changed files. This
// script instead produces a committed, regenerable snapshot of the EXISTING
// debt -- by rule, source class, directory, and file -- so later retirement
// batches (Phase 2.5 PR 2+) have something concrete to diff "before" vs
// "after" against, instead of re-deriving the shape of the problem each time.
//
// It intentionally does NOT commit ESLint's raw per-finding JSON (one run is
// ~12MB and goes stale the moment a single finding is fixed). The committed
// artifact is an aggregation; per-file counts are the finest grain kept,
// which is enough to prove a batch reduced its targeted files with no
// compensating increase elsewhere.
//
// Usage: node scripts/generate-lint-baseline.mjs [--json] [--out <file>]

import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_OUT = join(ROOT, "docs/kb/reference/lint-baseline.json");

// Kept in sync with lint-ratchet.mjs's EXCLUDE and the exception policy at
// docs/kb/reference/lint-exception-policy.md -- both describe the same set
// of files that are exempt from the retirement program, for the same reason.
const EXCEPTIONS = [
  {
    path: "src/integrations/supabase/types.ts",
    reason: "generated (Supabase CLI type generation, not hand-authored)",
  },
  {
    path: "src/integrations/supabase/previewAuthStorage.ts",
    reason: "generated (Lovable preview-auth brokering; file header says do not edit directly)",
  },
];

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 128 });
  } catch (err) {
    // eslint exits 1 when it finds lint errors -- the JSON report is still on stdout.
    if (err.stdout) return err.stdout;
    throw err;
  }
}

function relPath(p) {
  return relative(ROOT, p).split("\\").join("/");
}

function sourceClassFor(path) {
  if (path.startsWith("src/")) return "src";
  if (path.startsWith("supabase/functions/")) return "supabase/functions";
  return "tooling";
}

function bump(bucket, ruleId, severity) {
  bucket.errors ??= 0;
  bucket.warnings ??= 0;
  bucket.byRule ??= {};
  bucket.byRule[ruleId] ??= 0;
  bucket.byRule[ruleId] += 1;
  if (severity === 2) bucket.errors += 1;
  else bucket.warnings += 1;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx !== -1 ? args[outIdx + 1] : DEFAULT_OUT;

  const raw = sh(process.execPath, ["node_modules/eslint/bin/eslint.js", ".", "--format", "json"]);
  const results = JSON.parse(raw);

  const exceptionPaths = new Set(EXCEPTIONS.map((e) => e.path));

  const totals = { files: results.length, filesWithFindings: 0, errors: 0, warnings: 0 };
  const byRule = {};
  const bySourceClass = {};
  const byDirectory = {};
  const byFile = {};

  for (const result of results) {
    if (result.messages.length === 0) continue;
    const path = relPath(result.filePath);
    if (exceptionPaths.has(path)) continue;

    totals.filesWithFindings += 1;
    const sourceClass = sourceClassFor(path);
    const directory = dirname(path);

    bySourceClass[sourceClass] ??= {};
    byDirectory[directory] ??= {};
    byFile[path] ??= {};

    for (const msg of result.messages) {
      if (!msg.ruleId) continue; // parse errors etc. have no ruleId; skip rather than mislabel
      totals.errors += msg.severity === 2 ? 1 : 0;
      totals.warnings += msg.severity === 1 ? 1 : 0;
      byRule[msg.ruleId] = (byRule[msg.ruleId] || 0) + 1;
      bump(bySourceClass[sourceClass], msg.ruleId, msg.severity);
      bump(byDirectory[directory], msg.ruleId, msg.severity);
      byFile[path][msg.ruleId] = (byFile[path][msg.ruleId] || 0) + 1;
    }
  }

  const baselineSha = sh("git", ["rev-parse", "HEAD"]).trim();

  const baseline = {
    generatedAt: new Date().toISOString(),
    baselineSha,
    totals,
    byRule,
    bySourceClass,
    byDirectory,
    byFile,
    exceptions: EXCEPTIONS,
    exceptionPolicy: "docs/kb/reference/lint-exception-policy.md",
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(baseline, null, 2) + "\n");
    return;
  }

  writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`lint-baseline: wrote ${relPath(outPath)}`);
  console.log(
    `lint-baseline: ${totals.filesWithFindings} files with findings, ${totals.errors} errors, ${totals.warnings} warnings (SHA ${baselineSha.slice(0, 8)})`,
  );
}

main();
