import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyPortfolioBurnAvailability,
  resolvePortfolioBurnStatus,
} from "./portfolio-forecast-status.ts";

const portfolioFactsSource = readFileSync(new URL("./portfolio-facts.ts", import.meta.url), "utf8");

describe("portfolio burn forecast availability", () => {
  it("returns unavailable when the source query failed", () => {
    assert.equal(
      resolvePortfolioBurnStatus(7, [{ tenant_id: 7, burn_risk_status: "critical" }], "unavailable"),
      "unavailable",
    );
  });

  it("returns unavailable when no readable source row exists", () => {
    assert.equal(resolvePortfolioBurnStatus(7, [], "reported"), "unavailable");
    assert.equal(
      resolvePortfolioBurnStatus(7, [{ tenant_id: 7, burn_risk_status: null }], "reported"),
      "unavailable",
    );
    assert.equal(
      resolvePortfolioBurnStatus(7, [{ tenant_id: 7, burn_risk_status: "not-a-status" }], "reported"),
      "unavailable",
    );
  });

  it("preserves a readable status and chooses the most severe duplicate", () => {
    const sourceRows = [
      { tenant_id: 7, burn_risk_status: "on_track" },
      { tenant_id: 7, burn_risk_status: "critical" },
      { tenant_id: 7, burn_risk_status: "accelerated" },
      { tenant_id: 8, burn_risk_status: "critical" },
    ];

    assert.equal(resolvePortfolioBurnStatus(7, sourceRows, "reported"), "critical");
    assert.equal(resolvePortfolioBurnStatus(8, sourceRows, "reported"), "critical");
  });

  it("changes only the forecast status while preserving the ranked row", () => {
    const rows = [
      { tenant_id: 7, tenant_name: "Alpha", burn_risk_status: "normal" },
      { tenant_id: 8, tenant_name: "Beta", burn_risk_status: "normal" },
    ];

    assert.deepEqual(
      applyPortfolioBurnAvailability(rows, [{ tenant_id: 7, burn_risk_status: "on_track" }], "reported"),
      [
        { tenant_id: 7, tenant_name: "Alpha", burn_risk_status: "on_track" },
        { tenant_id: 8, tenant_name: "Beta", burn_risk_status: "unavailable" },
      ],
    );
  });

  it("wires the source check to the same ranked tenant ids and records a caller-safe reason", () => {
    assert.match(portfolioFactsSource, /\.from\("tenant_package_burn_forecast"\)/);
    assert.match(portfolioFactsSource, /\.in\("tenant_id", tenantIds\)/);
    assert.match(portfolioFactsSource, /burn_risk_status_reason/);
    assert.match(portfolioFactsSource, /source_unavailable/);
  });
});
