#!/usr/bin/env node
// Packet status <-> audit-entry correlation guardrail (Phase 2.6
// program-index restructure, 2026-09-08).
//
// If a packet/phase-doc's `**Audit entry:**` header field is written as a
// real markdown link, check-kb-links.mjs already fails the build when that
// link's target doesn't exist -- that part needs no new code. The actual
// gap this closes: nothing stops someone flipping a packet's `**Status:**`
// to done/completed/closed/superseded while leaving `**Audit entry:**` at
// its blank `none yet` placeholder -- no broken link to catch, no audit
// trail either.
//
// Diff-scoped, same idiom as check-edge-function-auth-gate.sh: a coarse
// presence check against the PR's own diff, not a semantic verifier, with
// an explicit same-file opt-out for legitimate exceptions. Deliberately
// not gated on branch naming -- a PR doesn't always map 1:1 to one packet
// (PR #1012 closed all seven P4-D items in one PR), so branch-name parsing
// would produce false failures.
//
// For any docs/kb/reference/codebase-optimization/** (or one of the four
// master docs) changed in this PR whose diff adds a `**Status:**` line with
// a closed-state value, require either:
//   (a) at least one new file under docs/audit-log/entries/ in the same
//       diff, or
//   (b) that file's own `**Audit entry:**` field (current content, not
//       just the diff) reads "none needed - <reason>" rather than the
//       blank "none yet" placeholder.
//
// Usage: node scripts/check-packet-status-audit-gate.mjs [base-ref]

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const IN_SCOPE_PATTERNS = [
  /^docs\/kb\/reference\/codebase-optimization-plan-2026-08-28\.md$/,
  /^docs\/kb\/reference\/rbac-v6-authorization-implementation-plan-2026-09-01\.md$/,
  /^docs\/kb\/reference\/tenant-operating-model-data-architecture-plan-2026-09-02\.md$/,
  /^docs\/kb\/reference\/client-health-activity-analytics-plan-2026-09-03\.md$/,
  /^docs\/kb\/reference\/codebase-optimization\/.*\.md$/,
];

const CLOSED_STATUS_RE = /^\+\s*>?\s*\*\*Status:\*\*\s*(done|completed|closed|superseded)\b/im;
const AUDIT_ENTRY_NONE_NEEDED_RE = /\*\*Audit entry:\*\*\s*none needed\b/i;

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function main() {
  const baseRef = process.argv[2] || process.env.BASE_SHA || "origin/main";

  try {
    git(["rev-parse", "--verify", baseRef]);
  } catch {
    console.log(`packet-status-audit-gate: base ref '${baseRef}' not found locally, skipping (nothing to diff against)`);
    return;
  }

  // --diff-filter=d excludes deletions, keeps added/copied/modified/renamed
  // (a renamed-and-status-flipped file must still be checked).
  const changedFilesRaw = git(["diff", "--name-only", "--diff-filter=d", `${baseRef}...HEAD`]);
  const changedFiles = changedFilesRaw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const inScopeFiles = changedFiles.filter((f) => IN_SCOPE_PATTERNS.some((re) => re.test(f)));

  if (inScopeFiles.length === 0) {
    console.log("packet-status-audit-gate: no in-scope packet/phase docs changed");
    return;
  }

  const newAuditEntries = changedFilesRaw
    .split("\n")
    .filter((f) => f.trim())
    .filter((f) => /^docs\/audit-log\/entries\/.*\.md$/.test(f.trim()));
  // Only additions count as "a new audit entry landed in this PR" -- check
  // status against --diff-filter=A separately since the list above merged
  // filters. Re-derive precisely:
  const addedFiles = git(["diff", "--name-only", "--diff-filter=A", `${baseRef}...HEAD`])
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const hasNewAuditEntry = addedFiles.some((f) => /^docs\/audit-log\/entries\/.*\.md$/.test(f));

  const failures = [];

  for (const file of inScopeFiles) {
    const diff = git(["diff", `${baseRef}...HEAD`, "--", file]);
    if (!CLOSED_STATUS_RE.test(diff)) continue; // no status transition to a closed state in this file

    if (hasNewAuditEntry) continue; // satisfied at the PR level

    const absPath = join(ROOT, file);
    if (!existsSync(absPath)) continue; // shouldn't happen given diff-filter=d, but guard anyway
    const content = readFileSync(absPath, "utf8");
    if (AUDIT_ENTRY_NONE_NEEDED_RE.test(content)) continue; // explicit opt-out present

    failures.push(file);
  }

  if (failures.length > 0) {
    console.log("packet-status-audit-gate: FAILED");
    console.log("");
    for (const f of failures) {
      console.log(`${f}: **Status:** changed to a closed state, but no new file under`);
      console.log(`  docs/audit-log/entries/ was added in this PR, and this file's own`);
      console.log(`  **Audit entry:** field doesn't read "none needed - <reason>".`);
    }
    console.log("");
    console.log("Either add the audit-log entry this closure requires (schema/RLS/");
    console.log("trigger/security/cron/operational changes per AGENTS.md), or -- if this");
    console.log("packet's closure genuinely needs none -- update its own");
    console.log('**Audit entry:** field to read "none needed - <reason>" instead of the');
    console.log('blank "none yet" placeholder.');
    process.exitCode = 1;
    return;
  }

  console.log(`packet-status-audit-gate: passed (${inScopeFiles.length} in-scope file(s) checked)`);
}

main();
