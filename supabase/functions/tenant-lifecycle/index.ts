/**
 * Tenant Lifecycle Management Edge Function
 *
 * Handles lifecycle transitions: suspend, close, archive, reactivate.
 *
 * POST /tenant-lifecycle
 * Body: { tenant_id: number, action: string, reason?: string }
 *
 * Actions: suspend, close, archive, reactivate
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractToken, verifyAuth, checkSuperAdmin, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { jsonOk, jsonError, handleCors, CommonErrors } from "../_shared/response-helpers.ts";

// Valid lifecycle transitions: [current_status] -> [allowed next statuses]
const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ["suspended", "closed"],
  suspended: ["active"],
  closed: ["archived"],
  archived: ["active"],
};

// Which actions map to which target lifecycle_status
const ACTION_TARGET: Record<string, string> = {
  suspend: "suspended",
  close: "closed",
  archive: "archived",
  reactivate: "active",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return CommonErrors.methodNotAllowed();

  // Auth
  const token = extractToken(req);
  if (!token) return CommonErrors.unauthorized();

  const supabase = createServiceClient();
  const { user, profile, error: authError } = await verifyAuth(supabase, token);
  if (authError || !user || !profile) return jsonError(401, "UNAUTHORIZED", authError || "Auth failed");

  // Must be Vivacity staff
  if (!checkVivacityTeam(profile)) return CommonErrors.forbidden();

  // Parse body
  let body: { tenant_id?: number; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return CommonErrors.badRequest("Invalid JSON body");
  }

  const { tenant_id, action, reason } = body;

  // Validate input
  if (!tenant_id || typeof tenant_id !== "number") {
    return CommonErrors.badRequest("tenant_id (number) is required");
  }
  if (!action || !ACTION_TARGET[action]) {
    return CommonErrors.badRequest(`action must be one of: ${Object.keys(ACTION_TARGET).join(", ")}`);
  }
  if (action === "close" && (!reason || reason.trim().length === 0)) {
    return CommonErrors.badRequest("reason is required for close action");
  }

  const targetStatus = ACTION_TARGET[action];

  // Fetch current tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, lifecycle_status, access_status")
    .eq("id", tenant_id)
    .single();

  if (tenantError || !tenant) return CommonErrors.notFound("Tenant");

  const currentStatus = tenant.lifecycle_status;

  // Validate transition
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return jsonError(400, "INVALID_TRANSITION",
      `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed?.join(", ") || "none"}`);
  }

  // Reactivate from archived requires SuperAdmin
  if (currentStatus === "archived" && targetStatus === "active") {
    if (!checkSuperAdmin(profile)) {
      return jsonError(403, "FORBIDDEN", "Only SuperAdmin can reactivate archived tenants");
    }
  }

  // Archive requires SuperAdmin
  if (action === "archive") {
    if (!checkSuperAdmin(profile)) {
      return jsonError(403, "FORBIDDEN", "Only SuperAdmin can archive tenants");
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    lifecycle_status: targetStatus,
  };

  if (action === "close") {
    updatePayload.access_status = "disabled";
    updatePayload.closed_at = new Date().toISOString();
    updatePayload.closed_reason = reason!.trim();
  } else if (action === "suspend") {
    updatePayload.access_status = "disabled";
  } else if (action === "archive") {
    updatePayload.archived_at = new Date().toISOString();
  } else if (action === "reactivate") {
    updatePayload.access_status = "enabled";
    // Clear closure fields on reactivation
    updatePayload.closed_at = null;
    updatePayload.closed_reason = null;
    updatePayload.archived_at = null;
  }

  // Execute update
  const { data: updated, error: updateError } = await supabase
    .from("tenants")
    .update(updatePayload)
    .eq("id", tenant_id)
    .select("id, name, lifecycle_status, access_status, closed_at, closed_reason, archived_at")
    .single();

  if (updateError) {
    console.error("Tenant update error:", updateError);
    return CommonErrors.internalError("Failed to update tenant lifecycle");
  }

  // Write audit log (trigger handles lifecycle_status change, but we write an explicit action log too)
  const auditAction = `client_${action}${action === "close" ? "d" : action === "archive" ? "d" : action === "suspend" ? "ed" : "d"}`;
  const { error: auditError } = await supabase
    .from("client_audit_log")
    .insert({
      tenant_id: tenant_id,
      actor_user_id: user.id,
      action: auditAction,
      entity_type: "tenant",
      entity_id: String(tenant_id),
      details: {
        reason: reason?.trim() || null,
        transition: `${currentStatus} → ${targetStatus}`,
      },
      before_data: {
        lifecycle_status: currentStatus,
        access_status: tenant.access_status,
      },
      after_data: {
        lifecycle_status: targetStatus,
        access_status: updatePayload.access_status ?? tenant.access_status,
      },
    });

  if (auditError) {
    console.error("Audit log error:", auditError);
    // Don't fail the request — the trigger also logs
  }

  return jsonOk({
    tenant_id: updated.id,
    name: updated.name,
    lifecycle_status: updated.lifecycle_status,
    access_status: updated.access_status,
    closed_at: updated.closed_at,
    closed_reason: updated.closed_reason,
    archived_at: updated.archived_at,
    transition: `${currentStatus} → ${targetStatus}`,
  });
});
