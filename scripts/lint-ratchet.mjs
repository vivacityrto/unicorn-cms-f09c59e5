#!/usr/bin/env node
// Diff-scoped lint ratchet (P0.4, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// The full repo currently fails `npm run lint` outright (~4,100 pre-existing
// errors, almost all @typescript-eslint/no-explicit-any) — a global cleanup
// isn't realistic in one PR. This script instead looks only at files changed
// since the base branch and fails if any of them got WORSE:
//   - a file that existed at the base ref must not gain new lint errors
//   - a file added since the base ref must have zero lint errors
// A changed file that still carries its pre-existing errors (untouched by
// this diff) is not itself a failure — that's the "ratchet", not a cleanup.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const BASE_REF = process.env.LINT_RATCHET_BASE || "origin/main";
const LINTABLE = /\.(ts|tsx)$/;
const EXCLUDE = [/^src\/integrations\/supabase\/types\.ts$/];

function sh(cmd, args, extraOpts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64, ...extraOpts });
}

function changedFiles() {
  let mergeBase;
  try {
    mergeBase = sh("git", ["merge-base", BASE_REF, "HEAD"]).trim();
  } catch {
    console.error(`lint-ratchet: couldn't find a merge-base with ${BASE_REF} — is it fetched locally?`);
    process.exit(2);
  }
  // Deliberately no explicit "HEAD" endpoint: comparing against the working
  // tree (staged + unstaged) so this also works as a pre-commit local check,
  // not just a CI-on-a-pushed-branch check.
  const out = sh("git", ["diff", "--name-only", "--diff-filter=ACMR", mergeBase]);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => LINTABLE.test(f))
    .filter((f) => !EXCLUDE.some((re) => re.test(f)));
}

// Maps a renamed file's new path to its old path at mergeBase, so a file
// moved (with or without content changes) as part of a refactor is compared
// against ITS OWN prior error count, not treated as a brand-new file with a
// 0-error baseline. Without this, `git mv`-ing a file that already carried
// pre-existing lint debt (e.g. unwrapping a *Wrapper.tsx and dropping
// "Wrapper" from its name once it no longer wraps anything) reports that
// debt as newly introduced by this change, when none of it is: same lines,
// same errors, just a new path.
function renameMap(mergeBase) {
  const out = sh("git", ["diff", "--name-status", "-M", "--diff-filter=R", mergeBase]);
  const map = new Map();
  for (const line of out.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [status, oldPath, newPath] = line.split("\t");
    if (status && status.startsWith("R") && oldPath && newPath) map.set(newPath, oldPath);
  }
  return map;
}

function fileExistsAt(ref, path) {
  try {
    sh("git", ["cat-file", "-e", `${ref}:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function errorCountFor(content, filename) {
  let out;
  try {
    out = sh(process.execPath, [
      "node_modules/eslint/bin/eslint.js",
      "--stdin",
      "--stdin-filename",
      filename,
      "--format",
      "json",
    ], { input: content });
  } catch (err) {
    // eslint exits 1 when it finds lint errors — that's expected, the JSON
    // report is still on stdout.
    out = err.stdout;
  }
  const [result] = JSON.parse(out);
  return result ? result.errorCount : 0;
}

function contentAt(ref, path) {
  return sh("git", ["show", `${ref}:${path}`]);
}

function currentContent(path) {
  return readFileSync(path, "utf8"); // actual working-tree file, staged or not
}

function main() {
  const mergeBase = sh("git", ["merge-base", BASE_REF, "HEAD"]).trim();
  const files = changedFiles();

  if (files.length === 0) {
    console.log(`lint-ratchet: no changed .ts/.tsx files vs ${BASE_REF} (merge-base ${mergeBase.slice(0, 8)})`);
    return;
  }

  console.log(`lint-ratchet: checking ${files.length} changed file(s) vs ${BASE_REF} (merge-base ${mergeBase.slice(0, 8)})`);
  console.log("");

  const renames = renameMap(mergeBase);
  let failed = false;
  for (const file of files) {
    if (!existsSync(file)) continue; // deleted in working tree relative to index — nothing to check

    const baselinePath = renames.get(file) ?? file;
    const existedBefore = fileExistsAt(mergeBase, baselinePath);
    const afterCount = errorCountFor(currentContent(file), file);
    const beforeCount = existedBefore ? errorCountFor(contentAt(mergeBase, baselinePath), baselinePath) : 0;

    const regressed = afterCount > beforeCount;
    const status = regressed ? "FAIL" : "ok";
    if (regressed) failed = true;

    const renameNote = baselinePath !== file ? `, renamed from ${baselinePath}` : "";
    console.log(
      `${status.padEnd(4)} ${file}  (errors: ${beforeCount} -> ${afterCount}${existedBefore ? "" : ", new file"}${renameNote})`,
    );
  }

  console.log("");
  if (failed) {
    console.error("lint-ratchet: one or more changed files introduced new lint errors. Fix the new errors above");
    console.error("(pre-existing errors in a touched-but-not-worsened file are not blocking).");
    process.exit(1);
  }

  console.log("lint-ratchet: no regressions in changed files.");
}

main();
