#!/usr/bin/env node
// Names every Edge Function test file and which harness actually runs it, so
// `npm run test` can never silently call "220 passing MJS tests" the whole
// suite (P0.2, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// Classification is by content, not filename convention: a `_test.ts` /
// `.test.ts` file is Deno-only if it references the `Deno.test` global or a
// `deno.land`/`npm:` specifier — those aren't executable without the Deno
// CLI, which isn't installed in this environment. Everything else with a
// `.test.mjs` or a Deno-free `.test.ts`/`.node-test.ts` extension runs under
// `node --test`.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TARGET_DIR = join(ROOT, "supabase", "functions");

const DENO_MARKER = /Deno\.test\(|from\s+["']https:\/\/deno\.land|from\s+["']npm:/;

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function isTestFile(path) {
  return /\.test\.mjs$|\.test\.ts$|\.node-test\.ts$|_test\.ts$/.test(path);
}

function main() {
  const testFiles = listFiles(TARGET_DIR)
    .filter(isTestFile)
    .map((f) => relative(ROOT, f).split("\\").join("/"))
    .sort();

  const nodeMjs = [];
  const nodeTs = [];
  const denoOnly = [];

  for (const rel of testFiles) {
    if (rel.endsWith(".test.mjs")) {
      nodeMjs.push(rel);
      continue;
    }
    const content = readFileSync(join(ROOT, rel), "utf8");
    if (DENO_MARKER.test(content)) denoOnly.push(rel);
    else nodeTs.push(rel);
  }

  console.log("Edge Function test inventory");
  console.log("=============================");
  console.log(`Executed by 'npm run test:edge' (node --test, .mjs):     ${nodeMjs.length}`);
  console.log(`Executed by 'npm run test:edge' (node --test, .ts):      ${nodeTs.length}`);
  console.log(`NOT executed — Deno-runtime only, Deno CLI not installed: ${denoOnly.length}`);
  console.log(`Total test files found:                                  ${testFiles.length}`);

  if (denoOnly.length > 0) {
    console.log("");
    console.log("Unexecuted (Deno-only) test files:");
    for (const f of denoOnly) console.log(`  - ${f}`);
    console.log("");
    console.log("These require `deno test` to run and are not covered by any currently");
    console.log("configured harness. Do not treat a green `npm run test` as covering them.");
  }
}

main();
