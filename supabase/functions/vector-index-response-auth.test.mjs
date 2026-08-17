import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const functions = ["vector-index-rebuild", "vector-index-remove", "vector-index-update"];
for (const name of functions) {
  const source = readFileSync(new URL(`./${name}/index.ts`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /json(?:Ok|Error)\((?!req[,\)])/,
    `${name} must pass request context to response helpers`);
}

const updateSource = readFileSync(new URL("./vector-index-update/index.ts", import.meta.url), "utf8");
assert.match(updateSource, /requireCallerByUserId\(supabase, user, \{[\s\S]*?featureKey: FeatureKeys\.adminVector/,
  "vector-index-update must require admin.vector.manage");

console.log("vector index response/auth checks passed");
