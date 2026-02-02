import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type BulkActionBody = {
  user_uuids: string[];
  action: 'activate' | 'deactivate' | 'change_role';
  role?: 'Admin' | 'General User';
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as BulkActionBody;
    const { user_uuids, action, role } = body;

    // Validate input
    if (!Array.isArray(user_uuids) || user_uuids.length === 0) {
      return jsonErr(400, "MISSING_USERS", "At least one user UUID is required");
    }

    if (!['activate', 'deactivate', 'change_role'].includes(action)) {
      return jsonErr(400, "INVALID_ACTION", "Action must be activate, deactivate, or change_role");
    }

    if (action === 'change_role' && !role) {
      return jsonErr(400, "MISSING_ROLE", "Role is required for change_role action");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr(401, "UNAUTHORIZED", "No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !currentUser) {
      return jsonErr(401, "UNAUTHORIZED", "Invalid token");
    }

    // Verify SuperAdmin status
    const { data: callerProfile } = await supabase
      .from("users")
      .select("global_role, unicorn_role, user_type")
      .eq("user_uuid", currentUser.id)
      .single();

    const isSuperAdmin = callerProfile?.global_role === 'SuperAdmin' ||
      (callerProfile?.unicorn_role === 'Super Admin' && 
       ['Vivacity', 'Vivacity Team'].includes(callerProfile?.user_type || ''));

    if (!isSuperAdmin) {
      return jsonErr(403, "FORBIDDEN", "Only SuperAdmins can perform bulk actions");
    }

    // Get tenant_id for audit logging (use first user's tenant)
    const { data: firstUser } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user_uuids[0])
      .single();

    const tenantId = firstUser?.tenant_id || 1;

    // Perform bulk update
    let updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    
    if (action === 'activate') {
      updateData.disabled = false;
    } else if (action === 'deactivate') {
      updateData.disabled = true;
    } else if (action === 'change_role' && role) {
      updateData.unicorn_role = role;
    }

    const { data: updatedUsers, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .in("user_uuid", user_uuids)
      .select("user_uuid");

    if (updateError) {
      console.error("Update error:", updateError);
      return jsonErr(400, "UPDATE_FAILED", updateError.message);
    }

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
      headers: { "content-type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (e: any) {
    console.error("Error in bulk-user-action:", e);
    return jsonErr(500, "UNHANDLED", e?.message ?? String(e));
  }
});

function jsonErr(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders },
    status,
  });
}
