import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";

type DeleteUserBody = {
  user_uuid: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const { user_uuid } = (await req.json()) as DeleteUserBody;

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
    const { data: currentUserData, error: currentUserError } = await supabase
      .from("users")
      .select("unicorn_role, user_type, tenant_id")
      .eq("user_uuid", currentUser.id)
      .single();

    console.log("Current user data:", currentUserData);
    console.log("Current user error:", currentUserError);

    // Vivacity staff permission check via central RPC
    const { data: vivacityAllowed } = await supabase.rpc('check_permission', {
      p_user_id: currentUser.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });
    const isSuperAdmin = !!vivacityAllowed;

    console.log("Is super admin:", isSuperAdmin);

    // Get target user's tenant
    const { data: targetUserData, error: targetUserError } = await supabase
      .from("users")
      .select("tenant_id, user_uuid, first_name, last_name, email")
      .eq("user_uuid", user_uuid)
      .single();

    console.log("Target user data:", targetUserData);
    console.log("Target user error:", targetUserError);

    if (currentUser.id === user_uuid) {
      return jsonErr(req, 400, "SELF_DELETE_FORBIDDEN", "You cannot delete your own account");
    }

    // Check permissions
    const isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
                         currentUserData?.user_type === "Client Parent" &&
                         targetUserData?.tenant_id === currentUserData?.tenant_id;

    console.log("Is client admin:", isClientAdmin);

    if (!isSuperAdmin && !isClientAdmin) {
      return jsonErr(req, 403, "FORBIDDEN", "Only admins can delete users");
    }

    // Create admin client (without user context)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Do not remove the last active tenant administrator. Membership, rather
    // than the legacy profile role, is the authoritative tenant-admin record.
    if (targetUserData?.tenant_id) {
      const { data: targetMembership, error: targetMembershipError } = await supabaseAdmin
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", targetUserData.tenant_id)
        .eq("user_id", user_uuid)
        .eq("status", "active")
        .ilike("role", "admin")
        .maybeSingle();

      if (targetMembershipError) {
        return jsonErr(req, 500, "MEMBERSHIP_CHECK_FAILED", "Unable to verify tenant administrator safeguards");
      }

      if (targetMembership) {
        const { count, error: adminCountError } = await supabaseAdmin
          .from("tenant_members")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", targetUserData.tenant_id)
          .eq("status", "active")
          .ilike("role", "admin");

        if (adminCountError) {
          return jsonErr(req, 500, "MEMBERSHIP_CHECK_FAILED", "Unable to verify tenant administrator safeguards");
        }
        if ((count ?? 0) <= 1) {
          return jsonErr(req, 409, "LAST_ADMIN_FORBIDDEN", "Assign another active tenant administrator before deleting this user");
        }
      }
    }

    // Write the audit record before the irreversible Auth deletion.
    const { error: auditError } = await supabaseAdmin.from("audit_eos_events").insert({
      user_id: currentUser.id,
      entity: "users",
      entity_id: user_uuid,
      action: "user_deleted",
      reason: "User deleted by admin",
      details: { deleted_user_uuid: user_uuid },
    });
    if (auditError) {
      return jsonErr(req, 500, "AUDIT_WRITE_FAILED", "Unable to record the user removal");
    }

    console.log(`Attempting to delete user: ${user_uuid}`);
    
    // Try to delete from auth.users first (if exists)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user_uuid);
    
    if (authDeleteError) {
      // If user not found in auth, that's ok - might be archived or never had auth
      if (authDeleteError.status === 404 || authDeleteError.code === 'user_not_found') {
        console.log(`Auth user not found (may be archived), proceeding to delete from users table`);
      } else {
        console.error("Auth delete error:", authDeleteError);
        return jsonErr(req, 400, "DELETE_FAILED", "Unable to delete user account");
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
      return jsonErr(req, 400, "DELETE_FAILED", "Unable to remove user record");
    }

    console.log(`Successfully deleted user ${user_uuid} from users table`);

    // Client Timeline — account removed
    if (targetUserData?.tenant_id) {
      const fullName = [targetUserData.first_name, targetUserData.last_name]
        .filter(Boolean).join(' ').trim() || targetUserData.email || 'user';
      await emitTimelineEvent(supabase, {
        tenant_id: targetUserData.tenant_id,
        client_id: String(targetUserData.tenant_id),
        event_type: 'account_removed',
        title: `Account removed: ${fullName}`,
        source: 'user',
        visibility: 'internal',
        entity_type: 'user',
        entity_id: user_uuid,
        created_by: currentUser.id,
        metadata: {
          removed_email: targetUserData.email ?? null,
          removed_name: fullName,
        },
      });
    }

    console.log(`User ${user_uuid} deleted successfully`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...corsHeaders(req) },
      status: 200,
    });
  } catch (e: unknown) {
    console.error("Error deleting user:", e);
    return jsonErr(req, 500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

function jsonErr(req: Request, status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders(req) },
    status,
  });
}
