/**
 * Quality Telemetry Tests
 * 
 * Run with: deno test --allow-net --allow-env quality-telemetry_test.ts
 */

import {
  assertEquals,
  assertArrayIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  mapPhraseFilterCategories,
  mapIntentToBlockCategory,
  buildBlockCategories,
  buildQualityEventMeta,
} from "./quality-telemetry.ts";

// =============================================================================
// mapPhraseFilterCategories tests
// =============================================================================

Deno.test("mapPhraseFilterCategories - maps regulatory_action correctly", () => {
  const categories = mapPhraseFilterCategories(["regulatory_action"]);
  assertEquals(categories, ["phrase_filter_regulatory_action"]);
});

Deno.test("mapPhraseFilterCategories - maps phase_bypass correctly", () => {
  const categories = mapPhraseFilterCategories(["phase_bypass"]);
  assertEquals(categories, ["phrase_filter_phase_bypass"]);
});

Deno.test("mapPhraseFilterCategories - maps deterministic_compliance correctly", () => {
  const categories = mapPhraseFilterCategories(["deterministic_compliance"]);
  assertEquals(categories, ["phrase_filter_compliance_claim"]);
});

Deno.test("mapPhraseFilterCategories - maps multiple categories", () => {
  const categories = mapPhraseFilterCategories([
    "regulatory_action",
    "phase_bypass",
    "deterministic_compliance",
  ]);
  
  assertEquals(categories.length, 3);
  assertArrayIncludes(categories, ["phrase_filter_regulatory_action"]);
  assertArrayIncludes(categories, ["phrase_filter_phase_bypass"]);
  assertArrayIncludes(categories, ["phrase_filter_compliance_claim"]);
});

Deno.test("mapPhraseFilterCategories - filters unknown categories", () => {
  const categories = mapPhraseFilterCategories([
    "regulatory_action",
    "unknown_category",
  ]);
  
  assertEquals(categories.length, 1);
  assertEquals(categories[0], "phrase_filter_regulatory_action");
});

Deno.test("mapPhraseFilterCategories - handles empty array", () => {
  const categories = mapPhraseFilterCategories([]);
  assertEquals(categories.length, 0);
});

// =============================================================================
// mapIntentToBlockCategory tests
// =============================================================================

Deno.test("mapIntentToBlockCategory - maps decision_request correctly", () => {
  const category = mapIntentToBlockCategory("decision_request");
  assertEquals(category, "intent_decision_request");
});

Deno.test("mapIntentToBlockCategory - maps out_of_scope correctly", () => {
  const category = mapIntentToBlockCategory("out_of_scope");
  assertEquals(category, "intent_out_of_scope");
});

Deno.test("mapIntentToBlockCategory - returns null for non-blocking intents", () => {
  assertEquals(mapIntentToBlockCategory("status"), null);
  assertEquals(mapIntentToBlockCategory("explanation"), null);
  assertEquals(mapIntentToBlockCategory("gap_analysis"), null);
});

Deno.test("mapIntentToBlockCategory - returns null for unknown intent", () => {
  assertEquals(mapIntentToBlockCategory("unknown"), null);
});

// =============================================================================
// buildBlockCategories tests
// =============================================================================

Deno.test("buildBlockCategories - builds intent block category", () => {
  const categories = buildBlockCategories({
    intentBlocked: true,
    intent: "decision_request",
  });
  
  assertEquals(categories.length, 1);
  assertEquals(categories[0], "intent_decision_request");
});

Deno.test("buildBlockCategories - builds phrase filter categories", () => {
  const categories = buildBlockCategories({
    phraseFilterBlocked: true,
    phraseFilterCategories: ["regulatory_action", "phase_bypass"],
  });
  
  assertEquals(categories.length, 2);
  assertArrayIncludes(categories, ["phrase_filter_regulatory_action"]);
  assertArrayIncludes(categories, ["phrase_filter_phase_bypass"]);
});

Deno.test("buildBlockCategories - builds validator fallback category", () => {
  const categories = buildBlockCategories({
    validatorFallback: true,
  });
  
  assertEquals(categories.length, 1);
  assertEquals(categories[0], "validator_fallback");
});

Deno.test("buildBlockCategories - combines all block types", () => {
  const categories = buildBlockCategories({
    intentBlocked: true,
    intent: "out_of_scope",
    phraseFilterBlocked: true,
    phraseFilterCategories: ["regulatory_action"],
    validatorFallback: true,
  });
  
  assertEquals(categories.length, 3);
  assertArrayIncludes(categories, ["intent_out_of_scope"]);
  assertArrayIncludes(categories, ["phrase_filter_regulatory_action"]);
  assertArrayIncludes(categories, ["validator_fallback"]);
});

Deno.test("buildBlockCategories - returns empty for non-blocked response", () => {
  const categories = buildBlockCategories({
    intentBlocked: false,
    phraseFilterBlocked: false,
    validatorFallback: false,
  });
  
  assertEquals(categories.length, 0);
});

Deno.test("buildBlockCategories - ignores intent if not blocked", () => {
  const categories = buildBlockCategories({
    intentBlocked: false,
    intent: "decision_request", // Intent is set but not blocked
  });
  
  assertEquals(categories.length, 0);
});

// =============================================================================
// buildQualityEventMeta tests
// =============================================================================

Deno.test("buildQualityEventMeta - builds complete meta object", () => {
  const meta = buildQualityEventMeta({
    intentVersion: "v1",
    phraseFilterVersion: "v1",
    validatorVersion: "v2",
    freshnessStatus: "stale",
    freshnessDays: 18,
    confidenceDowngraded: true,
    scopeInferred: true,
    scopeSource: "url",
    repairErrorCount: 2,
  });
  
  assertEquals(meta.intent_version, "v1");
  assertEquals(meta.phrase_filter_version, "v1");
  assertEquals(meta.validator_version, "v2");
  assertEquals(meta.freshness_status, "stale");
  assertEquals(meta.freshness_days, 18);
  assertEquals(meta.confidence_downgraded, true);
  assertEquals(meta.scope_inferred, true);
  assertEquals(meta.scope_source, "url");
  assertEquals(meta.repair_error_count, 2);
});

Deno.test("buildQualityEventMeta - handles partial input", () => {
  const meta = buildQualityEventMeta({
    freshnessStatus: "fresh",
  });
  
  assertEquals(meta.freshness_status, "fresh");
  assertEquals(meta.intent_version, undefined);
  assertEquals(meta.confidence_downgraded, undefined);
});

Deno.test("buildQualityEventMeta - handles empty input", () => {
  const meta = buildQualityEventMeta({});
  
  assertEquals(Object.keys(meta).filter(k => meta[k as keyof typeof meta] !== undefined).length, 0);
});
