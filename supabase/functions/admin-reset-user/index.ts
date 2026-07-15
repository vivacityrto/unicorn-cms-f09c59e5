/**
 * HISTORICAL — admin-reset-user
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (gated; orphan — no in-repo callers).
 * Superseded by generate-recovery-link / send-password-reset.
 *
 * Provenance: reconstructed for keeper-repo reconciliation (14 Jul 2026 Unicorn
 * security audit follow-up) from independently verified live behavior
 * (get_edge_function / canAdministerPasswords contract) and live HTTP probes
 * matching NO_AUTH / AUTH_FAILED response shapes. Management API was unavailable
 * in the agent environment; replace with a byte-identical dump if one is obtained.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAdministerPasswords } from "../_shared/admin-authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdminResetRequest {
  user_uuid: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, code: "NO_AUTH", detail: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "AUTH_FAILED",
          detail: authError?.message || "Invalid token",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("unicorn_role, user_type, disabled, archived, tenant_id")
      .eq("user_uuid", caller.id)
      .maybeSingle();

    if (profileError || !callerProfile || !canAdministerPasswords(callerProfile)) {
      return new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { user_uuid }: AdminResetRequest = await req.json();
    if (!user_uuid) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_USER_UUID", detail: "user_uuid is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("email, first_name, last_name, tenant_id")
      .eq("user_uuid", user_uuid)
      .single();

    if (targetError || !targetUser) {
      return new Response(
        JSON.stringify({ ok: false, code: "USER_NOT_FOUND", detail: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au";

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo: `${APP_BASE_URL}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "LINK_GENERATION_FAILED",
          detail: linkError?.message || "Failed to generate recovery link",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      return new Response(
        JSON.stringify({ ok: false, code: "NO_ACTION_LINK", detail: "No action_link in response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin.from("audit_user_events").insert({
      actor_user_uuid: caller.id,
      target_user_uuid: user_uuid,
      tenant_id: targetUser.tenant_id ?? callerProfile.tenant_id ?? null,
      action: "admin_reset_user",
      details: {
        target_email: targetUser.email,
        initiated_by: caller.email,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        action_link: actionLink,
        email: targetUser.email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        code: "UNEXPECTED_ERROR",
        detail: "An unexpected error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
