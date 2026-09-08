#!/usr/bin/env node
// KB doc size guardrail (Phase 2.6 program-index restructure, 2026-09-08).
//
// Fails when a plan/phase/packet doc under the four tracked initiatives
// exceeds a line-count ceiling. This is what actually enforces "don't let
// narrative creep back into a plan doc instead of its progress-log.md" --
// without it, the rule is just a convention nobody has to follow (which is
// exactly how the stabilization plan reached 1804 lines with nothing
// stopping it). Any file whose basename ends in "progress-log.md" is
// exempt -- those are expected to grow, that's their whole purpose.
//
// Scans the whole tree (not diff-scoped, unlike the edge-function auth-gate
// check) -- the point is that no tracked doc should ever exceed the limit,
// not just that no *new* violation should be introduced. As of the pass
// that added this script, every in-scope doc is already under the limit
// (the progress-log extraction happened in the same change), so a
// full-tree check has no grandfathered violations to work around.
//
// Usage: node scripts/check-kb-doc-size.mjs [--json]

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Two tiers, not one flat limit. The four master docs are foundational
// architecture documents (target architecture, candidate registers,
// verification matrices, blast-radius checklists) -- legitimately larger
// even with all historical narrative extracted (the optimization plan sat
// at 1155 lines immediately after its own progress-log extraction, none of
// it narrative). Phase/packet docs under codebase-optimization/ are meant
// to be scoped, bounded execution units -- 750 lines is the ceiling that
// actually would have caught the stabilization plan's 1804-line growth
// well before it got there.
const MASTER_MAX_LINES = 1600;
const PHASE_MAX_LINES = 750;

// The four master initiative docs (flat, at docs/kb/reference/ root) --
// checked against MASTER_MAX_LINES -- plus everything under the
// codebase-optimization/ phase-folder tree -- checked against
// PHASE_MAX_LINES. Not the whole of docs/kb/reference/ -- untracked
// reference docs (glossary, flow-patterns, etc.) have no packet/phase
// structure to bloat and aren't in scope for this specific guardrail.
const MASTER_DOCS = [
  "docs/kb/reference/codebase-optimization-plan-2026-08-28.md",
  "docs/kb/reference/rbac-v6-authorization-implementation-plan-2026-09-01.md",
  "docs/kb/reference/tenant-operating-model-data-architecture-plan-2026-09-02.md",
  "docs/kb/reference/client-health-activity-analytics-plan-2026-09-03.md",
];
const PHASE_TREE = "docs/kb/reference/codebase-optimization";

function listMarkdownFiles(absPath) {
  const stat = existsSync(absPath) ? statSync(absPath) : null;
  if (!stat) return [];
  if (stat.isFile()) return absPath.endsWith(".md") ? [absPath] : [];
  const out = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    const full = join(absPath, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// Files exempt from the size ceiling entirely -- not because they're
// allowed to bloat with narrative that belongs elsewhere, but because
// their length is structural, not narrative: each is an append-only
// historical register (progress-log.md files) or evidence log
// (l10-real-bugs-found.md, a point-in-time bug report with one section per
// distinct, independently-evidenced bug -- its size comes from genuinely
// separate findings, not repeated status prose that could move out).
const EXEMPT_BASENAMES = new Set(["l10-real-bugs-found.md"]);

function isExempt(absPath) {
  const name = basename(absPath).toLowerCase();
  return name.endsWith("progress-log.md") || EXEMPT_BASENAMES.has(name);
}

function checkGroup(paths, maxLines) {
  const files = paths.flatMap((t) => listMarkdownFiles(join(ROOT, t)));
  const violations = [];
  for (const file of files) {
    if (isExempt(file)) continue;
    const lineCount = readFileSync(file, "utf8").split("\n").length;
    if (lineCount > maxLines) {
      violations.push({ file: relative(ROOT, file).split("\\").join("/"), lineCount, maxLines });
    }
  }
  return { fileCount: files.length, violations };
}

function main() {
  const master = checkGroup(MASTER_DOCS, MASTER_MAX_LINES);
  const phase = checkGroup([PHASE_TREE], PHASE_MAX_LINES);
  const allViolations = [...master.violations, ...phase.violations];
  const totalFiles = master.fileCount + phase.fileCount;

  const args = process.argv.slice(2);
  if (args.includes("--json")) {
    console.log(JSON.stringify({
      filesScanned: totalFiles,
      masterMaxLines: MASTER_MAX_LINES,
      phaseMaxLines: PHASE_MAX_LINES,
      violations: allViolations,
    }, null, 2));
    return;
  }

  console.log(`check-kb-doc-size: ${totalFiles} files scanned (master docs <= ${MASTER_MAX_LINES} lines, phase/packet docs <= ${PHASE_MAX_LINES} lines), ${allViolations.length} over`);
  if (allViolations.length > 0) {
    console.log("");
    for (const v of allViolations) {
      console.log(`${v.file}: ${v.lineCount} lines (over by ${v.lineCount - v.maxLines}, limit ${v.maxLines})`);
    }
    console.log("");
    console.log("Extract completed/historical narrative into a sibling progress-log.md");
    console.log("(exempt from this check) rather than leaving it inline -- see");
    console.log("docs/kb/pinned/kb-hygiene.md -> 'Program/phase folder hierarchy'.");
    process.exitCode = 1;
  }
}

main();
