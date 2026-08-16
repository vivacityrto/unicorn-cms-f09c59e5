/**
 * Ask Viv Access Control Helpers
 * 
 * Provides middleware guards for Ask Viv endpoints.
 * Ensures only Vivacity internal staff can access Ask Viv features.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UserProfile } from "./auth-helpers.ts";
import { corsHeaders } from "./cors.ts";
import { checkPermission, FeatureKeys } from "./requireCaller.ts";

const VIVACITY_INTERNAL_ROLES = [
  "Super Admin", "Team Leader", "Team Member",
  "Integrator", "BGT", "CSC", "CET",
];

/**
 * Sync profile-role helper used by client-mode preview UI.
 * Staff endpoint gates go through check_permission (hasAskVivStaffAccess).
 */
export function isVivacityInternal(profile: UserProfile | null): boolean {
  if (!profile?.unicorn_role) return false;
  return VIVACITY_INTERNAL_ROLES.includes(profile.unicorn_role);
}

export async function hasAskVivStaffAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  return checkPermission(supabase, userId, FeatureKeys.staffAi);
}

/**
 * Validate Ask Viv access and log denied attempts
 * 
 * @returns true if access is granted, false if denied
 */
export async function validateAskVivAccess(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile | null,
  endpoint: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!(await hasAskVivStaffAccess(supabase, userId))) {
    await logDeniedAccess(supabase, userId, profile?.unicorn_role || "unknown", endpoint);

    return {
      allowed: false,
      reason: "Ask Viv is restricted to Vivacity Team members.",
    };
  }

  // Note: no separate active-state check here — verifyAuth() (auth-helpers.ts) already
  // gates on profile.state ('inactive'/'suspended') and nulls the profile before this
  // function is ever reached, so a second check on a nonexistent `profile.status` field
  // was dead code. Don't re-add without checking why verifyAuth's gate stopped applying.

  return { allowed: true };
}

/**
 * Log a denied access attempt to the audit table
 */
async function logDeniedAccess(
  supabase: SupabaseClient,
  userId: string,
  userRole: string,
  endpoint: string,
  reason: string = "not_vivacity_internal"
): Promise<void> {
  try {
    await supabase.from("audit_ask_viv_access_denied").insert({
      user_id: userId,
      user_role: userRole,
      endpoint,
      reason,
      request_context: {
        timestamp: new Date().toISOString(),
      },
    });
    console.log(`Ask Viv access denied: user=${userId}, role=${userRole}, endpoint=${endpoint}, reason=${reason}`);
  } catch (err) {
    console.error("Failed to log denied access:", err);
  }
}

/**
 * JSON error response for denied access
 */
export function askVivAccessDeniedResponse(
  req: Request,
  reason: string = "Ask Viv is restricted to Vivacity Team members.",
): Response {
  return new Response(
    JSON.stringify({
      error: "FORBIDDEN",
      code: "ASK_VIV_ACCESS_DENIED",
      message: reason,
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders(req),
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Client roles that may use Ask Viv in client mode.
 */
const CLIENT_ASK_VIV_ROLES = ["Admin", "User"];

/**
 * Validate Ask Viv access for CLIENT mode.
 *
 * Distinct from validateAskVivAccess (which gates Vivacity internal staff).
 * On success, returns the resolved tenant_id so callers can scope the
 * daily-cap RPC against ai_client_query_usage without a second lookup.
 *
 * Fail-fast checks (in order):
 *  1. profile.unicorn_role must be 'Admin' or 'User'.
 *  2. profile.state must not be 'inactive' or 'suspended'.
 *     (NOTE: UserProfile exposes `state`, not `status`. The existing
 *     validateAskVivAccess above mistakenly reads `profile.status` —
 *     do not repeat that bug here.)
 *  3. Exactly one active tenant_members row must exist for the user.
 */
export async function validateClientAskVivAccess(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile | null,
  endpoint: string,
  previewTenantId?: number,
): Promise<
  | { allowed: true; tenant_id: number }
  | { allowed: false; reason: string }
> {
  // Preview bypass — Vivacity internal staff testing client surface
  if (previewTenantId != null && (await hasAskVivStaffAccess(supabase, userId))) {
    return { allowed: true, tenant_id: previewTenantId };
  }

  // 1. Role gate
  const role = profile?.unicorn_role ?? null;
  if (!role || !CLIENT_ASK_VIV_ROLES.includes(role)) {
    await logDeniedAccess(supabase, userId, role ?? "unknown", endpoint, "not_client_role");
    return { allowed: false, reason: "not_client_role" };
  }

  // 2. Account state gate — UserProfile uses `state`, NOT `status`.
  if (profile?.state === "inactive" || profile?.state === "suspended") {
    await logDeniedAccess(supabase, userId, role, endpoint, "user_archived");
    return { allowed: false, reason: "user_archived" };
  }

  // 3. Tenant membership resolution — must be exactly one active membership.
  const { data: memberships, error } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("validateClientAskVivAccess: tenant_members query failed", error);
    await logDeniedAccess(supabase, userId, role, endpoint, "membership_lookup_failed");
    return { allowed: false, reason: "membership_lookup_failed" };
  }

  const rows = memberships ?? [];
  if (rows.length === 0) {
    await logDeniedAccess(supabase, userId, role, endpoint, "no_tenant_membership");
    return { allowed: false, reason: "no_tenant_membership" };
  }
  if (rows.length > 1) {
    await logDeniedAccess(supabase, userId, role, endpoint, "multiple_memberships");
    return { allowed: false, reason: "multiple_memberships" };
  }

  return { allowed: true, tenant_id: Number(rows[0].tenant_id) };
}

/**
 * Map an internal client-mode denial reason code to a user-friendly message
 * suitable for the response body. Use with askVivAccessDeniedResponse().
 */
export function clientAskVivDenialMessage(reason: string): string {
  switch (reason) {
    case "not_client_role":
      return "Ask Viv client mode is for client-tenant users only.";
    case "user_archived":
      return "Your account is no longer active.";
    case "no_tenant_membership":
      return "No active tenant membership was found for your account.";
    case "multiple_memberships":
      return "Your account is linked to multiple tenants. Contact support to resolve.";
    case "membership_lookup_failed":
      return "We couldn't verify your tenant membership. Please try again.";
    default:
      return "Ask Viv access denied.";
  }
}
