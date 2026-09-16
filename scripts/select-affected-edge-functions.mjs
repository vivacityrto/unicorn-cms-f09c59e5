#!/usr/bin/env node
// Given a base ref (or explicit before/after SHAs), prints the list of
// deployable Edge Functions (one per line) whose bundle is affected by
// what changed under supabase/functions/**.
//
// Why this exists: Deno bundles a function's local relative imports at
// deploy time. Supabase's native GitHub-sync deploy integration has been
// observed to fail silently for changed functions (see AGENTS.md's
// "Supabase deployment workflow" section), and a naive "only redeploy the
// function whose own index.ts changed" heuristic misses every OTHER
// function that imports a changed _shared file — exactly the class of gap
// that caused a real, hand-verified redeployment sweep across 15 functions
// on 2026-09-15 after a shared auth-helpers.ts security fix (see
// docs/audit-log/entries/2026-09-15-fix-verify-auth-dead-account-status-check.md).
//
// This script builds the real per-function dependency closure (following
// local relative imports transitively, the same way Deno's bundler does)
// and uses it to answer: given these changed files, which deployable
// functions actually need a new version?
//
// Usage:
//   node scripts/select-affected-edge-functions.mjs --base <ref>
//   node scripts/select-affected-edge-functions.mjs --before <sha> --after <sha>
//   node scripts/select-affected-edge-functions.mjs --all
//
// Run: node scripts/select-affected-edge-functions.test.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");

// Local relative import specifiers only -- bare/https:// specifiers (npm
// packages, esm.sh, deno.land) are never followed; only these can affect a
// function's own bundle when a file under supabase/functions/ changes.
const IMPORT_RE = /(?:from|import)\s+["'](\.\.?\/[^"']+)["']/g;

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
}

function isDeployableFunctionDir(name) {
  if (name === "_shared") return false;
  if (name.startsWith(".")) return false;
  const entry = join(FUNCTIONS_DIR, name);
  try {
    return statSync(entry).isDirectory() && statSync(join(entry, "index.ts")).isFile();
  } catch {
    return false;
  }
}

function listDeployableFunctions() {
  return readdirSync(FUNCTIONS_DIR).filter(isDeployableFunctionDir).sort();
}

/** Resolve a relative import specifier against the importing file's own directory to a repo-relative POSIX path, or null if it doesn't land under supabase/functions/. */
function resolveLocalImport(importingFileAbs, specifier) {
  const target = normalize(join(dirname(importingFileAbs), specifier));
  const rel = relative(ROOT, target).split("\\").join("/");
  if (!rel.startsWith("supabase/functions/")) return null;
  return rel;
}

/** BFS the local import graph from one function's index.ts. Returns the set of repo-relative file paths in its bundle (including the entrypoint itself). */
function closureFor(functionName) {
  const entry = `supabase/functions/${functionName}/index.ts`;
  const visited = new Set([entry]);
  const queue = [entry];

  while (queue.length > 0) {
    const relPath = queue.shift();
    const absPath = join(ROOT, relPath);
    let src;
    try {
      src = readFileSync(absPath, "utf8");
    } catch {
      continue; // dangling import target; not this script's problem to fix
    }
    for (const match of src.matchAll(IMPORT_RE)) {
      const resolved = resolveLocalImport(absPath, match[1]);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return visited;
}

/** Build the full reverse index once: repo-relative file path -> Set of function names whose bundle includes it. */
function buildReverseIndex(functionNames) {
  const reverse = new Map();
  for (const name of functionNames) {
    for (const file of closureFor(name)) {
      if (!reverse.has(file)) reverse.set(file, new Set());
      reverse.get(file).add(name);
    }
  }
  return reverse;
}

function changedFiles({ base, before, after }) {
  if (before && after) {
    return sh("git", ["diff", "--name-only", "--diff-filter=ACMRD", before, after]);
  }
  let mergeBase;
  try {
    mergeBase = sh("git", ["merge-base", base, "HEAD"]).trim();
  } catch {
    console.error(`select-affected-edge-functions: couldn't find a merge-base with ${base} — is it fetched locally?`);
    process.exit(2);
  }
  return sh("git", ["diff", "--name-only", "--diff-filter=ACMRD", mergeBase]);
}

function parseArgs(argv) {
  const args = { base: null, before: null, after: null, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") args.base = argv[++i];
    else if (argv[i] === "--before") args.before = argv[++i];
    else if (argv[i] === "--after") args.after = argv[++i];
    else if (argv[i] === "--all") args.all = true;
  }
  return args;
}

export function selectAffectedFunctions({ changedFilesList, functionNames = listDeployableFunctions() }) {
  const reverse = buildReverseIndex(functionNames);
  const affected = new Set();
  for (const file of changedFilesList) {
    const owners = reverse.get(file);
    if (owners) for (const name of owners) affected.add(name);
  }
  return [...affected].sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const functionNames = listDeployableFunctions();

  if (args.all) {
    console.log(functionNames.join("\n"));
    return;
  }

  if (!args.base && !(args.before && args.after)) {
    console.error("Usage: --base <ref> | --before <sha> --after <sha> | --all");
    process.exit(2);
  }

  const raw = changedFiles(args);
  const changed = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => f.startsWith("supabase/functions/"));

  if (changed.length === 0) {
    return; // nothing under supabase/functions/** changed -- print nothing, deploy nothing
  }

  const affected = selectAffectedFunctions({ changedFilesList: changed, functionNames });
  console.log(affected.join("\n"));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
