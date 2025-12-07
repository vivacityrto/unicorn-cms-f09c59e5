import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type DeleteUserBody = {
  user_uuid: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_uuid } = (await req.json()) as DeleteUserBody;

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
    const { data: currentUserData, error: currentUserError } = await supabase
      .from("users")
      .select("unicorn_role, user_type, tenant_id")
      .eq("user_uuid", currentUser.id)
      .single();

    console.log("Current user data:", currentUserData);
    console.log("Current user error:", currentUserError);

    const isSuperAdmin = currentUserData?.unicorn_role === "Super Admin" && 
                        currentUserData?.user_type === "Vivacity Team";

    console.log("Is super admin:", isSuperAdmin);

    // Get target user's tenant
    const { data: targetUserData, error: targetUserError } = await supabase
      .from("users")
      .select("tenant_id, user_uuid")
      .eq("user_uuid", user_uuid)
      .single();

    console.log("Target user data:", targetUserData);
    console.log("Target user error:", targetUserError);

    // Check permissions
    const isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
                         currentUserData?.user_type === "Client Parent" &&
                         targetUserData?.tenant_id === currentUserData?.tenant_id;

    console.log("Is client admin:", isClientAdmin);

    if (!isSuperAdmin && !isClientAdmin) {
      return jsonErr(403, "FORBIDDEN", "Only admins can delete users");
    }

    // Create admin client (without user context)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Attempting to delete user: ${user_uuid}`);
    
    // Try to delete from auth.users first (if exists)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user_uuid);
    
    if (authDeleteError) {
      // If user not found in auth, that's ok - might be archived or never had auth
      if (authDeleteError.status === 404 || authDeleteError.code === 'user_not_found') {
        console.log(`Auth user not found (may be archived), proceeding to delete from users table`);
      } else {
        console.error("Auth delete error:", authDeleteError);
        return jsonErr(400, "DELETE_FAILED", authDeleteError.message);
      }
    } else {
      console.log(`Successfully deleted user ${user_uuid} from auth.users`);
    }

    // Delete from users table
    const { error: deleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("user_uuid", user_uuid);
    
    if (deleteError) {
      console.error("Users table delete error:", deleteError);
      return jsonErr(400, "DELETE_FAILED", deleteError.message);
    }

    console.log(`Successfully deleted user ${user_uuid} from users table`);

    // Audit log
    await supabase.from("audit_eos_events").insert({
      user_id: currentUser.id,
      entity: "users",
      entity_id: user_uuid,
      action: "user_deleted",
      reason: "User deleted by admin",
      details: { deleted_user_uuid: user_uuid },
    });

    console.log(`User ${user_uuid} deleted successfully`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (e: any) {
    console.error("Error deleting user:", e);
    return jsonErr(500, "UNHANDLED", e?.message ?? String(e));
  }
});

function jsonErr(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders },
    status,
  });
}
