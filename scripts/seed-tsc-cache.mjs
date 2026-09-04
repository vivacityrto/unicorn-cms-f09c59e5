#!/usr/bin/env node
// Seeds this worktree's TypeScript incremental-build cache from another
// worktree (or the main checkout) so `npm run typecheck` doesn't pay a full
// cold compile the first time it runs here.
//
// Why this exists: tsconfig.app.json/tsconfig.node.json point `tsBuildInfoFile`
// at ./node_modules/.cache/tsc/*.tsbuildinfo (PR #548, ~11x speedup on repeat
// runs -- see docs/kb/reference/execution-efficiency-log.md). That path lives
// inside node_modules, which is per-worktree: every fresh `git worktree add`
// + `npm install` starts with an empty cache and re-pays the full ~2m45s cold
// compile once, even though a sibling worktree or the main checkout may have
// just typechecked the same (or nearly the same) codebase seconds ago.
//
// Why copying is safe (does not risk a wrong typecheck result): a
// .tsbuildinfo file is a cache TypeScript verifies before trusting -- it
// records a signature/version per source file, and `tsc --incremental`
// recompiles any file whose actual content doesn't match what the cache
// recorded. Seeding a stale or even unrelated cache can only ever cost a
// cache miss (falls back to compiling that file, i.e. business as usual);
// it can never cause a real error to be silently skipped. Worst case this
// script does nothing (no source cache found) or seeds an unhelpful cache
// (most files miss anyway) -- both are strictly no worse than today's
// guaranteed-cold baseline.
//
// Usage: node scripts/seed-tsc-cache.mjs [--force]
//   --force  overwrite this worktree's cache even if it already has one
//            (normally skipped, so a worktree that's already typechecked
//            once keeps its own -- by definition more relevant -- cache)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CACHE_REL = "node_modules/.cache/tsc";
const FILES = ["app.tsbuildinfo", "node.tsbuildinfo"];
const FORCE = process.argv.includes("--force");

function listWorktrees() {
  const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const paths = [];
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) paths.push(line.slice("worktree ".length).trim());
  }
  return paths;
}

function mtimeOrNull(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

const localCacheDir = join(ROOT, CACHE_REL);
const alreadyWarm = FILES.every((f) => existsSync(join(localCacheDir, f)));
if (alreadyWarm && !FORCE) {
  console.log("seed-tsc-cache: this worktree already has both cache files, leaving as-is (pass --force to overwrite).");
  process.exit(0);
}

let candidates;
try {
  candidates = listWorktrees().filter((p) => join(p) !== ROOT);
} catch (err) {
  console.log(`seed-tsc-cache: could not list worktrees (${err.message}), nothing to seed from.`);
  process.exit(0);
}

// Prefer the most recently modified source cache across all sibling
// worktrees + the main checkout -- likely closest to current origin/main.
let best = null;
for (const wt of candidates) {
  for (const f of FILES) {
    const p = join(wt, CACHE_REL, f);
    const mtime = mtimeOrNull(p);
    if (mtime !== null && (!best || mtime > best.mtime)) {
      best = { worktree: wt, mtime };
    }
  }
}

if (!best) {
  console.log("seed-tsc-cache: no existing .tsbuildinfo found in any sibling worktree or the main checkout -- nothing to seed, first typecheck here will be cold.");
  process.exit(0);
}

mkdirSync(localCacheDir, { recursive: true });
let copied = 0;
for (const f of FILES) {
  const src = join(best.worktree, CACHE_REL, f);
  if (existsSync(src)) {
    copyFileSync(src, join(localCacheDir, f));
    copied++;
  }
}

console.log(`seed-tsc-cache: copied ${copied} cache file(s) from ${best.worktree} into ${localCacheDir}.`);
console.log("seed-tsc-cache: tsc will still re-verify every file's content against this cache -- a stale seed only costs cache misses, never a wrong result.");
