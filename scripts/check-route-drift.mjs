#!/usr/bin/env node
// Route/KB drift check (P0.6, docs/kb/reference/codebase-optimization-plan-2026-08-28.md).
//
// Compares the route count docs/kb/codebase-state/route-inventory-by-role.md
// claims in its Methodology line ("**NNN total**") against the live count
// from scripts/generate-route-manifest.mjs, and reports a clear mismatch
// instead of letting the doc silently drift (this is exactly how the 249
// vs 244 discrepancy the optimization plan cites was found in the first
// place -- nothing was automatically catching it).
//
// Deliberately informational, not wired into CI as a blocking gate yet: the
// doc is *already* known-stale as of P0.6 (249 claimed vs 244 actual, caused
// by /academy/team and four /compliance-audits routes retired without the
// doc being regenerated) and fixing that content is a Phase 1 KB-restoration
// task, not this script's job. Making this a hard CI gate before that fix
// lands would just make every unrelated PR fail. Run it manually, or wire
// it into CI once Phase 1 has reconciled the doc.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DOC = join(ROOT, "docs/kb/codebase-state/route-inventory-by-role.md");

function main() {
  const docText = readFileSync(DOC, "utf8");
  const claimMatch = docText.match(/\*\*(\d+) total\*\*/);
  if (!claimMatch) {
    console.error(`check-route-drift: couldn't find a "**N total**" claim in ${DOC}`);
    process.exit(2);
  }
  const claimed = Number(claimMatch[1]);

  const manifestJson = execFileSync(
    process.execPath,
    [join(ROOT, "scripts/generate-route-manifest.mjs"), "--json"],
    { encoding: "utf8" },
  );
  const manifest = JSON.parse(manifestJson);
  const actual = manifest.totalRoutes;

  console.log(`route-inventory-by-role.md claims: ${claimed} routes`);
  console.log(`live App.tsx (+ any route module) count: ${actual} routes`);

  if (claimed !== actual) {
    console.error(`\ncheck-route-drift: MISMATCH (${claimed} claimed vs ${actual} actual) -- the doc needs regenerating.`);
    process.exit(1);
  }
  console.log("\ncheck-route-drift: doc and live count agree.");
}

main();
