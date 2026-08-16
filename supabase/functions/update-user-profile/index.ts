import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
import { applyUsersProfileUpdate } from "../_shared/users-write-allowlist.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr(req, 401, "UNAUTHORIZED", "No authorization header");
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonErr(req, 400, "BAD_JSON", "Invalid JSON body");
    }

    const user_uuid = typeof body.user_uuid === "string" ? body.user_uuid : "";
    if (!user_uuid) {
      return jsonErr(req, 400, "MISSING_USER_ID", "User UUID is required");
    }

    // JWT + anon key so the users UPDATE runs as `authenticated` and the
    // three RESTRICTIVE policies on public.users apply as designed.
    const userClient = createUserClient(authHeader);
    // Service role is scoped to the audit insert only.
    const serviceClient = createServiceClient();

    const { data: { user: currentUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !currentUser) {
      return jsonErr(req, 401, "UNAUTHORIZED", "Invalid token");
    }

    const { data: vivacityAllowed } = await userClient.rpc("check_permission", {
      p_user_id: currentUser.id,
      p_feature_key: "admin.team_users.manage",
      p_min_level: "full",
    });
    const hasManagePermission = !!vivacityAllowed;
    const isSelf = currentUser.id === user_uuid;

    let isClientAdmin = false;
    if (!isSelf && !hasManagePermission) {
      const { data: currentUserData } = await userClient
        .from("users")
        .select("unicorn_role, user_type, tenant_id")
        .eq("user_uuid", currentUser.id)
        .single();

      const { data: targetUserData } = await userClient
        .from("users")
        .select("tenant_id")
        .eq("user_uuid", user_uuid)
        .single();

      isClientAdmin = currentUserData?.unicorn_role === "Admin" &&
        (currentUserData?.user_type === "Client Parent" || currentUserData?.user_type === "Client") &&
        targetUserData?.tenant_id === currentUserData?.tenant_id;
    }

    const outcome = await applyUsersProfileUpdate({
      callerId: currentUser.id,
      targetUserUuid: user_uuid,
      hasManagePermission,
      isClientAdmin,
      body,
      updateRow: async (uuid, updates) => {
        const updatePayload = Object.assign({}, updates, {
          updated_at: new Date().toISOString(),
        });
        const { error: updateError } = await userClient
          .from("users")
          .update(updatePayload)
          .eq("user_uuid", uuid);

        if (updateError) {
          const isRls = updateError.code === "42501" ||
            /row-level security|permission denied/i.test(updateError.message);
          const err = new Error(updateError.message) as Error & { status?: number; code?: string };
          err.status = isRls ? 403 : 400;
          err.code = isRls ? "FORBIDDEN" : "UPDATE_FAILED";
          throw err;
        }
        return updatePayload;
      },
    });

    if (!outcome.ok) {
      return jsonErr(req, outcome.status, outcome.code, outcome.detail);
    }

    await serviceClient.from("audit_eos_events").insert({
      user_id: currentUser.id,
      entity: "users",
      entity_id: user_uuid,
      action: "profile_updated",
      reason: isSelf ? "User updated own profile" : "Admin updated user profile",
      details: outcome.updates,
    });

    console.log(`Profile updated successfully for ${user_uuid}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...corsHeaders(req) },
      status: 200,
    });
  } catch (e: any) {
    if (typeof e?.status === "number" && e?.code) {
      return jsonErr(req, e.status, e.code, e.message);
    }
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
