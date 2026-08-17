import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
assert.match(source, /requireCaller\(req, supabase, \{[\s\S]*?FeatureKeys\.staffInternal/);
assert.match(source, /corsHeaders\(req\)/);
assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/);
assert.match(source, /created_by: caller\.user\.id/);
console.log("record-completed-audit auth checks passed");
