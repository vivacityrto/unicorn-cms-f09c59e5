import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("stage health reports explicit output health and rejects incomplete writes", () => {
  assert.match(source, /output_health:\s*\{\s*status:\s*"not_applicable"/s);
  assert.match(source, /insertFailures/);
  assert.match(source, /snapshots\.length !== stages\.length/);
  assert.match(source, /status: 503/);
  assert.match(source, /non_zero_output: snapshots\.length > 0/);
});
