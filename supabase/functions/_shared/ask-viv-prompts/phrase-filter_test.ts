/**
 * Ask Viv Phrase Filter Tests
 * 
 * Unit tests for banned phrase detection across all categories.
 */

import { assertEquals, assertArrayIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectBannedPhrases,
  buildBlockedResponse,
  buildAuditEntry,
  applyPhraseFilter,
  PHRASE_FILTER_VERSION,
} from "./phrase-filter.ts";

// =============================================================================
// REGULATORY ACTION CATEGORY TESTS
// =============================================================================

Deno.test("detectBannedPhrases - blocks 'submit'", () => {
  const result = detectBannedPhrases("You should submit this to ASQA.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["submit"]);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
});

Deno.test("detectBannedPhrases - blocks 'submission'", () => {
  const result = detectBannedPhrases("Prepare the submission now.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["submission"]);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
});

Deno.test("detectBannedPhrases - blocks 'lodge'", () => {
  const result = detectBannedPhrases("Lodge the application immediately.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["Lodge"]);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
});

Deno.test("detectBannedPhrases - blocks 'ASQA will'", () => {
  const result = detectBannedPhrases("ASQA will approve this within 30 days.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
});

Deno.test("detectBannedPhrases - blocks 'approved'", () => {
  const result = detectBannedPhrases("Your application is approved.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["approved"]);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
});

Deno.test("detectBannedPhrases - blocks 'guarantee'", () => {
  const result = detectBannedPhrases("We guarantee success.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["guarantee"]);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
});

// =============================================================================
// PHASE BYPASS CATEGORY TESTS
// =============================================================================

Deno.test("detectBannedPhrases - blocks 'move to next phase'", () => {
  const result = detectBannedPhrases("You can move to next phase now.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.categories, ["phase_bypass"]);
});

Deno.test("detectBannedPhrases - blocks 'progress to'", () => {
  const result = detectBannedPhrases("Progress to stage 3 immediately.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.categories, ["phase_bypass"]);
});

Deno.test("detectBannedPhrases - blocks 'bypass'", () => {
  const result = detectBannedPhrases("Bypass the approval step.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["Bypass"]);
  assertArrayIncludes(result.categories, ["phase_bypass"]);
});

Deno.test("detectBannedPhrases - blocks 'skip'", () => {
  const result = detectBannedPhrases("Skip the review stage.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["Skip"]);
  assertArrayIncludes(result.categories, ["phase_bypass"]);
});

Deno.test("detectBannedPhrases - blocks 'override'", () => {
  const result = detectBannedPhrases("Override the system controls.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["Override"]);
  assertArrayIncludes(result.categories, ["phase_bypass"]);
});

// =============================================================================
// DETERMINISTIC COMPLIANCE CATEGORY TESTS
// =============================================================================

Deno.test("detectBannedPhrases - blocks 'compliant'", () => {
  const result = detectBannedPhrases("This is fully compliant.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.matches, ["compliant"]);
  assertArrayIncludes(result.categories, ["deterministic_compliance"]);
});

Deno.test("detectBannedPhrases - blocks 'non-compliant'", () => {
  const result = detectBannedPhrases("The RTO is non-compliant.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.categories, ["deterministic_compliance"]);
});

Deno.test("detectBannedPhrases - blocks 'meets the standard'", () => {
  const result = detectBannedPhrases("This meets the standard.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.categories, ["deterministic_compliance"]);
});

Deno.test("detectBannedPhrases - blocks 'does not meet the standard'", () => {
  const result = detectBannedPhrases("This does not meet the standard.");
  assertEquals(result.blocked, true);
  assertArrayIncludes(result.categories, ["deterministic_compliance"]);
});

// =============================================================================
// SAFE CONTENT TESTS (SHOULD PASS)
// =============================================================================

Deno.test("detectBannedPhrases - allows 'risk indicator'", () => {
  const result = detectBannedPhrases("There is a risk indicator due to missing evidence.");
  assertEquals(result.blocked, false);
  assertEquals(result.matches.length, 0);
});

Deno.test("detectBannedPhrases - allows 'gap identified'", () => {
  const result = detectBannedPhrases("A gap identified in the documentation.");
  assertEquals(result.blocked, false);
  assertEquals(result.matches.length, 0);
});

Deno.test("detectBannedPhrases - allows 'insufficient evidence to confirm'", () => {
  const result = detectBannedPhrases("There is insufficient evidence to confirm alignment.");
  assertEquals(result.blocked, false);
  assertEquals(result.matches.length, 0);
});

Deno.test("detectBannedPhrases - allows safe compliance language", () => {
  const result = detectBannedPhrases(
    "## Answer\n- Current phase: Assessment Preparation\n- 3 overdue tasks identified\n\n## Confidence\n**Medium**"
  );
  assertEquals(result.blocked, false);
  assertEquals(result.matches.length, 0);
});

// =============================================================================
// MULTIPLE MATCH TESTS
// =============================================================================

Deno.test("detectBannedPhrases - captures multiple matches across categories", () => {
  const result = detectBannedPhrases(
    "Submit to ASQA and move to next phase as you are compliant."
  );
  assertEquals(result.blocked, true);
  assertEquals(result.categories.length, 3);
  assertArrayIncludes(result.categories, ["regulatory_action"]);
  assertArrayIncludes(result.categories, ["phase_bypass"]);
  assertArrayIncludes(result.categories, ["deterministic_compliance"]);
});

Deno.test("detectBannedPhrases - does not short-circuit on first match", () => {
  const result = detectBannedPhrases("Submit the lodge application for approval.");
  assertEquals(result.blocked, true);
  // Should capture multiple matches, not stop at first
  assertEquals(result.matches.length >= 2, true);
});

// =============================================================================
// FALLBACK RESPONSE TESTS
// =============================================================================

Deno.test("buildBlockedResponse - returns compliance fallback template", () => {
  const response = buildBlockedResponse("compliance", ["submit"]);
  assertEquals(response.includes("## Answer"), true);
  assertEquals(response.includes("CSC lead"), true);
  assertEquals(response.includes("Confidence"), true);
  assertEquals(response.includes("Low"), true);
});

Deno.test("buildBlockedResponse - returns knowledge fallback template", () => {
  const response = buildBlockedResponse("knowledge", ["compliant"]);
  assertEquals(response.includes("## Answer"), true);
  assertEquals(response.includes("Function Lead"), true);
  assertEquals(response.includes("Confidence"), true);
  assertEquals(response.includes("Low"), true);
});

// =============================================================================
// AUDIT ENTRY TESTS
// =============================================================================

Deno.test("buildAuditEntry - creates correct structure", () => {
  const filterResult = {
    blocked: true,
    matches: ["submit", "compliant"],
    categories: ["regulatory_action", "deterministic_compliance"] as ("regulatory_action" | "phase_bypass" | "deterministic_compliance")[],
  };
  
  const auditEntry = buildAuditEntry(filterResult);
  
  assertEquals(auditEntry.phrase_filter.blocked, true);
  assertEquals(auditEntry.phrase_filter.matches.length, 2);
  assertEquals(auditEntry.phrase_filter.filter_version, PHRASE_FILTER_VERSION);
});

// =============================================================================
// INTEGRATION FUNCTION TESTS
// =============================================================================

Deno.test("applyPhraseFilter - blocks unsafe response and returns fallback", () => {
  const unsafeResponse = "You should submit this to ASQA as it is compliant.";
  const result = applyPhraseFilter(unsafeResponse, "compliance");
  
  assertEquals(result.blocked, true);
  assertEquals(result.response.includes("cannot be answered safely"), true);
  assertEquals(result.auditEntry !== null, true);
  assertEquals(result.auditEntry?.phrase_filter.blocked, true);
});

Deno.test("applyPhraseFilter - passes safe response unchanged", () => {
  const safeResponse = "## Answer\n- Risk indicator identified\n- Gap in evidence\n\n## Confidence\n**Medium**";
  const result = applyPhraseFilter(safeResponse, "compliance");
  
  assertEquals(result.blocked, false);
  assertEquals(result.response, safeResponse);
  assertEquals(result.auditEntry, null);
});

Deno.test("applyPhraseFilter - uses correct fallback for knowledge mode", () => {
  const unsafeResponse = "This is fully compliant with standards.";
  const result = applyPhraseFilter(unsafeResponse, "knowledge");
  
  assertEquals(result.blocked, true);
  assertEquals(result.response.includes("Function Lead"), true);
});
