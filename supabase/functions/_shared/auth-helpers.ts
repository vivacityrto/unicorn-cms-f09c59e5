/**
 * Authentication Helpers for Edge Functions
 * 
 * Provides standardised authentication and authorization utilities.
 * 
 * Usage:
 * ```typescript
 * import { extractToken, verifyAuth, checkSuperAdmin } from "../_shared/auth-helpers.ts";
 * import { createServiceClient } from "../_shared/supabase-client.ts";
 * import { jsonError } from "../_shared/response-helpers.ts";
 * 
 * const token = extractToken(req);
 * if (!token) return jsonError(401, "UNAUTHORIZED", "No token provided");
 * 
 * const supabase = createServiceClient();
 * const { user, profile, error } = await verifyAuth(supabase, token);
 * if (error) return jsonError(401, "UNAUTHORIZED", error);
 * 
 * if (!checkSuperAdmin(profile)) {
 *   return jsonError(403, "FORBIDDEN", "Super Admin access required");
 * }
 * ```
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * User profile structure from the users table.
 */
export interface UserProfile {
  user_uuid: string;
  unicorn_role: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
}

/**
 * Result of authentication verification.
 */
export interface AuthResult {
  user: { id: string; email?: string } | null;
  profile: UserProfile | null;
  error: string | null;
}

/**
 * Vivacity Team roles that have elevated permissions.
 */
const VIVACITY_ROLES = ["Super Admin", "Team Leader", "Team Member"];

/**
 * Super Admin role constant.
 */
const SUPER_ADMIN_ROLE = "Super Admin";

/**
 * Extract the Bearer token from an Authorization header.
 * 
 * @param req - The incoming request
 * @returns The token string, or null if not present
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1];
}

/**
 * Verify a JWT token and return the user and their profile.
 * 
 * @param supabase - Supabase client (service role recommended)
 * @param token - The JWT token to verify
 * @returns AuthResult with user, profile, and any error
 */
export async function verifyAuth(
  supabase: SupabaseClient,
  token: string
): Promise<AuthResult> {
  try {
    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        user: null,
        profile: null,
        error: authError?.message || "Invalid or expired token",
      };
    }

    // Fetch the user's profile
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("user_uuid, unicorn_role, email, first_name, last_name, state")
      .eq("user_uuid", user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return {
        user: { id: user.id, email: user.email },
        profile: null,
        error: "User profile not found",
      };
    }

    // Check if user is active
    if (profile.state === "inactive" || profile.state === "suspended") {
      return {
        user: null,
        profile: null,
        error: "User account is not active",
      };
    }

    return {
      user: { id: user.id, email: user.email },
      profile: profile as UserProfile,
      error: null,
    };
  } catch (err) {
    console.error("Auth verification error:", err);
    return {
      user: null,
      profile: null,
      error: "Authentication failed",
    };
  }
}

/**
 * Check if a user profile has Super Admin privileges.
 * 
 * @param profile - The user's profile
 * @returns true if the user is a Super Admin
 */
export function checkSuperAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return profile.unicorn_role === SUPER_ADMIN_ROLE;
}

/**
 * Check if a user profile belongs to the Vivacity Team.
 * 
 * @param profile - The user's profile
 * @returns true if the user is a Vivacity Team member
 */
export function checkVivacityTeam(profile: UserProfile | null): boolean {
  if (!profile?.unicorn_role) return false;
  return VIVACITY_ROLES.includes(profile.unicorn_role);
}

/**
 * Check if a user has admin access to a specific tenant.
 * 
 * @param supabase - Supabase client
 * @param userId - The user's UUID
 * @param tenantId - The tenant ID to check
 * @returns true if the user is an admin for the tenant
 */
export async function checkTenantAdmin(
  supabase: SupabaseClient,
  userId: string,
  tenantId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return false;

  return data.tenant_role === "Admin" || data.tenant_role === "Owner";
}

/**
 * Check if a user has any access to a specific tenant.
 * 
 * @param supabase - Supabase client
 * @param userId - The user's UUID
 * @param tenantId - The tenant ID to check
 * @returns true if the user has access to the tenant
 */
export async function checkTenantAccess(
  supabase: SupabaseClient,
  userId: string,
  tenantId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  return !error && !!data;
}

/**
 * Get all tenant IDs a user has access to.
 * 
 * @param supabase - Supabase client
 * @param userId - The user's UUID
 * @returns Array of tenant IDs
 */
export async function getUserTenantIds(
  supabase: SupabaseClient,
  userId: string
): Promise<number[]> {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId);

  if (error || !data) return [];

  return data.map((row) => row.tenant_id);
}
