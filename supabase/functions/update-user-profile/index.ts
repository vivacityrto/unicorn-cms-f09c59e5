import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type UpdateProfileBody = {
  user_uuid: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  job_title?: string;
  mobile_phone?: string;
  timezone?: string;
  bio?: string;
  email?: string;
  personal_email?: string;
  personal_phone?: string;
  user_type?: string;
  unicorn_role?: string;
  archived?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const body = (await req.json()) as UpdateProfileBody;
    const { user_uuid, user_type, unicorn_role, archived, email, ...updates } = body;

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

    // Check if user is editing themselves or if they're an admin
    const isSelf = currentUser.id === user_uuid;
    
    // Vivacity staff permission via central RPC (used for admin path + protected fields)
    const { data: vivacityAllowed } = await supabase.rpc('check_permission', {
      p_user_id: currentUser.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });
    const isSuperAdmin = !!vivacityAllowed;

    if (!isSelf) {
      if (!isSuperAdmin) {
        // Get current user's role/tenant (needed for client-admin path)
        const { data: currentUserData } = await supabase
          .from("users")
          .select("unicorn_role, user_type, tenant_id")
          .eq("user_uuid", currentUser.id)
          .single();

        // Get target user's tenant to check if same as current user's tenant
        const { data: targetUserData } = await supabase
          .from("users")
          .select("tenant_id")
          .eq("user_uuid", user_uuid)
          .single();

        const isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
          (currentUserData?.user_type === "Client Parent" || currentUserData?.user_type === "Client") &&
          targetUserData?.tenant_id === currentUserData?.tenant_id;

        if (!isClientAdmin) {
          return jsonErr(req, 403, "FORBIDDEN", "You don't have permission to edit this user");
        }
      }
    }

    // Build update payload - only Super Admins can update user_type and unicorn_role
    const updatePayload: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (isSuperAdmin) {
      if (user_type) updatePayload.user_type = user_type;
      if (unicorn_role) updatePayload.unicorn_role = unicorn_role;
      if (archived !== undefined) updatePayload.archived = archived;
      if (email) updatePayload.email = email.trim().toLowerCase();
    } else if (user_type || unicorn_role || archived !== undefined || email) {
      console.log("Non-Super Admin attempted to change protected fields - ignoring");
    }

    // Update the user
    const { error: updateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("user_uuid", user_uuid);

    if (updateError) {
      return jsonErr(req, 400, "UPDATE_FAILED", updateError.message);
    }

    // Audit log
    await supabase.from("audit_eos_events").insert({
      user_id: currentUser.id,
      entity: "users",
      entity_id: user_uuid,
      action: "profile_updated",
      reason: isSelf ? "User updated own profile" : "Admin updated user profile",
      details: updates,
    });

    console.log(`Profile updated successfully for ${user_uuid}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...corsHeaders(req) },
      status: 200,
    });
  } catch (e: any) {
    console.error("Error updating profile:", e);
    return jsonErr(req, 500, "UNHANDLED", e?.message ?? String(e));
  }
});

function jsonErr(req: Request, status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders(req) },
    status,
  });
}
