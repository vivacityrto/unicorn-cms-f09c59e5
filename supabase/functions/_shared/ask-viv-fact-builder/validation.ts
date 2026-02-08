/**
 * Input Validation
 * 
 * Validates and sanitizes inputs before fact building.
 * Ensures only Vivacity internal roles can access.
 */

import type { AskVivFactBuilderInput } from "./types.ts";
import { VIVACITY_INTERNAL_ROLES } from "./types.ts";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate fact builder input.
 * - Always require tenant_id
 * - Validate role is Vivacity internal
 */
export function validateInput(input: AskVivFactBuilderInput): ValidationResult {
  // User ID required
  if (!input.user_id || typeof input.user_id !== "string") {
    return { valid: false, error: "user_id is required" };
  }

  // Tenant ID required and must be positive number
  if (!input.tenant_id || typeof input.tenant_id !== "number" || input.tenant_id <= 0) {
    return { valid: false, error: "tenant_id is required and must be a positive number" };
  }

  // Role required and must be Vivacity internal
  if (!input.role || typeof input.role !== "string") {
    return { valid: false, error: "role is required" };
  }

  if (!isVivacityInternalRole(input.role)) {
    return { 
      valid: false, 
      error: `Access denied. Role "${input.role}" is not a Vivacity internal role.` 
    };
  }

  // Timestamp required
  if (!input.now_iso || typeof input.now_iso !== "string") {
    return { valid: false, error: "now_iso timestamp is required" };
  }

  // Timezone required
  if (!input.timezone || typeof input.timezone !== "string") {
    return { valid: false, error: "timezone is required" };
  }

  return { valid: true };
}

/**
 * Check if role is Vivacity internal.
 */
export function isVivacityInternalRole(role: string): boolean {
  return VIVACITY_INTERNAL_ROLES.includes(role);
}

/**
 * Sanitize scope IDs to prevent injection.
 * Ensures IDs are valid UUID or numeric strings.
 */
export function sanitizeScope(scope?: {
  client_id?: string | null;
  package_id?: string | null;
  phase_id?: string | null;
}): {
  client_id: string | null;
  package_id: string | null;
  phase_id: string | null;
} {
  return {
    client_id: sanitizeId(scope?.client_id),
    package_id: sanitizeId(scope?.package_id),
    phase_id: sanitizeId(scope?.phase_id),
  };
}

function sanitizeId(id: string | null | undefined): string | null {
  if (!id) return null;
  
  const str = String(id).trim();
  
  // Allow UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) {
    return str;
  }
  
  // Allow numeric ID
  const numericRegex = /^\d+$/;
  if (numericRegex.test(str)) {
    return str;
  }
  
  // Invalid format - return null
  return null;
}
