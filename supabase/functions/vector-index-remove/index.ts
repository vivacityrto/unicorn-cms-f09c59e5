/**
 * Vector Index Remove Edge Function
 * 
 * Removes vector embeddings for specific records or entire tenants.
 * Requires SuperAdmin role.
 * 
 * DELETE /vector-index-remove
 * Body: { tenant_id: number, source_type?: string, record_id?: string }
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkSuperAdmin } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError } from "../_shared/response-helpers.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

interface RequestPayload {
  tenant_id: number;
  source_type?: string;
  record_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Accept both DELETE and POST for compatibility
  if (req.method !== "DELETE" && req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Only DELETE/POST requests are accepted");
  }

  try {
    // Authenticate
    const token = extractToken(req);
    if (!token) {
      return jsonError(401, "UNAUTHORIZED", "No authorization token provided");
    }

    const supabase = createServiceClient();
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    
    if (authError || !user || !profile) {
      return jsonError(401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    // Validate Ask Viv access - Vivacity internal only
    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "vector-index-remove");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(accessCheck.reason);
    }

    // Only SuperAdmins can remove indexes
    if (!checkSuperAdmin(profile)) {
      return jsonError(403, "FORBIDDEN", "Super Admin access required");
    }

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const { tenant_id, source_type, record_id } = payload;
    
    if (!tenant_id || typeof tenant_id !== "number") {
      return jsonError(400, "BAD_REQUEST", "tenant_id is required");
    }

    let query = supabase
      .from("vector_embeddings")
      .delete({ count: "exact" })
      .eq("tenant_id", tenant_id);

    // Apply filters if provided
    if (source_type) {
      query = query.eq("source_type", source_type);
    }
    if (record_id) {
      query = query.eq("record_id", record_id);
    }

    const { count, error: deleteError } = await query;

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return jsonError(500, "DELETE_ERROR", "Failed to remove embeddings");
    }

    const removedCount = count || 0;
    console.log(`Removed ${removedCount} embeddings for tenant ${tenant_id}`);

    // Log the action
    await supabase.from("vector_index_logs").insert({
      tenant_id,
      action: record_id ? "remove" : "bulk_delete",
      source_type: source_type || null,
      record_id: record_id || null,
      records_affected: removedCount,
      performed_by: user.id,
      metadata: {
        scope: record_id ? "record" : source_type ? "source_type" : "tenant",
      },
    });

    return jsonOk({
      message: `Removed ${removedCount} embeddings`,
      removed: removedCount,
      scope: {
        tenant_id,
        source_type: source_type || "all",
        record_id: record_id || "all",
      },
    });

  } catch (err) {
    console.error("Vector index remove error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});
