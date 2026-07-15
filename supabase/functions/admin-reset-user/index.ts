/**
 * HISTORICAL — admin-reset-user
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (gated; orphan — no in-repo callers).
 * Superseded by generate-recovery-link / send-password-reset.
 *
 * Provenance: byte-accurate deployed source, pulled directly via Supabase MCP
 * get_edge_function on 15 Jul 2026 (function id 22fc2a87-f5aa-4f10-8236-e5ed3e2649dc,
 * version 78). Not a reconstruction — this replaces an earlier reconstructed version
 * committed in PR #5 that had diverged from real production behavior (different
 * request contract, added a redirectTo option that doesn't exist live, different
 * response shape, different audit-log fields).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { canAdministerPasswords } from "../_shared/admin-authorization.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ ok: false, code: "NO_AUTH", detail: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerData, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ ok: false, code: "AUTH_FAILED", detail: callerErr?.message || "Unable to authenticate caller" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = callerData.user;

    const { data: callerProfile, error: profileErr } = await supabase
      .from("users")
      .select("unicorn_role, user_type, disabled, archived")
      .eq("user_uuid", caller.id)
      .maybeSingle();

    if (profileErr || !canAdministerPasswords(callerProfile)) {
      return new Response(JSON.stringify({ ok: false, code: "FORBIDDEN", detail: "Only active Vivacity Super Admins can generate password reset links" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return new Response(JSON.stringify({ ok: false, code: "MISSING_EMAIL", detail: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
    });

    if (linkErr) {
      return new Response(JSON.stringify({ ok: false, code: "RESET_FAILED", detail: linkErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetLink = linkData?.properties?.action_link;
    if (!resetLink) {
      return new Response(JSON.stringify({ ok: false, code: "RESET_FAILED", detail: "No reset link generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Password reset link generated successfully");

    try {
      await supabase.from("audit_user_events").insert({
        actor_user_uuid: caller.id,
        target_user_uuid: linkData?.user?.id,
        action: "admin_password_reset",
        reason: "Admin-initiated password reset",
        details: { email: normalizedEmail },
      });
    } catch (auditErr) {
      console.warn("Audit log failed (non-fatal):", auditErr);
    }

    return new Response(
      JSON.stringify({ ok: true, resetLink }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", detail: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
