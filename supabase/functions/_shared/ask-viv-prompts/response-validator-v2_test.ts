/**
 * Ask Viv Response Validator v2 Tests
 * 
 * Unit tests covering each validation rule and edge case.
 */

import { assertEquals, assertArrayIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateAskVivResponse,
  buildFallbackResponse,
  buildRepairPrompt,
  buildValidatorAuditEntry,
  validateWithRepair,
  RESPONSE_VALIDATOR_VERSION,
  type ValidationInputMeta,
} from "./response-validator-v2.ts";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const VALID_COMPLIANCE_RESPONSE = `## Answer
- Current phase: Assessment Preparation
- 3 overdue tasks identified
- Evidence gap in trainer records

## Key records used
- Package: Health Check 2024 (packages:123)
- Phase: Assessment Prep (documents_stages:456)

## Confidence
**High**

## Gaps
- Consult hours not tracked for this package

## Next safe actions
- Review overdue tasks in linked phase
- Request missing evidence from client`;

const VALID_KNOWLEDGE_RESPONSE = `## Answer
- KickStart package scope: initial compliance gap assessment
- Standard duration: 4-6 weeks

## References
- Vivacity Service Guide v2.3
- KickStart Scope Definition

## Confidence
**Medium**

## Gaps
- None.

## Next safe actions
- Review full scope document for details`;

const COMPLIANCE_META: ValidationInputMeta = {
  mode: "compliance",
  gaps_in: ["Consult hours not tracked"],
  records_accessed_in: [
    { table: "packages", id: "123", label: "Health Check 2024" },
    { table: "documents_stages", id: "456", label: "Assessment Prep" },
  ],
};

const KNOWLEDGE_META: ValidationInputMeta = {
  mode: "knowledge",
  gaps_in: [],
  records_accessed_in: [],
};

// =============================================================================
// STRUCTURE VALIDATION TESTS
// =============================================================================

Deno.test("validateAskVivResponse - valid compliance response passes", () => {
  const result = validateAskVivResponse(VALID_COMPLIANCE_RESPONSE, COMPLIANCE_META);
  assertEquals(result.ok, true);
  assertEquals(result.errors.length, 0);
  assertEquals(result.parsed?.confidence, "High");
});

Deno.test("validateAskVivResponse - valid knowledge response passes", () => {
  const result = validateAskVivResponse(VALID_KNOWLEDGE_RESPONSE, KNOWLEDGE_META);
  assertEquals(result.ok, true);
  assertEquals(result.errors.length, 0);
  assertEquals(result.parsed?.confidence, "Medium");
});

Deno.test("validateAskVivResponse - missing heading triggers error", () => {
  const response = `## Answer
- Some answer

## Confidence
**High**

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, COMPLIANCE_META);
  assertEquals(result.ok, false);
  assertArrayIncludes(result.errors, ["Missing heading: Key records used"]);
});

Deno.test("validateAskVivResponse - incorrect heading order triggers error", () => {
  const response = `## Confidence
**High**

## Answer
- Some answer

## Key records used
- None.

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    ...COMPLIANCE_META,
    records_accessed_in: [],
  });
  assertEquals(result.ok, false);
  const hasOrderError = result.errors.some(e => e.includes("order"));
  assertEquals(hasOrderError, true);
});

Deno.test("validateAskVivResponse - duplicate heading triggers error", () => {
  const response = `## Answer
- First answer

## Answer
- Second answer

## Key records used
- None.

## Confidence
**High**

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    ...COMPLIANCE_META,
    records_accessed_in: [],
  });
  assertEquals(result.ok, false);
  const hasDuplicateError = result.errors.some(e => e.includes("Duplicate"));
  assertEquals(hasDuplicateError, true);
});

// =============================================================================
// CONFIDENCE VALIDATION TESTS
// =============================================================================

Deno.test("validateAskVivResponse - 'High confidence' (extra words) triggers error", () => {
  const response = `## Answer
- Some answer

## Key records used
- None.

## Confidence
High confidence in this assessment

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    ...COMPLIANCE_META,
    records_accessed_in: [],
  });
  assertEquals(result.ok, false);
  const hasConfidenceError = result.errors.some(e => e.includes("Confidence"));
  assertEquals(hasConfidenceError, true);
});

Deno.test("validateAskVivResponse - confidence 'Low' passes", () => {
  const response = `## Answer
- Some answer

## Key records used
- None.

## Confidence
**Low**

## Gaps
- None.

## Next safe actions
- None.`;
  
  // Use meta with no gaps_in and no records_accessed_in so None is valid
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: [],
    records_accessed_in: [],
  });
  assertEquals(result.ok, true);
  assertEquals(result.parsed?.confidence, "Low");
});

Deno.test("validateAskVivResponse - numeric confidence triggers error", () => {
  const response = `## Answer
- Some answer

## Key records used
- None.

## Confidence
85%

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    ...COMPLIANCE_META,
    records_accessed_in: [],
  });
  assertEquals(result.ok, false);
  const hasConfidenceError = result.errors.some(e => e.includes("Confidence"));
  assertEquals(hasConfidenceError, true);
});

// =============================================================================
// GAPS ALIGNMENT TESTS
// =============================================================================

Deno.test("validateAskVivResponse - gaps_in present but Gaps='None' triggers error", () => {
  const response = `## Answer
- Some answer

## Key records used
- Package: Test (packages:1)

## Confidence
**Medium**

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: ["Missing trainer qualification records"],
    records_accessed_in: [{ table: "packages", id: "1" }],
  });
  assertEquals(result.ok, false);
  const hasGapsError = result.errors.some(e => e.includes("Gaps section must not be"));
  assertEquals(hasGapsError, true);
});

Deno.test("validateAskVivResponse - gaps_in empty and Gaps='None' passes", () => {
  const response = `## Answer
- Some answer

## Key records used
- None.

## Confidence
**High**

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: [],
    records_accessed_in: [],
  });
  assertEquals(result.ok, true);
});

// =============================================================================
// RECORDS ALIGNMENT TESTS (COMPLIANCE MODE)
// =============================================================================

Deno.test("validateAskVivResponse - records accessed but Key records='None' triggers error", () => {
  const response = `## Answer
- Some answer

## Key records used
- None.

## Confidence
**Medium**

## Gaps
- Some gap identified

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: ["Some gap"],
    records_accessed_in: [{ table: "packages", id: "123" }],
  });
  assertEquals(result.ok, false);
  const hasRecordsError = result.errors.some(e => e.includes("Key records used must not be"));
  assertEquals(hasRecordsError, true);
});

// =============================================================================
// MINIMUM CONTENT TESTS
// =============================================================================

Deno.test("validateAskVivResponse - empty Answer triggers error", () => {
  const response = `## Answer

## Key records used
- None.

## Confidence
**Low**

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    ...COMPLIANCE_META,
    records_accessed_in: [],
  });
  assertEquals(result.ok, false);
  const hasAnswerError = result.errors.some(e => e.includes("Answer must have"));
  assertEquals(hasAnswerError, true);
});

Deno.test("validateAskVivResponse - Answer with 'None' passes", () => {
  const response = `## Answer
- None.

## Key records used
- None.

## Confidence
**Low**

## Gaps
- None.

## Next safe actions
- None.`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: [],
    records_accessed_in: [],
  });
  assertEquals(result.ok, true);
});

// =============================================================================
// FALLBACK RESPONSE TESTS
// =============================================================================

Deno.test("buildFallbackResponse - compliance mode returns correct template", () => {
  const fallback = buildFallbackResponse({ mode: "compliance", gaps_in: [], records_accessed_in: [] });
  assertEquals(fallback.includes("## Answer"), true);
  assertEquals(fallback.includes("## Key records used"), true);
  assertEquals(fallback.includes("CSC lead"), true);
  assertEquals(fallback.includes("**Low**"), true);
});

Deno.test("buildFallbackResponse - knowledge mode returns correct template", () => {
  const fallback = buildFallbackResponse({ mode: "knowledge", gaps_in: [], records_accessed_in: [] });
  assertEquals(fallback.includes("## Answer"), true);
  assertEquals(fallback.includes("## References"), true);
  assertEquals(fallback.includes("Function Lead"), true);
  assertEquals(fallback.includes("**Low**"), true);
});

// =============================================================================
// REPAIR PROMPT TESTS
// =============================================================================

Deno.test("buildRepairPrompt - includes errors and original response", () => {
  const prompt = buildRepairPrompt(
    "Some broken response",
    ["Missing heading: Gaps", "Confidence invalid"],
    COMPLIANCE_META
  );
  
  assertEquals(prompt.includes("Missing heading: Gaps"), true);
  assertEquals(prompt.includes("Confidence invalid"), true);
  assertEquals(prompt.includes("Some broken response"), true);
  assertEquals(prompt.includes("## Answer"), true);
});

// =============================================================================
// AUDIT ENTRY TESTS
// =============================================================================

Deno.test("buildValidatorAuditEntry - success entry has correct structure", () => {
  const entry = buildValidatorAuditEntry({ ok: true, errors: [] }, false);
  
  assertEquals(entry.response_validator.ok, true);
  assertEquals(entry.response_validator.repaired, false);
  assertEquals(entry.response_validator.validator_version, RESPONSE_VALIDATOR_VERSION);
  assertEquals(entry.response_validator.errors, undefined);
});

Deno.test("buildValidatorAuditEntry - failure entry includes errors", () => {
  const entry = buildValidatorAuditEntry(
    { ok: false, errors: ["Missing heading: Gaps"] },
    true
  );
  
  assertEquals(entry.response_validator.ok, false);
  assertEquals(entry.response_validator.repaired, true);
  assertEquals(entry.response_validator.errors?.length, 1);
});

// =============================================================================
// INTEGRATION TESTS - validateWithRepair
// =============================================================================

Deno.test("validateWithRepair - valid response passes without repair", async () => {
  const { response, result, auditEntry } = await validateWithRepair(
    VALID_COMPLIANCE_RESPONSE,
    COMPLIANCE_META
  );
  
  assertEquals(result.ok, true);
  assertEquals(auditEntry.response_validator.repaired, false);
  assertEquals(response, VALID_COMPLIANCE_RESPONSE);
});

Deno.test("validateWithRepair - invalid response without repairFn returns fallback", async () => {
  const brokenResponse = "This is not valid at all.";
  
  const { response, result, auditEntry } = await validateWithRepair(
    brokenResponse,
    COMPLIANCE_META
  );
  
  assertEquals(result.ok, false);
  assertEquals(response.includes("CSC lead"), true); // Fallback content
});

Deno.test("validateWithRepair - successful repair returns repaired response", async () => {
  const brokenResponse = "This is broken.";
  
  // Mock repair function that returns valid response
  const repairFn = async (_prompt: string) => VALID_COMPLIANCE_RESPONSE;
  
  const { response, result, auditEntry } = await validateWithRepair(
    brokenResponse,
    COMPLIANCE_META,
    repairFn
  );
  
  assertEquals(result.ok, true);
  assertEquals(auditEntry.response_validator.repaired, true);
  assertEquals(response, VALID_COMPLIANCE_RESPONSE);
});

Deno.test("validateWithRepair - failed repair returns fallback", async () => {
  const brokenResponse = "This is broken.";
  
  // Mock repair function that returns still-broken response
  const repairFn = async (_prompt: string) => "Still broken after repair.";
  
  const { response, result, auditEntry } = await validateWithRepair(
    brokenResponse,
    COMPLIANCE_META,
    repairFn
  );
  
  assertEquals(result.ok, false);
  assertEquals(response.includes("CSC lead"), true); // Fallback
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

Deno.test("validateAskVivResponse - handles bold heading format", () => {
  const response = `**Answer**
- Some answer

**Key records used**
- None.

**Confidence**
**High**

**Gaps**
- None.

**Next safe actions**
- None.`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: [],
    records_accessed_in: [],
  });
  assertEquals(result.ok, true);
});

Deno.test("validateAskVivResponse - handles asterisk bullets", () => {
  const response = `## Answer
* Some answer with asterisk

## Key records used
* None.

## Confidence
**Medium**

## Gaps
* None.

## Next safe actions
* Check something`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: [],
    records_accessed_in: [],
  });
  assertEquals(result.ok, true);
});

Deno.test("validateAskVivResponse - 'risk indicator' passes (allowed phrase)", () => {
  const response = `## Answer
- Risk indicator identified for missing evidence

## Key records used
- None.

## Confidence
**Medium**

## Gaps
- Gap identified in trainer records

## Next safe actions
- Insufficient evidence to confirm compliance status`;
  
  const result = validateAskVivResponse(response, {
    mode: "compliance",
    gaps_in: ["Gap in trainer records"],
    records_accessed_in: [],
  });
  assertEquals(result.ok, true);
});
