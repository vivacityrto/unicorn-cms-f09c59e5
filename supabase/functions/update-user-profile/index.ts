import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type UpdateProfileBody = {
  user_uuid: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  mobile_phone?: string;
  timezone?: string;
  bio?: string;
  user_type?: string;
  unicorn_role?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as UpdateProfileBody;
    const { user_uuid, user_type, unicorn_role, ...updates } = body;

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

    // Check if user is editing themselves or if they're an admin
    const isSelf = currentUser.id === user_uuid;
    
    if (!isSelf) {
      // Get current user's role and tenant
      const { data: currentUserData, error: currentUserError } = await supabase
        .from("users")
        .select("unicorn_role, user_type, tenant_id")
        .eq("user_uuid", currentUser.id)
        .single();

      console.log("Current user data:", currentUserData);
      console.log("Current user error:", currentUserError);

      const isSuperAdmin = currentUserData?.unicorn_role === "Super Admin" && 
        (currentUserData?.user_type === "Vivacity Team" || currentUserData?.user_type === "Vivacity");

      console.log("Is super admin:", isSuperAdmin);

      if (!isSuperAdmin) {
        // Get target user's tenant to check if same as current user's tenant
        const { data: targetUserData, error: targetUserError } = await supabase
          .from("users")
          .select("tenant_id")
          .eq("user_uuid", user_uuid)
          .single();

        console.log("Target user data:", targetUserData);
        console.log("Target user error:", targetUserError);

        const isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
          (currentUserData?.user_type === "Client Parent" || currentUserData?.user_type === "Client") &&
          targetUserData?.tenant_id === currentUserData?.tenant_id;

        console.log("Is client admin:", isClientAdmin);

        if (!isClientAdmin) {
          return jsonErr(403, "FORBIDDEN", "You don't have permission to edit this user");
        }
      }
    }

    // Build update payload - only Super Admins can update user_type and unicorn_role
    const updatePayload: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Only allow Super Admins to change user_type and unicorn_role
    const { data: currentUserData2 } = await supabase
      .from("users")
      .select("unicorn_role, user_type")
      .eq("user_uuid", currentUser.id)
      .single();

    const isSuperAdminForRoleChange = currentUserData2?.unicorn_role === "Super Admin" && 
      (currentUserData2?.user_type === "Vivacity Team" || currentUserData2?.user_type === "Vivacity");

    if (isSuperAdminForRoleChange) {
      if (user_type) updatePayload.user_type = user_type;
      if (unicorn_role) updatePayload.unicorn_role = unicorn_role;
    } else if (user_type || unicorn_role) {
      console.log("Non-Super Admin attempted to change user_type or unicorn_role - ignoring");
    }

    // Update the user
    const { error: updateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("user_uuid", user_uuid);

    if (updateError) {
      return jsonErr(400, "UPDATE_FAILED", updateError.message);
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
      headers: { "content-type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (e: any) {
    console.error("Error updating profile:", e);
    return jsonErr(500, "UNHANDLED", e?.message ?? String(e));
  }
});

function jsonErr(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders },
    status,
  });
}
