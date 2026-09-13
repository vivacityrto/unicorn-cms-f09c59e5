import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

test("compare_clients uses the shared burn availability adapter", () => {
  assert.match(source, /applyPortfolioBurnAvailability/);
  assert.match(source, /portfolio-forecast-status\.ts/);
  assert.match(source, /\.from\("tenant_package_burn_forecast"\)/);
  assert.match(source, /\.select\("tenant_id, burn_risk_status"\)/);
  assert.match(source, /\.in\("tenant_id", attention\.map\(\(row\) => row\.tenant_id\)\)/);
  assert.match(source, /burnErr \? "unavailable" : "reported"/);
});

test("compare_clients exposes a caller-safe reason for unavailable burn status", () => {
  assert.match(source, /burn_risk_status_reason/);
  assert.match(source, /"source_unavailable"/);
  assert.match(source, /const comparison = attentionWithBurn\.map/);
});

test("compare_clients keeps the ranked-view query as the visibility gate", () => {
  const compareBlock = source.slice(source.indexOf('if (name === "compare_clients")'));
  assert.match(compareBlock, /\.from\("v_dashboard_attention_ranked"\)/);
  assert.match(compareBlock, /const attention = \(attentionRows \?\? \[\]\) as AttentionRankedRow\[\]/);
  assert.match(compareBlock, /\.in\("tenant_id", attention\.map\(\(row\) => row\.tenant_id\)\)/);
});
