import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface RecoveryLinkRequest {
  user_uuid: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
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
        JSON.stringify({ ok: false, code: "NO_AUTH_HEADER" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ ok: false, code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { data: callerData } = await supabaseAdmin
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", caller.id)
      .maybeSingle();

    const { data: allowed } = await supabaseAdmin.rpc('check_permission', {
      p_user_id: caller.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });

    if (!allowed) {
      return new Response(
        JSON.stringify({ ok: false, code: "INSUFFICIENT_PERMISSIONS" }),
        { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { user_uuid }: RecoveryLinkRequest = await req.json();

    if (!user_uuid) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_USER_UUID" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("email, first_name, last_name, tenant_id")
      .eq("user_uuid", user_uuid)
      .single();

    if (targetError || !targetUser) {
      console.error("Target user lookup error:", targetError);
      return new Response(
        JSON.stringify({ ok: false, code: "USER_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating recovery link for ${targetUser.email}`);

    const { data: authUsers, error: authListError } = await supabaseAdmin.auth.admin.listUsers();

    if (authListError) {
      console.error("Failed to list auth users:", authListError);
      return new Response(
        JSON.stringify({ ok: false, code: "AUTH_CHECK_FAILED", detail: authListError.message }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const authUserExists = authUsers.users.some(
      (u) => u.email?.toLowerCase() === targetUser.email.toLowerCase()
    );

    if (!authUserExists) {
      console.error(`User ${targetUser.email} exists in public.users but not in auth.users`);
      return new Response(
        JSON.stringify({
          ok: false,
          code: "AUTH_USER_NOT_FOUND",
          detail: "This user has not yet activated their account. Please send them an invitation instead.",
        }),
        { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
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
      console.error("Failed to generate recovery link:", linkError);
      return new Response(
        JSON.stringify({ ok: false, code: "LINK_GENERATION_FAILED", detail: linkError?.message }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      console.error("No action_link in response");
      return new Response(
        JSON.stringify({ ok: false, code: "NO_ACTION_LINK" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    console.log(`Recovery link generated successfully`);

    await supabaseAdmin.from("audit_eos_events").insert({
      tenant_id: targetUser.tenant_id || callerData.tenant_id || 1,
      user_id: caller.id,
      entity: "user",
      entity_id: user_uuid,
      action: "recovery_link_copied",
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
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, code: "UNEXPECTED_ERROR", detail: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
