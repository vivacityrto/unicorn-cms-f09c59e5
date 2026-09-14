import test from "node:test";
import assert from "node:assert/strict";

import { validateEvidenceRecord } from "./validate-client-health-evidence.mjs";

const validRecord = {
  evidence_id: "synthetic-001",
  report_id: "synthetic-client-health-2026-09",
  claim_type: "operational_observation",
  subject_grain: "client_service_engagement",
  scope: { package: "synthetic-delivery", lifecycle: "delivery", cohort: "synthetic-mid-market" },
  observation_window: {
    starts_at: "2026-09-01T00:00:00Z",
    ends_at: "2026-09-07T23:59:59Z",
    timezone: "UTC",
  },
  claim: "A planned quiet period has an owned next checkpoint.",
  operational_context: "Synthetic example for handback validation.",
  ownership: "shared",
  source: {
    class: "synthetic_example",
    reference: "H0.4 synthetic example 1",
    observed_at: "2026-09-08T00:00:00Z",
    effective_at: "2026-09-01T00:00:00Z",
    as_of: "2026-09-14T00:00:00Z",
  },
  quality: {
    freshness: "current",
    coverage: "single_case",
    confidence: "low",
    limitations: "Synthetic only; no policy inference.",
  },
  classification: "observation",
  sensitivity: "public_process",
  redaction: "synthetic",
  review: { status: "unreviewed", reviewer: "packet owner", reviewed_at: "2026-09-14T00:00:00Z" },
  contradictions: [],
  supersedes: [],
  implementation_use: "blocked_pending_policy",
};

test("accepts a complete synthetic record while keeping implementation blocked", () => {
  assert.deepEqual(validateEvidenceRecord(validRecord), []);
});

test("rejects missing provenance, uncertainty, and policy-blocking fields", () => {
  const invalid = structuredClone(validRecord);
  delete invalid.source;
  delete invalid.quality;
  invalid.implementation_use = "approved";
  const errors = validateEvidenceRecord(invalid);
  assert.ok(errors.some((error) => error.includes("record.source must be an object")));
  assert.ok(errors.some((error) => error.includes("record.quality must be an object")));
  assert.ok(errors.some((error) => error.includes("blocked_pending_policy")));
});

test("rejects raw identifiers and unsafe consultant redaction", () => {
  const invalid = structuredClone(validRecord);
  invalid.email = "client@example.test";
  invalid.source.class = "consultant_experience";
  invalid.redaction = "not_applicable";
  const errors = validateEvidenceRecord(invalid);
  assert.ok(errors.some((error) => error.includes("email is not allowed")));
  assert.ok(errors.some((error) => error.includes("identifier- or credential-shaped text")));
  assert.ok(errors.some((error) => error.includes("requires an explicit safe redaction value")));
});

test("rejects non-UTC timestamps and unsupported enum values", () => {
  const invalid = structuredClone(validRecord);
  invalid.observation_window.starts_at = "2026-09-01";
  invalid.scope.lifecycle = "pilot";
  const errors = validateEvidenceRecord(invalid);
  assert.ok(errors.some((error) => error.includes("explicit UTC ISO timestamp")));
  assert.ok(errors.some((error) => error.includes("unsupported value")));
});

test("rejects unrecognized fields instead of silently widening the contract", () => {
  const invalid = structuredClone(validRecord);
  invalid.unknown_policy = "healthy";
  invalid.source.unexpected = "should not be retained";
  const errors = validateEvidenceRecord(invalid);
  assert.ok(errors.some((error) => error.includes("record.unknown_policy is not a recognized evidence field")));
  assert.ok(errors.some((error) => error.includes("record.source.unexpected is not a recognized evidence field")));
});
