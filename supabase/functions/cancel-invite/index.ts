import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { ok: false, detail: "Missing authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return jsonResponse(401, { ok: false, detail: "Invalid token" });
    }

    // Get caller's profile to check permissions
    const { data: callerProfile, error: profileError } = await supabase
      .from("users")
      .select("user_uuid, global_role, unicorn_role, email, first_name, last_name")
      .eq("user_uuid", user.id)
      .single();

    if (profileError || !callerProfile) {
      console.error("Profile error:", profileError);
      return jsonResponse(403, { ok: false, detail: "Caller profile not found" });
    }

    const isSuperAdmin = 
      callerProfile.global_role === "SuperAdmin" || 
      callerProfile.unicorn_role === "Super Admin";

    if (!isSuperAdmin) {
      return jsonResponse(403, { ok: false, detail: "Only SuperAdmins can cancel invitations" });
    }

    // Parse request body
    const { invitation_id, reason } = await req.json();
    
    if (!invitation_id) {
      return jsonResponse(400, { ok: false, detail: "invitation_id is required" });
    }

    // Fetch the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("user_invitations")
      .select("id, email, status, accepted_at, tenant_id, first_name, last_name")
      .eq("id", invitation_id)
      .single();

    if (inviteError || !invitation) {
      console.error("Invitation fetch error:", inviteError);
      return jsonResponse(404, { ok: false, detail: "Invitation not found" });
    }

    // Check if already accepted
    if (invitation.accepted_at) {
      return jsonResponse(400, { ok: false, detail: "Cannot cancel an accepted invitation" });
    }

    // Check if already cancelled
    if (invitation.status === "cancelled") {
      return jsonResponse(400, { ok: false, detail: "Invitation is already cancelled" });
    }

    // Cancel the invitation
    const { error: updateError } = await supabase
      .from("user_invitations")
      .update({
        status: "cancelled",
        revoked_at: new Date().toISOString(),
        revoked_reason: reason || "Cancelled by admin",
        token_hash: null, // Clear the token to invalidate any existing links
      })
      .eq("id", invitation_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return jsonResponse(500, { ok: false, detail: "Failed to cancel invitation" });
    }

    // Log to audit_invites
    await supabase.from("audit_invites").insert({
      actor_user_id: user.id,
      email: invitation.email,
      tenant_id: invitation.tenant_id,
      outcome: "cancelled",
      role: "pending_user",
      detail: `Invitation cancelled by ${callerProfile.first_name} ${callerProfile.last_name}`,
      function_version: "cancel-invite-v1",
    });

    // Log to audit_eos_events
    await supabase.from("audit_eos_events").insert({
      tenant_id: invitation.tenant_id,
      user_id: user.id,
      entity: "invitation",
      entity_id: invitation_id,
      action: "cancelled",
      details: {
        email: invitation.email,
        cancelled_by: callerProfile.email,
        reason: reason || "Cancelled by admin",
      },
    });

    console.log(`Invitation ${invitation_id} cancelled by ${callerProfile.email}`);

    return jsonResponse(200, {
      ok: true,
      message: `Invitation for ${invitation.email} has been cancelled`,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, { ok: false, detail: "Internal server error" });
  }
});
