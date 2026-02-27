/**
 * Scope Lock Tests
 * 
 * Tests for buildScopeLock, hasInferredScope, and related utilities.
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildScopeLock,
  buildScopeLockAuditEntry,
  hasInferredScope,
  getInferredParts,
  formatScopeForDisplay,
} from "./scope-lock.ts";

// ============= buildScopeLock Tests =============

Deno.test("buildScopeLock - explicit scope with no inference", () => {
  const result = buildScopeLock({
    tenantId: 123,
    tenantName: "Test Tenant",
    providedScope: {
      client_id: "123",
      package_id: "456",
      phase_id: "789",
    },
    resolvedScope: {
      client_id: "123",
      package_id: "456",
      phase_id: "789",
    },
    decisions: [],
    labels: {
      client_label: "Test Client",
      package_label: "KickStart Package",
      phase_label: "PH-VAL - Validation",
    },
  });

  assertEquals(result.tenant_id, "123");
  assertEquals(result.client.id, "123");
  assertEquals(result.client.label, "Test Client");
  assertEquals(result.client.inferred, false);
  assertEquals(result.package.id, "456");
  assertEquals(result.package.label, "KickStart Package");
  assertEquals(result.package.inferred, false);
  assertEquals(result.phase.id, "789");
  assertEquals(result.phase.label, "PH-VAL - Validation");
  assertEquals(result.phase.inferred, false);
  assertEquals(result.inference_notes.length, 0);
});

Deno.test("buildScopeLock - inferred package", () => {
  const result = buildScopeLock({
    tenantId: 123,
    tenantName: "Test Tenant",
    providedScope: {
      client_id: "123",
      package_id: null,
      phase_id: null,
    },
    resolvedScope: {
      client_id: "123",
      package_id: "456",
      phase_id: null,
    },
    decisions: [
      {
        field: "package_id",
        action: "inferred",
        reason: 'Single active package found: "KickStart"',
        inferred_value: "456",
      },
    ],
    labels: {
      client_label: "Test Client",
      package_label: "KickStart Package",
      phase_label: null,
    },
  });

  assertEquals(result.package.inferred, true);
  assertEquals(result.client.inferred, false);
  assertEquals(result.phase.inferred, false);
});

Deno.test("buildScopeLock - multiple candidates adds note", () => {
  const result = buildScopeLock({
    tenantId: 123,
    tenantName: "Test Tenant",
    providedScope: {
      client_id: "123",
      package_id: null,
      phase_id: null,
    },
    resolvedScope: {
      client_id: "123",
      package_id: null,
      phase_id: null,
    },
    decisions: [
      {
        field: "package_id",
        action: "multiple_candidates",
        reason: "3 active packages found",
        inferred_value: null,
      },
    ],
    labels: {
      client_label: "Test Client",
      package_label: null,
      phase_label: null,
    },
  });

  assertEquals(result.package.inferred, false);
  assertEquals(result.inference_notes.length, 1);
  assertEquals(result.inference_notes[0], "3 active packages found");
});

// ============= hasInferredScope Tests =============

Deno.test("hasInferredScope - returns false when nothing inferred", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: false },
    package: { id: "456", label: "Package", inferred: false },
    phase: { id: "789", label: "Phase", inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  assertEquals(hasInferredScope(scopeLock), false);
});

Deno.test("hasInferredScope - returns true when client inferred", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: true },
    package: { id: "456", label: "Package", inferred: false },
    phase: { id: "789", label: "Phase", inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  assertEquals(hasInferredScope(scopeLock), true);
});

Deno.test("hasInferredScope - returns true when package inferred", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: false },
    package: { id: "456", label: "Package", inferred: true },
    phase: { id: "789", label: "Phase", inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  assertEquals(hasInferredScope(scopeLock), true);
});

// ============= getInferredParts Tests =============

Deno.test("getInferredParts - returns empty when nothing inferred", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: false },
    package: { id: "456", label: "Package", inferred: false },
    phase: { id: "789", label: "Phase", inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  assertEquals(getInferredParts(scopeLock), []);
});

Deno.test("getInferredParts - returns Package and Phase when both inferred", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: false },
    package: { id: "456", label: "Package", inferred: true },
    phase: { id: "789", label: "Phase", inferred: true },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  assertEquals(getInferredParts(scopeLock), ["Package", "Phase"]);
});

// ============= formatScopeForDisplay Tests =============

Deno.test("formatScopeForDisplay - full scope", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "ABC RTO", inferred: false },
    package: { id: "456", label: "KickStart", inferred: false },
    phase: { id: "789", label: "PH-VAL - Validation", inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  const result = formatScopeForDisplay(scopeLock);
  assertEquals(result, "Answer scoped to: Client ABC RTO, Package KickStart, Stage PH-VAL - Validation");
});

Deno.test("formatScopeForDisplay - partial scope with nulls", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "ABC RTO", inferred: false },
    package: { id: null, label: null, inferred: false },
    phase: { id: null, label: null, inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  const result = formatScopeForDisplay(scopeLock);
  assertEquals(result, "Answer scoped to: Client ABC RTO, Package Not specified, Stage Not specified");
});

// ============= buildScopeLockAuditEntry Tests =============

Deno.test("buildScopeLockAuditEntry - not confirmed", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: true },
    package: { id: "456", label: "Package", inferred: true },
    phase: { id: null, label: null, inferred: false },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  const result = buildScopeLockAuditEntry(scopeLock, false);
  assertEquals(result.client_inferred, true);
  assertEquals(result.package_inferred, true);
  assertEquals(result.phase_inferred, false);
  assertEquals(result.confirmed_by_user, false);
});

Deno.test("buildScopeLockAuditEntry - confirmed by user", () => {
  const scopeLock = {
    tenant_id: "123",
    client: { id: "123", label: "Test", inferred: false },
    package: { id: "456", label: "Package", inferred: true },
    phase: { id: "789", label: "Phase", inferred: true },
    derived_at: new Date().toISOString(),
    inference_notes: [],
  };

  const result = buildScopeLockAuditEntry(scopeLock, true);
  assertEquals(result.confirmed_by_user, true);
});
