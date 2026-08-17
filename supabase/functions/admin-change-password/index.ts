import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { canAdministerPasswords } from "../_shared/admin-authorization.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, code: "NO_AUTH" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is a Super Admin
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ ok: false, code: "AUTH_FAILED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role
    const { data: callerProfile } = await supabaseUser
      .from("users")
      .select("unicorn_role, user_type, disabled, archived")
      .eq("user_uuid", caller.id)
      .single();

    if (!canAdministerPasswords(callerProfile)) {
      return new Response(JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Only active Vivacity Super Admins can change user passwords" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_uuid, new_password } = await req.json();

    if (!target_user_uuid || !new_password) {
      return new Response(JSON.stringify({ ok: false, code: "MISSING_FIELDS" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new_password.length < 8) {
      return new Response(JSON.stringify({ ok: false, code: "WEAK_PASSWORD", detail: "Password must be at least 8 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to update the target user's password
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the target user exists in auth
    const { data: targetAuthUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(target_user_uuid);
    if (getUserError || !targetAuthUser?.user) {
      return new Response(JSON.stringify({ ok: false, code: "USER_NOT_FOUND", detail: "This user does not have an authentication account. They may have been added manually without a Supabase Auth account." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      target_user_uuid,
      { password: new_password }
    );

    if (updateError) {
      return new Response(JSON.stringify({ ok: false, code: "UPDATE_FAILED", detail: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
