/**
 * Gap Key Mapper Tests
 * 
 * Run with: deno test --allow-net --allow-env gap-key-mapper_test.ts
 */

import {
  assertEquals,
  assertArrayIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  mapGapToKey,
  mapGapsToKeys,
  getValidGapKeys,
} from "./gap-key-mapper.ts";

// =============================================================================
// mapGapToKey tests
// =============================================================================

Deno.test("mapGapToKey - maps client scope gaps correctly", () => {
  assertEquals(mapGapToKey("Client not selected"), "missing_scope_client");
  assertEquals(mapGapToKey("No client specified"), "missing_scope_client");
  assertEquals(mapGapToKey("Please select a client first"), "missing_scope_client");
  assertEquals(mapGapToKey("Missing client context"), "missing_scope_client");
});

Deno.test("mapGapToKey - maps package scope gaps correctly", () => {
  assertEquals(mapGapToKey("Package not selected"), "missing_scope_package");
  assertEquals(mapGapToKey("No package specified"), "missing_scope_package");
  assertEquals(mapGapToKey("Select a package to continue"), "missing_scope_package");
});

Deno.test("mapGapToKey - maps phase scope gaps correctly", () => {
  assertEquals(mapGapToKey("Phase not selected"), "missing_scope_phase");
  assertEquals(mapGapToKey("No phase specified"), "missing_scope_phase");
  assertEquals(mapGapToKey("Missing phase context"), "missing_scope_phase");
});

Deno.test("mapGapToKey - maps multiple packages gap correctly", () => {
  assertEquals(mapGapToKey("Multiple active packages found"), "multiple_active_packages");
  assertEquals(mapGapToKey("More than one package is active"), "multiple_active_packages");
});

Deno.test("mapGapToKey - maps activity history gaps correctly", () => {
  assertEquals(mapGapToKey("No recent activity found"), "no_activity_history");
  assertEquals(mapGapToKey("No activity history available"), "no_activity_history");
});

Deno.test("mapGapToKey - maps stale data gaps correctly", () => {
  assertEquals(mapGapToKey("Data is stale"), "stale_data");
  assertEquals(mapGapToKey("Last updated 18 days ago"), "stale_data");
  assertEquals(mapGapToKey("Outdated information"), "stale_data");
});

Deno.test("mapGapToKey - maps evidence gaps correctly", () => {
  assertEquals(mapGapToKey("Evidence missing for this task"), "missing_required_evidence");
  assertEquals(mapGapToKey("Required evidence not found"), "missing_required_evidence");
  assertEquals(mapGapToKey("Please upload evidence"), "missing_required_evidence");
});

Deno.test("mapGapToKey - maps task gaps correctly", () => {
  assertEquals(mapGapToKey("Task data missing"), "missing_tasks_data");
  assertEquals(mapGapToKey("No tasks found"), "missing_tasks_data");
  assertEquals(mapGapToKey("Missing task information"), "missing_tasks_data");
});

Deno.test("mapGapToKey - maps permission gaps correctly", () => {
  assertEquals(mapGapToKey("Insufficient permissions"), "insufficient_permissions");
  assertEquals(mapGapToKey("Access denied"), "insufficient_permissions");
  assertEquals(mapGapToKey("Not authorized to view"), "insufficient_permissions");
});

Deno.test("mapGapToKey - maps consult log gaps correctly", () => {
  assertEquals(mapGapToKey("No consult logs found"), "missing_consult_logs");
  assertEquals(mapGapToKey("Consult log missing"), "missing_consult_logs");
});

Deno.test("mapGapToKey - maps phase status gaps correctly", () => {
  assertEquals(mapGapToKey("Phase status unknown"), "missing_phase_status");
  assertEquals(mapGapToKey("Status missing for phase"), "missing_phase_status");
});

Deno.test("mapGapToKey - maps document gaps correctly", () => {
  assertEquals(mapGapToKey("Document missing"), "missing_document_data");
  assertEquals(mapGapToKey("Required document not found"), "missing_document_data");
});

Deno.test("mapGapToKey - maps tailoring gaps correctly", () => {
  assertEquals(mapGapToKey("Tailoring incomplete"), "incomplete_tailoring");
  assertEquals(mapGapToKey("Incomplete tailoring for delivery mode"), "incomplete_tailoring");
});

Deno.test("mapGapToKey - maps standard mapping gaps correctly", () => {
  assertEquals(mapGapToKey("Standard mapping missing"), "missing_standard_mapping");
  assertEquals(mapGapToKey("Standard reference not found"), "missing_standard_mapping");
});

Deno.test("mapGapToKey - returns 'other' for unknown gaps", () => {
  assertEquals(mapGapToKey("Some random gap"), "other");
  assertEquals(mapGapToKey("Unknown issue"), "other");
  assertEquals(mapGapToKey(""), "other");
});

Deno.test("mapGapToKey - handles null/undefined gracefully", () => {
  assertEquals(mapGapToKey(null as unknown as string), "other");
  assertEquals(mapGapToKey(undefined as unknown as string), "other");
});

// =============================================================================
// mapGapsToKeys tests
// =============================================================================

Deno.test("mapGapsToKeys - maps multiple gaps correctly", () => {
  const gaps = [
    "Client not selected",
    "Evidence missing",
    "Unknown issue",
  ];
  const keys = mapGapsToKeys(gaps);
  
  assertArrayIncludes(keys, ["missing_scope_client"]);
  assertArrayIncludes(keys, ["missing_required_evidence"]);
  assertArrayIncludes(keys, ["other"]);
});

Deno.test("mapGapsToKeys - deduplicates keys", () => {
  const gaps = [
    "Client not selected",
    "No client specified", // Same key as above
    "Missing client context", // Same key again
  ];
  const keys = mapGapsToKeys(gaps);
  
  assertEquals(keys.length, 1);
  assertEquals(keys[0], "missing_scope_client");
});

Deno.test("mapGapsToKeys - handles empty array", () => {
  const keys = mapGapsToKeys([]);
  assertEquals(keys.length, 0);
});

Deno.test("mapGapsToKeys - handles non-array input", () => {
  const keys = mapGapsToKeys(null as unknown as string[]);
  assertEquals(keys.length, 0);
});

// =============================================================================
// getValidGapKeys tests
// =============================================================================

Deno.test("getValidGapKeys - returns all valid keys", () => {
  const keys = getValidGapKeys();
  
  assertEquals(keys.length, 15);
  assertArrayIncludes(keys, ["missing_scope_client"]);
  assertArrayIncludes(keys, ["missing_scope_package"]);
  assertArrayIncludes(keys, ["missing_scope_phase"]);
  assertArrayIncludes(keys, ["other"]);
});
