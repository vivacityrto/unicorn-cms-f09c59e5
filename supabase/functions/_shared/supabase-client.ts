/**
 * Supabase Client Utilities for Edge Functions
 * 
 * Provides standardised client creation with consistent error handling.
 * 
 * Usage:
 * ```typescript
 * import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
 * 
 * // For admin operations (bypasses RLS)
 * const serviceClient = createServiceClient();
 * 
 * // For user-scoped operations (respects RLS)
 * const userClient = createUserClient(req.headers.get("Authorization"));
 * ```
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Creates a Supabase client with service role permissions.
 * Use for admin operations that need to bypass RLS.
 * 
 * @throws Error if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL environment variable");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client scoped to a user's session.
 * Use for operations that should respect RLS policies.
 * 
 * @param authHeader - The Authorization header from the request (e.g., "Bearer <token>")
 * @throws Error if SUPABASE_URL or SUPABASE_ANON_KEY are not set
 */
export function createUserClient(authHeader: string | null): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL environment variable");
  }
  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY environment variable");
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client with service role but includes the user's auth header.
 * Useful when you need service role privileges but want to track the user.
 * 
 * @param authHeader - The Authorization header from the request
 */
export function createServiceClientWithAuth(authHeader: string | null): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL environment variable");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
