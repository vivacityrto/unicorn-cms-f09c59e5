/**
 * Ask Viv Access Control Helpers
 * 
 * Provides middleware guards for Ask Viv endpoints.
 * Ensures only Vivacity internal staff can access Ask Viv features.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UserProfile } from "./auth-helpers.ts";

/**
 * Vivacity internal roles that can access Ask Viv
 */
const VIVACITY_INTERNAL_ROLES = ["Super Admin", "Team Leader", "Team Member"];

/**
 * Check if a user profile is Vivacity internal staff
 */
export function isVivacityInternal(profile: UserProfile | null): boolean {
  if (!profile) return false;
  
  // Check unicorn_role for current role system
  if (profile.unicorn_role && VIVACITY_INTERNAL_ROLES.includes(profile.unicorn_role)) {
    return true;
  }
  
  return false;
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
  // Check if user is Vivacity internal
  if (!isVivacityInternal(profile)) {
    // Log the denied attempt
    await logDeniedAccess(supabase, userId, profile?.unicorn_role || "unknown", endpoint);
    
    return {
      allowed: false,
      reason: "Ask Viv is restricted to Vivacity Team members.",
    };
  }

  // Check if user is archived
  if (profile?.status === "archived" || profile?.status === "inactive") {
    await logDeniedAccess(supabase, userId, profile?.unicorn_role || "unknown", endpoint, "user_archived");
    
    return {
      allowed: false,
      reason: "Your account is no longer active.",
    };
  }

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
export function askVivAccessDeniedResponse(reason: string = "Ask Viv is restricted to Vivacity Team members."): Response {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": 
      "authorization, x-client-info, apikey, content-type, " +
      "x-supabase-client-platform, x-supabase-client-platform-version, " +
      "x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  return new Response(
    JSON.stringify({
      error: "FORBIDDEN",
      code: "ASK_VIV_ACCESS_DENIED",
      message: reason,
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}
