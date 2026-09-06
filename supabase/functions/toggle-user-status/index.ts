import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type ToggleStatusBody = {
  user_uuid: string;
  disabled: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const { user_uuid, disabled } = (await req.json()) as ToggleStatusBody;

    if (!user_uuid) {
      return jsonErr(req, 400, "MISSING_USER_ID", "User UUID is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    // Get current user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr(req, 401, "UNAUTHORIZED", "No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !currentUser) {
      return jsonErr(req, 401, "UNAUTHORIZED", "Invalid token");
    }

    // Get current user's role (still needed for client-admin path)
    const { data: currentUserData } = await supabase
      .from("users")
      .select("unicorn_role, user_type, tenant_id")
      .eq("user_uuid", currentUser.id)
      .single();

    // Vivacity staff permission check via central RPC
    const { data: vivacityAllowed } = await supabase.rpc('check_permission', {
      p_user_id: currentUser.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });
    const isSuperAdmin = !!vivacityAllowed;

    // Get target user's tenant
    const { data: targetUserData } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user_uuid)
      .single();

    // Check permissions
    const isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
                         (currentUserData?.user_type === "Client" || currentUserData?.user_type === "Client Parent") &&
                         targetUserData?.tenant_id === currentUserData?.tenant_id;

    if (!isSuperAdmin && !isClientAdmin) {
      return jsonErr(req, 403, "FORBIDDEN", "Only admins can change user status");
    }

    // Route through central RPC — writes the disabled toggle AND the timeline event
    // in one transaction, and re-checks permissions server-side.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'rpc_set_client_account_status',
      { p_user_uuid: user_uuid, p_disabled: disabled },
    );

    if (rpcError) {
      return jsonErr(req, 400, "UPDATE_FAILED", rpcError.message);
    }
    const res = rpcResult as { success: boolean; error?: string; unchanged?: boolean } | null;
    if (res && !res.success) {
      const isForbidden = (res.error || '').toLowerCase().includes('forbidden');
      return jsonErr(req, isForbidden ? 403 : 400, isForbidden ? "FORBIDDEN" : "UPDATE_FAILED", res.error || "RPC refused update");
    }

    // Audit log
    await supabase.from("audit_eos_events").insert({
      user_id: currentUser.id,
      entity: "users",
      entity_id: user_uuid,
      action: disabled ? "user_deactivated" : "user_activated",
      reason: `User ${disabled ? "deactivated" : "activated"} by admin`,
      details: { disabled },
    });

    console.log(`User ${user_uuid} status changed to ${disabled ? "disabled" : "enabled"}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...corsHeaders(req) },
      status: 200,
    });
  } catch (e: unknown) {
    console.error("Error toggling user status:", e);
    return jsonErr(req, 500, "UNHANDLED", e instanceof Error ? e.message : String(e));
  }
});

function jsonErr(req: Request, status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders(req) },
    status,
  });
}
