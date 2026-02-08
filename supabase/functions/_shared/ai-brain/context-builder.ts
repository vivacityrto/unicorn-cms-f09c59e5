/**
 * AI Context Builder
 * 
 * Layer 1: Builds the canonical AI context payload.
 * This context is injected before any AI reasoning.
 */

import type { 
  AIContext, 
  AIUserContext, 
  AITenantContext, 
  AIScopeContext,
  AITimeContext 
} from "./types.ts";
import type { UserProfile } from "../auth-helpers.ts";

/**
 * Build the canonical AI context from request data.
 */
export function buildAIContext(
  user: { id: string },
  profile: UserProfile,
  tenant: { id: number; name: string; status: string; rto_id?: string | null; risk_level?: string | null } | null,
  scope: Partial<AIScopeContext> = {},
  timezone: string = "Australia/Sydney"
): AIContext {
  const now = new Date();
  const sessionId = `${user.id}-${now.getTime()}`;
  
  return {
    user: buildUserContext(user, profile),
    tenant: tenant ? buildTenantContext(tenant) : null,
    scope: buildScopeContext(scope),
    time: buildTimeContext(now, timezone),
    session_id: sessionId,
  };
}

/**
 * Build user context from profile.
 */
function buildUserContext(
  user: { id: string },
  profile: UserProfile
): AIUserContext {
  const internalRoles = ["Super Admin", "Team Leader", "Team Member"];
  
  return {
    id: user.id,
    role: profile.unicorn_role || "Unknown",
    function: profile.vivacity_function || null,
    is_internal: internalRoles.includes(profile.unicorn_role || ""),
    display_name: profile.display_name || null,
  };
}

/**
 * Build tenant context.
 */
function buildTenantContext(tenant: {
  id: number;
  name: string;
  status: string;
  rto_id?: string | null;
  risk_level?: string | null;
}): AITenantContext {
  return {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status || "unknown",
    rto_id: tenant.rto_id || null,
    risk_level: tenant.risk_level || null,
  };
}

/**
 * Build scope context.
 */
function buildScopeContext(scope: Partial<AIScopeContext>): AIScopeContext {
  return {
    client_id: scope.client_id ?? null,
    package_id: scope.package_id ?? null,
    phase_id: scope.phase_id ?? null,
    document_id: scope.document_id ?? null,
  };
}

/**
 * Build time context.
 */
function buildTimeContext(now: Date, timezone: string): AITimeContext {
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();
  
  return {
    now: now.toISOString(),
    timezone,
    quarter,
    year,
  };
}

/**
 * Format AI context for system prompt injection.
 */
export function formatContextForPrompt(context: AIContext): string {
  const lines: string[] = [
    "=== SYSTEM CONTEXT ===",
    "",
    "User:",
    `  ID: ${context.user.id}`,
    `  Role: ${context.user.role}`,
    `  Internal: ${context.user.is_internal ? "Yes" : "No"}`,
    context.user.function ? `  Function: ${context.user.function}` : "",
    "",
  ];
  
  if (context.tenant) {
    lines.push(
      "Tenant:",
      `  ID: ${context.tenant.id}`,
      `  Name: ${context.tenant.name}`,
      `  Status: ${context.tenant.status}`,
      context.tenant.rto_id ? `  RTO ID: ${context.tenant.rto_id}` : "",
      context.tenant.risk_level ? `  Risk Level: ${context.tenant.risk_level}` : "",
      ""
    );
  } else {
    lines.push("Tenant: Not specified", "");
  }
  
  const scopeItems: string[] = [];
  if (context.scope.client_id) scopeItems.push(`Client: ${context.scope.client_id}`);
  if (context.scope.package_id) scopeItems.push(`Package: ${context.scope.package_id}`);
  if (context.scope.phase_id) scopeItems.push(`Phase: ${context.scope.phase_id}`);
  if (context.scope.document_id) scopeItems.push(`Document: ${context.scope.document_id}`);
  
  if (scopeItems.length > 0) {
    lines.push("Scope:", ...scopeItems.map(s => `  ${s}`), "");
  }
  
  lines.push(
    "Time:",
    `  Now: ${context.time.now}`,
    `  Timezone: ${context.time.timezone}`,
    `  Quarter: Q${context.time.quarter} ${context.time.year}`,
    "",
    "========================",
    ""
  );
  
  return lines.filter(l => l !== "").join("\n");
}
