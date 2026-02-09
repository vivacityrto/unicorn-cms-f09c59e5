/**
 * Tests for Ask Viv Safety Pipeline
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  runAskVivSafetyPipeline,
  buildSafetyAuditEntry,
  extractExplainSafety,
  PIPELINE_VERSION,
  type SafetyMeta,
  type SafetyPipelineResult,
} from "./askVivSafetyPipeline.ts";
import { PHRASE_FILTER_VERSION } from "./phrase-filter.ts";
import { VALIDATOR_VERSION } from "./response-validator-v2.ts";

// Helper to create valid compliance response
function createValidComplianceResponse(): string {
  return `## Answer
- The client is currently in phase validation.

## Key records used
- Client record ABC-123

## Confidence
**Medium**

## Gaps
- Missing evidence for Standard 1.1

## Next safe actions
- Review linked documents.
- Escalate if needed.`;
}

// Helper to create valid knowledge response (with safe language)
function createValidKnowledgeResponse(): string {
  return `## Answer
- The procedure requires sign-off from the Function Lead.

## References
- Internal Procedure IP-001

## Confidence
**High**

## Gaps
- None.

## Next safe actions
- Follow the documented procedure.`;
}

// Helper to create response with banned phrase
function createBannedPhraseResponse(): string {
  return `## Answer
- You should submit this to ASQA for approval.

## Key records used
- None.

## Confidence
**High**

## Gaps
- None.

## Next safe actions
- Submit the application.`;
}

// Helper to create response missing headings
function createMissingHeadingsResponse(): string {
  return `## Answer
- The client status is active.

## Confidence
**Medium**`;
}

// Helper to create response with invalid confidence
function createInvalidConfidenceResponse(): string {
  return `## Answer
- The client is in progress.

## Key records used
- None.

## Confidence
**Very High**

## Gaps
- None.

## Next safe actions
- Continue monitoring.`;
}

// Default test meta
const defaultMeta: SafetyMeta = {
  mode: "compliance",
  gaps_in: [],
  records_accessed_in: [],
  request_id: "test-request-123",
  user_id: "test-user-456",
  tenant_id: "test-tenant-789",
};

// Mock repair function that returns a valid response
const mockRepairSuccess = async (_instruction: string): Promise<string> => {
  return createValidComplianceResponse();
};

// Mock repair function that returns still-invalid response
const mockRepairFail = async (_instruction: string): Promise<string> => {
  return createMissingHeadingsResponse();
};

// Mock repair function that introduces banned phrase
const mockRepairIntroducesBannedPhrase = async (_instruction: string): Promise<string> => {
  return createBannedPhraseResponse();
};

// Mock repair function that throws error
const mockRepairThrows = async (_instruction: string): Promise<string> => {
  throw new Error("LLM call failed");
};

// ============================================================
// Test: Valid response passes through unchanged
// ============================================================
Deno.test("Pipeline: valid response passes through unchanged", async () => {
  const validResponse = createValidComplianceResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: validResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  assertEquals(result.ok, true);
  assertEquals(result.final_text, validResponse);
  assertEquals(result.blocked, false);
  assertEquals(result.repaired, false);
  assertEquals(result.phrase_filter.blocked, false);
  assertEquals(result.validator.ok, true);
});

// ============================================================
// Test: Phrase filter blocks before validator runs
// ============================================================
Deno.test("Pipeline: phrase filter blocks before validator runs", async () => {
  const bannedResponse = createBannedPhraseResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: bannedResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  assertEquals(result.ok, false);
  assertEquals(result.blocked, true);
  assertEquals(result.repaired, false);
  assertEquals(result.phrase_filter.blocked, true);
  assertEquals(result.phrase_filter.matches.length > 0, true);
  // Validator should show it was skipped
  assertEquals(result.validator.errors.includes("Skipped - phrase filter blocked response"), true);
  // Final text should be phrase filter fallback
  assertEquals(result.final_text.includes("This request cannot be answered safely"), true);
});

// ============================================================
// Test: Missing headings triggers repair pass
// ============================================================
Deno.test("Pipeline: missing headings triggers repair pass", async () => {
  const missingHeadingsResponse = createMissingHeadingsResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: missingHeadingsResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  assertEquals(result.ok, true);
  assertEquals(result.blocked, false);
  assertEquals(result.repaired, true);
  assertEquals(result.validator.repaired, true);
  // Final text should be the repaired response
  assertEquals(result.final_text.includes("The client is currently in phase validation"), true);
});

// ============================================================
// Test: Repair still invalid returns fallback
// ============================================================
Deno.test("Pipeline: repair still invalid returns fallback", async () => {
  const missingHeadingsResponse = createMissingHeadingsResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: missingHeadingsResponse,
    meta: defaultMeta,
    repairOnce: mockRepairFail,
  });

  assertEquals(result.ok, false);
  assertEquals(result.blocked, false);
  assertEquals(result.repaired, true);
  assertEquals(result.validator.ok, false);
  // Final text should be validator fallback
  assertEquals(result.final_text.includes("Response could not be validated"), true);
});

// ============================================================
// Test: Repair introduces banned phrase - gets blocked
// ============================================================
Deno.test("Pipeline: repair introduces banned phrase - gets blocked", async () => {
  const missingHeadingsResponse = createMissingHeadingsResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: missingHeadingsResponse,
    meta: defaultMeta,
    repairOnce: mockRepairIntroducesBannedPhrase,
  });

  assertEquals(result.ok, false);
  assertEquals(result.blocked, true);
  assertEquals(result.repaired, true);
  assertEquals(result.phrase_filter.blocked, true);
  // Final text should be phrase filter fallback
  assertEquals(result.final_text.includes("This request cannot be answered safely"), true);
});

// ============================================================
// Test: Repair call throws error returns fallback
// ============================================================
Deno.test("Pipeline: repair call throws error returns fallback", async () => {
  const missingHeadingsResponse = createMissingHeadingsResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: missingHeadingsResponse,
    meta: defaultMeta,
    repairOnce: mockRepairThrows,
  });

  assertEquals(result.ok, false);
  assertEquals(result.blocked, false);
  assertEquals(result.repaired, false);
  assertEquals(result.validator.ok, false);
  // Final text should be validator fallback
  assertEquals(result.final_text.includes("Response could not be validated"), true);
});

// ============================================================
// Test: Knowledge mode uses correct headings
// ============================================================
Deno.test("Pipeline: knowledge mode uses correct headings", async () => {
  const validKnowledgeResponse = createValidKnowledgeResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "knowledge",
    raw_text: validKnowledgeResponse,
    meta: { ...defaultMeta, mode: "knowledge" },
    repairOnce: mockRepairSuccess,
  });

  assertEquals(result.ok, true);
  assertEquals(result.final_text, validKnowledgeResponse);
  assertEquals(result.blocked, false);
  assertEquals(result.repaired, false);
});

// ============================================================
// Test: Invalid confidence triggers repair
// ============================================================
Deno.test("Pipeline: invalid confidence triggers repair", async () => {
  const invalidConfidenceResponse = createInvalidConfidenceResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: invalidConfidenceResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  // Should have triggered repair due to invalid confidence
  assertEquals(result.repaired, true);
});

// ============================================================
// Test: Audit entry contains all required fields
// ============================================================
Deno.test("Pipeline: audit entry contains all required fields", async () => {
  const validResponse = createValidComplianceResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: validResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  const auditEntry = buildSafetyAuditEntry(result);

  assertExists(auditEntry.ask_viv_safety);
  assertExists(auditEntry.ask_viv_safety.phrase_filter);
  assertExists(auditEntry.ask_viv_safety.validator);
  assertExists(auditEntry.ask_viv_safety.pipeline);

  assertEquals(auditEntry.ask_viv_safety.phrase_filter.version, PHRASE_FILTER_VERSION);
  assertEquals(auditEntry.ask_viv_safety.validator.version, VALIDATOR_VERSION);
  assertEquals(auditEntry.ask_viv_safety.pipeline.version, PIPELINE_VERSION);
});

// ============================================================
// Test: Explain safety extraction works correctly
// ============================================================
Deno.test("Pipeline: explain safety extraction works correctly", async () => {
  const validResponse = createValidComplianceResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: validResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  const explainSafety = extractExplainSafety(result);

  assertExists(explainSafety.phrase_filter);
  assertExists(explainSafety.validator);
  assertEquals(explainSafety.phrase_filter.blocked, false);
  assertEquals(explainSafety.validator.ok, true);
});

// ============================================================
// Test: Blocked response audit entry includes matches
// ============================================================
Deno.test("Pipeline: blocked response audit entry includes matches", async () => {
  const bannedResponse = createBannedPhraseResponse();

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: bannedResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  const auditEntry = buildSafetyAuditEntry(result);

  assertEquals(auditEntry.ask_viv_safety.phrase_filter.blocked, true);
  assertEquals(auditEntry.ask_viv_safety.phrase_filter.matches.length > 0, true);
  assertEquals(auditEntry.ask_viv_safety.pipeline.blocked, true);
});

// ============================================================
// Test: Gaps alignment enforced
// ============================================================
Deno.test("Pipeline: gaps alignment enforced - gaps_in present but section is None", async () => {
  const responseWithNoneGaps = `## Answer
- The client is in progress.

## Key records used
- Record ABC-123

## Confidence
**Medium**

## Gaps
- None.

## Next safe actions
- Continue monitoring.`;

  const metaWithGaps: SafetyMeta = {
    ...defaultMeta,
    gaps_in: ["Missing evidence for Standard 1.1"],
  };

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: responseWithNoneGaps,
    meta: metaWithGaps,
    repairOnce: mockRepairSuccess,
  });

  // Should trigger repair because gaps_in is not empty but Gaps section is "None"
  assertEquals(result.repaired, true);
});

// ============================================================
// Test: Records alignment enforced
// ============================================================
Deno.test("Pipeline: records alignment enforced - records_accessed_in present but section is None", async () => {
  const responseWithNoneRecords = `## Answer
- The client is in progress.

## Key records used
- None.

## Confidence
**Medium**

## Gaps
- Missing evidence

## Next safe actions
- Continue monitoring.`;

  const metaWithRecords: SafetyMeta = {
    ...defaultMeta,
    records_accessed_in: [{ table: "clients", id: "123", label: "Test Client" }],
  };

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: responseWithNoneRecords,
    meta: metaWithRecords,
    repairOnce: mockRepairSuccess,
  });

  // Should trigger repair because records_accessed_in is not empty but Key records used is "None"
  assertEquals(result.repaired, true);
});

// ============================================================
// Test: Multiple banned phrases all captured
// ============================================================
Deno.test("Pipeline: multiple banned phrases all captured", async () => {
  const multipleViolationsResponse = `## Answer
- You should submit for approval and move to next phase.

## Key records used
- None.

## Confidence
**High**

## Gaps
- None.

## Next safe actions
- Submit and get approved.`;

  const result = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: multipleViolationsResponse,
    meta: defaultMeta,
    repairOnce: mockRepairSuccess,
  });

  assertEquals(result.blocked, true);
  // Should have multiple matches
  assertEquals(result.phrase_filter.matches.length >= 2, true);
});

// ============================================================
// Test: No repair attempted when phrase filter blocks
// ============================================================
Deno.test("Pipeline: no repair attempted when phrase filter blocks", async () => {
  let repairCalled = false;
  const trackingRepair = async (_instruction: string): Promise<string> => {
    repairCalled = true;
    return createValidComplianceResponse();
  };

  const bannedResponse = createBannedPhraseResponse();

  await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: bannedResponse,
    meta: defaultMeta,
    repairOnce: trackingRepair,
  });

  assertEquals(repairCalled, false);
});

// ============================================================
// Test: Only one repair attempt made
// ============================================================
Deno.test("Pipeline: only one repair attempt made", async () => {
  let repairCount = 0;
  const countingRepair = async (_instruction: string): Promise<string> => {
    repairCount++;
    return createMissingHeadingsResponse(); // Still invalid
  };

  const missingHeadingsResponse = createMissingHeadingsResponse();

  await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: missingHeadingsResponse,
    meta: defaultMeta,
    repairOnce: countingRepair,
  });

  assertEquals(repairCount, 1);
});
