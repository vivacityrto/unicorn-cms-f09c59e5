import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("workload forecast reports input/output counts and rejects partial output", () => {
  assert.match(source, /staffUsersError/);
  assert.match(source, /packagesError/);
  assert.match(source, /workloadSnapshots\.length !== staffInputCount/);
  assert.match(source, /burnForecasts\.length !== packageInputCount/);
  assert.match(source, /status: 503/);
  assert.match(source, /output_health:/);
});
