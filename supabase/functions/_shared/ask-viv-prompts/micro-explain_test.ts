/**
 * Tests for Ask Viv Micro-Explain module
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildMicroExplainPayload,
  buildMicroExplainFromIntent,
  buildMicroExplainForSafetyFallback,
  buildMicroExplainAuditEntry,
  shouldShowMicroExplain,
  USAGE_RULES_LINK,
  MICRO_EXPLAIN_VERSION,
  type MicroExplainReason,
} from "./micro-explain.ts";

// ============================================================
// buildMicroExplainPayload tests
// ============================================================

Deno.test("buildMicroExplainPayload - decision_request returns correct message", () => {
  const payload = buildMicroExplainPayload("decision_request");
  
  assertEquals(payload.reason, "decision_request");
  assertEquals(payload.usage_rules_link, USAGE_RULES_LINK);
  assertExists(payload.message);
  assertEquals(payload.message.includes("Why can't Ask Viv answer this?"), true);
  assertEquals(payload.message.includes("decision, approval, or submission outcome"), true);
  assertEquals(payload.message.includes("Human judgement is required"), true);
});

Deno.test("buildMicroExplainPayload - out_of_scope returns correct message", () => {
  const payload = buildMicroExplainPayload("out_of_scope");
  
  assertEquals(payload.reason, "out_of_scope");
  assertEquals(payload.usage_rules_link, USAGE_RULES_LINK);
  assertExists(payload.message);
  assertEquals(payload.message.includes("Why can't Ask Viv answer this?"), true);
  assertEquals(payload.message.includes("outside Ask Viv's internal compliance support scope"), true);
});

Deno.test("buildMicroExplainPayload - safety_fallback returns correct message", () => {
  const payload = buildMicroExplainPayload("safety_fallback");
  
  assertEquals(payload.reason, "safety_fallback");
  assertEquals(payload.usage_rules_link, USAGE_RULES_LINK);
  assertExists(payload.message);
  assertEquals(payload.message.includes("Why can't Ask Viv answer this?"), true);
  assertEquals(payload.message.includes("could not be returned safely"), true);
});

// ============================================================
// buildMicroExplainFromIntent tests
// ============================================================

Deno.test("buildMicroExplainFromIntent - decision_request returns payload", () => {
  const payload = buildMicroExplainFromIntent("decision_request");
  
  assertExists(payload);
  assertEquals(payload!.reason, "decision_request");
});

Deno.test("buildMicroExplainFromIntent - out_of_scope returns payload", () => {
  const payload = buildMicroExplainFromIntent("out_of_scope");
  
  assertExists(payload);
  assertEquals(payload!.reason, "out_of_scope");
});

Deno.test("buildMicroExplainFromIntent - non-blocked intent returns null", () => {
  assertEquals(buildMicroExplainFromIntent("status"), null);
  assertEquals(buildMicroExplainFromIntent("explanation"), null);
  assertEquals(buildMicroExplainFromIntent("gap_analysis"), null);
  assertEquals(buildMicroExplainFromIntent("unknown"), null);
});

// ============================================================
// buildMicroExplainForSafetyFallback tests
// ============================================================

Deno.test("buildMicroExplainForSafetyFallback - returns safety_fallback payload", () => {
  const payload = buildMicroExplainForSafetyFallback();
  
  assertEquals(payload.reason, "safety_fallback");
  assertExists(payload.message);
  assertEquals(payload.usage_rules_link, USAGE_RULES_LINK);
});

// ============================================================
// buildMicroExplainAuditEntry tests
// ============================================================

Deno.test("buildMicroExplainAuditEntry - includes all required fields", () => {
  const entry = buildMicroExplainAuditEntry("decision_request");
  
  assertExists(entry.micro_explain);
  assertEquals(entry.micro_explain.shown, true);
  assertEquals(entry.micro_explain.reason, "decision_request");
  assertEquals(entry.micro_explain.version, MICRO_EXPLAIN_VERSION);
});

Deno.test("buildMicroExplainAuditEntry - works for all reason types", () => {
  const reasons: MicroExplainReason[] = ["decision_request", "out_of_scope", "safety_fallback"];
  
  for (const reason of reasons) {
    const entry = buildMicroExplainAuditEntry(reason);
    assertEquals(entry.micro_explain.reason, reason);
    assertEquals(entry.micro_explain.shown, true);
  }
});

// ============================================================
// shouldShowMicroExplain tests
// ============================================================

Deno.test("shouldShowMicroExplain - blocked with reason returns true", () => {
  assertEquals(shouldShowMicroExplain(true, "decision_request"), true);
  assertEquals(shouldShowMicroExplain(true, "out_of_scope"), true);
  assertEquals(shouldShowMicroExplain(true, "safety_fallback"), true);
});

Deno.test("shouldShowMicroExplain - blocked without reason returns false", () => {
  assertEquals(shouldShowMicroExplain(true, null), false);
  assertEquals(shouldShowMicroExplain(true, undefined), false);
});

Deno.test("shouldShowMicroExplain - not blocked returns false", () => {
  assertEquals(shouldShowMicroExplain(false, "decision_request"), false);
  assertEquals(shouldShowMicroExplain(false, null), false);
});

// ============================================================
// Fixed text validation tests
// ============================================================

Deno.test("micro-explain messages are fixed and deterministic", () => {
  // Call multiple times to ensure same output
  const payload1 = buildMicroExplainPayload("decision_request");
  const payload2 = buildMicroExplainPayload("decision_request");
  
  assertEquals(payload1.message, payload2.message);
  assertEquals(payload1.reason, payload2.reason);
  assertEquals(payload1.usage_rules_link, payload2.usage_rules_link);
});

Deno.test("micro-explain messages contain required explanation structure", () => {
  // Each message should have the "Why can't Ask Viv answer this?" header
  const reasons: MicroExplainReason[] = ["decision_request", "out_of_scope", "safety_fallback"];
  
  for (const reason of reasons) {
    const payload = buildMicroExplainPayload(reason);
    assertEquals(payload.message.startsWith("Why can't Ask Viv answer this?"), true);
    // Should have content after the header
    assertEquals(payload.message.length > 50, true);
  }
});

// ============================================================
// Link validation tests
// ============================================================

Deno.test("usage rules link is internal path", () => {
  assertEquals(USAGE_RULES_LINK, "/internal/ask-viv/usage-rules");
  assertEquals(USAGE_RULES_LINK.startsWith("/"), true);
  assertEquals(USAGE_RULES_LINK.includes("http"), false);
});
