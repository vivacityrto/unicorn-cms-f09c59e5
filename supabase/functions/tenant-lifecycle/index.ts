/**
 * Tenant Lifecycle Management Edge Function
 *
 * Handles lifecycle transitions: suspend, close, archive, reactivate.
 *
 * POST /tenant-lifecycle
 * Body: { tenant_id: number, action: string, reason?: string, force_override?: boolean }
 *
 * Actions: suspend, close, archive, reactivate
 *
 * Governance safeguards:
 * - Duplicate close blocked (already closed → 400)
 * - Reactivation requires reason (appended to closed_reason, audit logged)
 * - Archive locked unless closed_at > 30 days (SuperAdmin can override)
 */

import { extractToken, verifyAuth, checkSuperAdmin, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { jsonOk, jsonError, handleCors, CommonErrors } from "../_shared/response-helpers.ts";

const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ["suspended", "closed"],
  suspended: ["active"],
  closed: ["archived"],
  archived: ["active"],
};

const ACTION_TARGET: Record<string, string> = {
  suspend: "suspended",
  close: "closed",
  archive: "archived",
  reactivate: "active",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return CommonErrors.methodNotAllowed();

  const token = extractToken(req);
  if (!token) return CommonErrors.unauthorized();

  const supabase = createServiceClient();
  const { user, profile, error: authError } = await verifyAuth(supabase, token);
  if (authError || !user || !profile) return jsonError(401, "UNAUTHORIZED", authError || "Auth failed");

  if (!checkVivacityTeam(profile)) return CommonErrors.forbidden();

  let body: { tenant_id?: number; action?: string; reason?: string; force_override?: boolean };
  try {
    body = await req.json();
  } catch {
    return CommonErrors.badRequest("Invalid JSON body");
  }

  const { tenant_id, action, reason, force_override } = body;

  if (!tenant_id || typeof tenant_id !== "number") {
    return CommonErrors.badRequest("tenant_id (number) is required");
  }
  if (!action || !ACTION_TARGET[action]) {
    return CommonErrors.badRequest(`action must be one of: ${Object.keys(ACTION_TARGET).join(", ")}`);
  }
  if (action === "close" && (!reason || reason.trim().length === 0)) {
    return CommonErrors.badRequest("reason is required for close action");
  }
  // Phase 6: Reactivation requires reason
  if (action === "reactivate" && (!reason || reason.trim().length === 0)) {
    return CommonErrors.badRequest("reason is required for reactivate action");
  }

  const targetStatus = ACTION_TARGET[action];

  // Fetch current tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, lifecycle_status, access_status, closed_at, closed_reason")
    .eq("id", tenant_id)
    .single();

  if (tenantError || !tenant) return CommonErrors.notFound("Tenant");

  const currentStatus = tenant.lifecycle_status;

  // Phase 6: Prevent duplicate close
  if (action === "close" && currentStatus === "closed") {
    return jsonError(400, "ALREADY_CLOSED", "This tenant is already closed. No duplicate close permitted.");
  }

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

    // Phase 6: Lock archive unless closed_at > 30 days (SuperAdmin can override)
    if (tenant.closed_at) {
      const closedDate = new Date(tenant.closed_at);
      const daysSinceClosed = (Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceClosed < 30 && !force_override) {
        return jsonError(400, "ARCHIVE_TOO_EARLY",
          `Cannot archive: tenant was closed ${Math.floor(daysSinceClosed)} day(s) ago. Must wait 30 days, or use force_override=true (SuperAdmin only).`);
      }
    }
  }

  // === CLOSE-SPECIFIC LOGIC ===
  if (action === "close") {
    const safetyResult = await runCloseSafetyChecks(supabase, tenant_id, !!force_override);
    if (safetyResult.blocked) {
      return jsonError(400, "CLOSE_BLOCKED", safetyResult.message);
    }
    return await executeCloseTransaction(supabase, tenant_id, reason!.trim(), user.id, tenant);
  }

  // === REACTIVATE-SPECIFIC LOGIC ===
  if (action === "reactivate") {
    return await executeReactivation(supabase, tenant_id, reason!.trim(), user.id, tenant);
  }

  // Non-close, non-reactivate actions: simple update
  const updatePayload: Record<string, unknown> = {
    lifecycle_status: targetStatus,
  };

  if (action === "suspend") {
    updatePayload.access_status = "disabled";
  } else if (action === "archive") {
    updatePayload.archived_at = new Date().toISOString();
  }

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

  await writeAuditLog(supabase, tenant_id, user.id, action, reason, currentStatus, targetStatus, tenant.access_status, updatePayload.access_status ?? tenant.access_status);

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

// ──────────────────────────────────────────────
// Safety checks for the Close action
// ──────────────────────────────────────────────

interface SafetyResult {
  blocked: boolean;
  message: string;
  warnings: string[];
}

async function runCloseSafetyChecks(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: number,
  forceOverride: boolean,
): Promise<SafetyResult> {
  const warnings: string[] = [];

  const { data: unreleasedDocs, error: docErr } = await supabase
    .from("document_instances")
    .select("id, document_id, stageinstance_id, status")
    .eq("tenant_id", tenantId)
    .eq("isgenerated", true)
    .not("status", "eq", "released");

  if (docErr) {
    console.error("Safety check - unreleased docs error:", docErr);
  }

  if (unreleasedDocs && unreleasedDocs.length > 0) {
    const docIds = unreleasedDocs.map(d => d.id);
    const { data: releases } = await supabase
      .from("tenant_document_releases")
      .select("document_id")
      .eq("tenant_id", tenantId)
      .in("document_id", docIds);

    const releasedDocIds = new Set((releases || []).map(r => r.document_id));
    const trulyUnreleased = unreleasedDocs.filter(d => !releasedDocIds.has(d.id));

    if (trulyUnreleased.length > 0 && !forceOverride) {
      return {
        blocked: true,
        message: `Cannot close: ${trulyUnreleased.length} generated document(s) have not been released. Release or discard them first, or use force_override=true.`,
        warnings,
      };
    }

    if (trulyUnreleased.length > 0 && forceOverride) {
      warnings.push(`${trulyUnreleased.length} generated document(s) not released (overridden)`);
    }
  }

  const { data: riskFlags, error: riskErr } = await supabase
    .from("compliance_risk_flags")
    .select("id, risk_key, severity")
    .eq("tenant_id", tenantId)
    .eq("resolved", false);

  if (riskErr) {
    console.error("Safety check - risk flags error:", riskErr);
  }

  if (riskFlags && riskFlags.length > 0) {
    warnings.push(`${riskFlags.length} unresolved compliance risk flag(s) exist`);
  }

  return { blocked: false, message: "", warnings };
}

// ──────────────────────────────────────────────
// Atomic close transaction
// ──────────────────────────────────────────────

async function executeCloseTransaction(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: number,
  reason: string,
  actorUserId: string,
  tenant: { lifecycle_status: string; access_status: string; name: string },
) {
  const now = new Date().toISOString();

  // Step 1: Close open stage_instances
  const { data: openStages, error: stagesQueryErr } = await supabase
    .from("stage_instances")
    .select("id, status, packageinstance_id, package_instances!inner(tenant_id)")
    .eq("package_instances.tenant_id", tenantId)
    .in("status", ["not_started", "in_progress", "1", "3"]);

  if (stagesQueryErr) {
    console.error("Close: failed to query open stages:", stagesQueryErr);
    return CommonErrors.internalError("Failed to query open stages");
  }

  const stageIds = (openStages || []).map(s => s.id);
  let stagesClosed = 0;

  if (stageIds.length > 0) {
    const { error: stagesUpdateErr, count } = await supabase
      .from("stage_instances")
      .update({ status: "closed", status_date: now })
      .in("id", stageIds);

    if (stagesUpdateErr) {
      console.error("Close: failed to close stages:", stagesUpdateErr);
      return CommonErrors.internalError("Failed to close stage instances");
    }
    stagesClosed = count ?? stageIds.length;
  }

  // Step 2: Cancel open tasks
  const { data: openTasks, error: tasksQueryErr } = await supabase
    .from("client_task_instances")
    .select("id, status, stage_instances!inner(packageinstance_id, package_instances!inner(tenant_id))")
    .eq("stage_instances.package_instances.tenant_id", tenantId)
    .in("status", [0, 2]);

  if (tasksQueryErr) {
    console.error("Close: failed to query open tasks:", tasksQueryErr);
  }

  const taskIds = (openTasks || []).map(t => t.id);
  let tasksCancelled = 0;

  if (taskIds.length > 0) {
    const { error: tasksUpdateErr, count } = await supabase
      .from("client_task_instances")
      .update({ status: 3, completion_date: now })
      .in("id", taskIds);

    if (tasksUpdateErr) {
      console.error("Close: failed to cancel tasks:", tasksUpdateErr);
    }
    tasksCancelled = count ?? taskIds.length;
  }

  // Step 3: Update tenant
  const { data: updated, error: updateError } = await supabase
    .from("tenants")
    .update({
      lifecycle_status: "closed",
      access_status: "disabled",
      closed_at: now,
      closed_reason: reason,
    })
    .eq("id", tenantId)
    .select("id, name, lifecycle_status, access_status, closed_at, closed_reason, archived_at")
    .single();

  if (updateError) {
    console.error("Close: tenant update error:", updateError);
    return CommonErrors.internalError("Failed to update tenant lifecycle");
  }

  await writeAuditLog(
    supabase, tenantId, actorUserId, "close", reason,
    tenant.lifecycle_status, "closed",
    tenant.access_status, "disabled",
    { stages_closed: stagesClosed, tasks_cancelled: tasksCancelled },
  );

  return jsonOk({
    tenant_id: updated.id,
    name: updated.name,
    lifecycle_status: updated.lifecycle_status,
    access_status: updated.access_status,
    closed_at: updated.closed_at,
    closed_reason: updated.closed_reason,
    archived_at: updated.archived_at,
    transition: `${tenant.lifecycle_status} → closed`,
    automation: {
      stages_closed: stagesClosed,
      tasks_cancelled: tasksCancelled,
    },
  });
}

// ──────────────────────────────────────────────
// Reactivation with reason logging
// ──────────────────────────────────────────────

async function executeReactivation(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: number,
  reason: string,
  actorUserId: string,
  tenant: { lifecycle_status: string; access_status: string; name: string; closed_reason: string | null },
) {
  // Append reactivation note to closed_reason for history
  const reactivationNote = `[Reactivated ${new Date().toISOString().slice(0, 10)}] ${reason}`;
  const updatedClosedReason = tenant.closed_reason
    ? `${tenant.closed_reason}\n${reactivationNote}`
    : reactivationNote;

  const { data: updated, error: updateError } = await supabase
    .from("tenants")
    .update({
      lifecycle_status: "active",
      access_status: "enabled",
      closed_at: null,
      closed_reason: updatedClosedReason,
      archived_at: null,
    })
    .eq("id", tenantId)
    .select("id, name, lifecycle_status, access_status, closed_at, closed_reason, archived_at")
    .single();

  if (updateError) {
    console.error("Reactivate: tenant update error:", updateError);
    return CommonErrors.internalError("Failed to reactivate tenant");
  }

  await writeAuditLog(
    supabase, tenantId, actorUserId, "reactivate", reason,
    tenant.lifecycle_status, "active",
    tenant.access_status, "enabled",
    { reactivation_reason: reason },
  );

  return jsonOk({
    tenant_id: updated.id,
    name: updated.name,
    lifecycle_status: updated.lifecycle_status,
    access_status: updated.access_status,
    closed_at: updated.closed_at,
    closed_reason: updated.closed_reason,
    archived_at: updated.archived_at,
    transition: `${tenant.lifecycle_status} → active`,
  });
}

// ──────────────────────────────────────────────
// Audit log helper
// ──────────────────────────────────────────────

async function writeAuditLog(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: number,
  actorUserId: string,
  action: string,
  reason: string | undefined | null,
  prevLifecycle: string,
  newLifecycle: string,
  prevAccess: unknown,
  newAccess: unknown,
  extraDetails?: Record<string, unknown>,
) {
  const auditAction = `client_${action}${action === "close" ? "d" : action === "archive" ? "d" : action === "suspend" ? "ed" : "d"}`;

  const { error: auditError } = await supabase
    .from("client_audit_log")
    .insert({
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      action: auditAction,
      entity_type: "tenant",
      entity_id: String(tenantId),
      details: {
        reason: reason?.trim() || null,
        transition: `${prevLifecycle} → ${newLifecycle}`,
        ...extraDetails,
      },
      before_data: {
        lifecycle_status: prevLifecycle,
        access_status: prevAccess,
      },
      after_data: {
        lifecycle_status: newLifecycle,
        access_status: newAccess,
      },
    });

  if (auditError) {
    console.error("Audit log error:", auditError);
  }
}
