import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type ToggleStatusBody = {
  user_uuid: string;
  disabled: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_uuid, disabled } = (await req.json()) as ToggleStatusBody;

    if (!user_uuid) {
      return jsonErr(400, "MISSING_USER_ID", "User UUID is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    // Get current user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr(401, "UNAUTHORIZED", "No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !currentUser) {
      return jsonErr(401, "UNAUTHORIZED", "Invalid token");
    }

    // Get current user's role
    const { data: currentUserData } = await supabase
      .from("users")
      .select("unicorn_role, user_type, tenant_id")
      .eq("user_uuid", currentUser.id)
      .single();

    const isSuperAdmin = currentUserData?.unicorn_role === "Super Admin" && 
                        (currentUserData?.user_type === "Vivacity" || currentUserData?.user_type === "Vivacity Team");

    // Get target user's tenant
    const { data: targetUserData } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user_uuid)
      .single();

    // Check permissions
    const isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
                         currentUserData?.user_type === "Client" &&
                         targetUserData?.tenant_id === currentUserData?.tenant_id;

    if (!isSuperAdmin && !isClientAdmin) {
      return jsonErr(403, "FORBIDDEN", "Only admins can change user status");
    }

    // Update status
    const { error: updateError } = await supabase
      .from("users")
      .update({ disabled, updated_at: new Date().toISOString() })
      .eq("user_uuid", user_uuid);

    if (updateError) {
      return jsonErr(400, "UPDATE_FAILED", updateError.message);
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
      headers: { "content-type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (e: any) {
    console.error("Error toggling user status:", e);
    return jsonErr(500, "UNHANDLED", e?.message ?? String(e));
  }
});

function jsonErr(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders },
    status,
  });
}
