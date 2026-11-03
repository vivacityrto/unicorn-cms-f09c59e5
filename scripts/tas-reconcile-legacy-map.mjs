#!/usr/bin/env node
// Reconciles the TAS intake catalogue with the 113 legacy survey fields (L001 to L113).
// Fails (exit 1) on any problem. The catalogue holds placeholder wording only (decision D19).
// Usage: node scripts/tas-reconcile-legacy-map.mjs [--json]
// Needs Node with TypeScript type stripping (Node 22.18 or later).
import { CATALOGUE } from "../src/lib/tas/intake/catalogue.ts";
import { EXPECTED, reconcileCatalogue } from "../src/lib/tas/intake/reconcile.ts";

const problems = reconcileCatalogue(CATALOGUE);
const summary = {
  questions: CATALOGUE.length,
  legacyFieldsMapped: CATALOGUE.reduce((n, e) => n + e.legacyIds.length, 0),
  starterQuestions: CATALOGUE.filter((e) => e.topic !== null).length,
  expected: EXPECTED,
  problems,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summary, null, 2));
} else if (problems.length === 0) {
  console.log(
    `tas-reconcile: OK. ${summary.questions} questions, ${summary.legacyFieldsMapped} legacy fields each mapped once, ${summary.starterQuestions} starter questions.`,
  );
} else {
  console.error(`tas-reconcile: ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
}
process.exit(problems.length === 0 ? 0 : 1);
