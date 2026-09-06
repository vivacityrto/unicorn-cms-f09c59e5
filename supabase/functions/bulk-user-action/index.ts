import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface TargetUser {
  user_uuid: string;
  tenant_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  unicorn_role: string | null;
}

type BulkActionBody = {
  user_uuids: string[];
  action: 'activate' | 'deactivate' | 'change_role';
  role?: 'Admin' | 'General User';
};

// Runtime allowlist — the TypeScript union above only constrains the
// compiler, not the JSON body an attacker (or a buggy caller) can send.
// bulk-user-action manages CLIENT tenant users; without this check a
// caller could set role to any value accepted by the users.unicorn_role
// FK (e.g. "Super Admin", "Team Leader") and grant a client user internal
// Vivacity staff privileges across every tenant.
const ALLOWED_ROLES = new Set(['Admin', 'General User']);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const body = await req.json() as BulkActionBody;
    const { user_uuids, action, role } = body;

    // Validate input
    if (!Array.isArray(user_uuids) || user_uuids.length === 0) {
      return jsonErr(req, 400, "MISSING_USERS", "At least one user UUID is required");
    }

    if (!['activate', 'deactivate', 'change_role'].includes(action)) {
      return jsonErr(req, 400, "INVALID_ACTION", "Action must be activate, deactivate, or change_role");
    }

    if (action === 'change_role' && !role) {
      return jsonErr(req, 400, "MISSING_ROLE", "Role is required for change_role action");
    }

    if (action === 'change_role' && role && !ALLOWED_ROLES.has(role)) {
      return jsonErr(req, 400, "INVALID_ROLE", `Role must be one of: ${[...ALLOWED_ROLES].join(", ")}`);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr(req, 401, "UNAUTHORIZED", "No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !currentUser) {
      return jsonErr(req, 401, "UNAUTHORIZED", "Invalid token");
    }

    // Verify permission via central RPC
    const { data: allowed } = await supabase.rpc('check_permission', {
      p_user_id: currentUser.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });

    if (!allowed) {
      return jsonErr(req, 403, "FORBIDDEN", "You do not have permission to perform bulk user actions");
    }

    // Get tenant_id for audit logging (use first user's tenant)
    const { data: firstUser } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user_uuids[0])
      .single();

    const tenantId = firstUser?.tenant_id || 1;

    // Load target users up-front so we can emit precise timeline events
    const { data: targetUsers } = await supabase
      .from("users")
      .select("user_uuid, tenant_id, first_name, last_name, email, unicorn_role")
      .in("user_uuid", user_uuids);
    const targetByUuid = new Map(
      (targetUsers || []).map((u) => [u.user_uuid, u as TargetUser] as const),
    );

    // All-or-nothing: every requested UUID must resolve to a real user
    // before any mutation runs. Without this, a batch containing typos or
    // stale/already-deleted UUIDs would silently apply to the subset that
    // matched and report partial success without the caller knowing which
    // targets were skipped.
    const missingUuids = user_uuids.filter((uuid) => !targetByUuid.has(uuid));
    if (missingUuids.length > 0) {
      return jsonErr(
        req,
        400,
        "UNKNOWN_TARGET_USERS",
        `${missingUuids.length} target user(s) not found: ${missingUuids.join(", ")}`,
      );
    }

    let successUuids: string[] = [];

    if (action === 'activate' || action === 'deactivate') {
      // Route through central RPC so each toggle writes the timeline event atomically.
      // The RPC reads auth.uid(); we must forward the caller's JWT so it isn't NULL.
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const disabled = action === 'deactivate';
      for (const uuid of user_uuids) {
        const { data: rpcResult, error: rpcError } = await callerClient.rpc(
          'rpc_set_client_account_status',
          { p_user_uuid: uuid, p_disabled: disabled },
        );
        if (rpcError) {
          console.warn(`rpc_set_client_account_status failed for ${uuid}:`, rpcError.message);
          continue;
        }
        const res = rpcResult as { success: boolean; error?: string } | null;
        if (res?.success) successUuids.push(uuid);
        else console.warn(`rpc_set_client_account_status refused ${uuid}:`, res?.error);
      }
    } else if (action === 'change_role' && role) {
      // Allowlisted write: unicorn_role + updated_at only. Never spread request body.
      const { data: updatedUsers, error: updateError } = await supabase
        .from("users")
        .update({ unicorn_role: role, updated_at: new Date().toISOString() })
        .in("user_uuid", user_uuids)
        .select("user_uuid");

      if (updateError) {
        console.error("Update error:", updateError);
        return jsonErr(req, 400, "UPDATE_FAILED", updateError.message);
      }
      successUuids = (updatedUsers || []).map((u) => u.user_uuid);

      // Emit one timeline event per role change
      for (const uuid of successUuids) {
        const target = targetByUuid.get(uuid);
        if (!target?.tenant_id) continue;
        const fullName = [target.first_name, target.last_name].filter(Boolean).join(' ').trim() || target.email || 'user';
        await emitTimelineEvent(supabase, {
          tenant_id: target.tenant_id,
          client_id: String(target.tenant_id),
          event_type: 'account_role_changed',
          title: `Role changed: ${fullName} → ${role}`,
          source: 'user',
          visibility: 'internal',
          entity_type: 'user',
          entity_id: uuid,
          created_by: currentUser.id,
          metadata: {
            previous_role: target.unicorn_role ?? null,
            new_role: role,
            target_email: target.email ?? null,
            target_name: fullName,
          },
        });
      }
    }

    const updatedUsers = successUuids.map((user_uuid) => ({ user_uuid }));

    // Create audit log entries
    const auditEntries = user_uuids.map(uuid => ({
      user_id: currentUser.id,
      entity: "users",
      entity_id: uuid,
      action: `bulk_${action}`,
      reason: `Bulk ${action} by SuperAdmin`,
      details: { action, role, affected_users: user_uuids.length },
      tenant_id: tenantId,
    }));

    const { error: auditError } = await supabase.from("audit_eos_events").insert(auditEntries);
    if (auditError) {
      console.warn("Audit log error (non-fatal):", auditError);
    }

    console.log(`Bulk ${action} completed: ${updatedUsers?.length || 0} users updated by ${currentUser.email}`);

    return new Response(JSON.stringify({ 
      ok: true, 
      successCount: updatedUsers?.length || 0,
      requestedCount: user_uuids.length,
    }), {
      headers: { "content-type": "application/json", ...corsHeaders(req) },
      status: 200,
    });
  } catch (e: unknown) {
    console.error("Error in bulk-user-action:", e);
    return jsonErr(req, 500, "UNHANDLED", e instanceof Error ? e.message : String(e));
  }
});

function jsonErr(req: Request, status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders(req) },
    status,
  });
}
