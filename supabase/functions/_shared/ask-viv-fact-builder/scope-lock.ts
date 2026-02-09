/**
 * Scope Lock Types and Utilities
 * 
 * Tracks which scope elements were inferred vs explicitly provided.
 * Used for UI banners and audit logging.
 */

import type { InferenceDecision } from "./types.ts";

// ============= Types =============

export interface ScopeLockItem {
  id: string | null;
  label: string | null;
  inferred: boolean;
}

export interface ScopeLock {
  tenant_id: string;
  client: ScopeLockItem;
  package: ScopeLockItem;
  phase: ScopeLockItem;
  derived_at: string;
  inference_notes: string[];
}

export interface ScopeLockAuditEntry {
  client_inferred: boolean;
  package_inferred: boolean;
  phase_inferred: boolean;
  confirmed_by_user: boolean;
}

// ============= Constants =============

export const SCOPE_LOCK_VERSION = "v1";

// ============= Builders =============

/**
 * Build a ScopeLock from inference decisions and resolved data.
 */
export function buildScopeLock(args: {
  tenantId: number;
  tenantName: string | null;
  providedScope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  };
  resolvedScope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  };
  decisions: InferenceDecision[];
  labels: {
    client_label: string | null;
    package_label: string | null;
    phase_label: string | null;
  };
}): ScopeLock {
  const { tenantId, tenantName, providedScope, resolvedScope, decisions, labels } = args;

  // Determine inference status from decisions
  const clientDecision = decisions.find((d) => d.field === "client_id");
  const packageDecision = decisions.find((d) => d.field === "package_id");
  const phaseDecision = decisions.find((d) => d.field === "phase_id");

  // Build inference notes from decisions with multiple candidates or skipped
  const inferenceNotes: string[] = [];
  for (const decision of decisions) {
    if (decision.action === "multiple_candidates") {
      inferenceNotes.push(decision.reason);
    } else if (decision.action === "skipped" && decision.reason) {
      // Don't add skipped notes unless meaningful
      if (!decision.reason.includes("No ") && !decision.reason.includes("available")) {
        inferenceNotes.push(decision.reason);
      }
    }
  }

  return {
    tenant_id: tenantId.toString(),
    client: {
      id: resolvedScope.client_id,
      label: labels.client_label ?? tenantName,
      inferred: clientDecision?.action === "inferred",
    },
    package: {
      id: resolvedScope.package_id,
      label: labels.package_label,
      inferred: packageDecision?.action === "inferred",
    },
    phase: {
      id: resolvedScope.phase_id,
      label: labels.phase_label,
      inferred: phaseDecision?.action === "inferred",
    },
    derived_at: new Date().toISOString(),
    inference_notes: inferenceNotes,
  };
}

/**
 * Build scope lock audit entry for logging.
 */
export function buildScopeLockAuditEntry(
  scopeLock: ScopeLock,
  confirmedByUser: boolean = false
): ScopeLockAuditEntry {
  return {
    client_inferred: scopeLock.client.inferred,
    package_inferred: scopeLock.package.inferred,
    phase_inferred: scopeLock.phase.inferred,
    confirmed_by_user: confirmedByUser,
  };
}

/**
 * Check if any scope element was inferred.
 */
export function hasInferredScope(scopeLock: ScopeLock): boolean {
  return (
    scopeLock.client.inferred ||
    scopeLock.package.inferred ||
    scopeLock.phase.inferred
  );
}

/**
 * Get a list of which scope elements were inferred.
 */
export function getInferredParts(scopeLock: ScopeLock): string[] {
  const parts: string[] = [];
  if (scopeLock.client.inferred) parts.push("Client");
  if (scopeLock.package.inferred) parts.push("Package");
  if (scopeLock.phase.inferred) parts.push("Phase");
  return parts;
}

/**
 * Format scope for display string.
 */
export function formatScopeForDisplay(scopeLock: ScopeLock): string {
  const parts: string[] = [];
  
  parts.push(`Client ${scopeLock.client.label ?? "Not specified"}`);
  parts.push(`Package ${scopeLock.package.label ?? "Not specified"}`);
  parts.push(`Phase ${scopeLock.phase.label ?? "Not specified"}`);
  
  return `Answer scoped to: ${parts.join(", ")}`;
}
