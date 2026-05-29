import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecoveryLinkRequest {
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
        JSON.stringify({ ok: false, code: "NO_AUTH_HEADER" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ ok: false, code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerData, error: callerError } = await supabaseAdmin
      .from("users")
      .select("unicorn_role, user_type, tenant_id")
      .eq("user_uuid", caller.id)
      .single();

    if (callerError || !callerData) {
      console.error("Caller lookup error:", callerError);
      return new Response(
        JSON.stringify({ ok: false, code: "CALLER_NOT_FOUND" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isSuperAdmin = callerData.unicorn_role === "Super Admin" &&
      (callerData.user_type === "Vivacity" || callerData.user_type === "Vivacity Team");

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ ok: false, code: "INSUFFICIENT_PERMISSIONS" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_uuid }: RecoveryLinkRequest = await req.json();

    if (!user_uuid) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_USER_UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating recovery link for ${targetUser.email}`);

    const { data: authUsers, error: authListError } = await supabaseAdmin.auth.admin.listUsers();

    if (authListError) {
      console.error("Failed to list auth users:", authListError);
      return new Response(
        JSON.stringify({ ok: false, code: "AUTH_CHECK_FAILED", detail: authListError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const origin = req.headers.get("origin") || "https://vivacity.lovable.app";

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("Failed to generate recovery link:", linkError);
      return new Response(
        JSON.stringify({ ok: false, code: "LINK_GENERATION_FAILED", detail: linkError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      console.error("No action_link in response");
      return new Response(
        JSON.stringify({ ok: false, code: "NO_ACTION_LINK" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, code: "UNEXPECTED_ERROR", detail: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
