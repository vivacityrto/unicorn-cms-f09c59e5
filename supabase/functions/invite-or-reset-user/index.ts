/**
 * HISTORICAL + H2 — invite-or-reset-user
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (gated; orphan — no in-repo callers).
 * Vendored from production via Supabase MCP get_edge_function on 15 Jul 2026
 * (function id 83296dca-2920-4b03-8eac-0549b0863e40, version 133, verify_jwt: true).
 *
 * H2 (14 Jul 2026 Unicorn security audit follow-up):
 * - Pin invite redirectTo to APP_BASE_URL (never accept client-supplied redirectTo).
 * - Replace broken role_type/email caller check with check_permission + disabled gate
 *   (public.users has no role_type column; the live check failed closed for everyone).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env vars");
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Require authenticated caller and check role
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: authData, error: getUserError } = await supabase.auth.getUser(token);
    if (getUserError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: caller, error: profileErr } = await supabase
      .from("users")
      .select("disabled")
      .eq("user_uuid", authData.user.id)
      .maybeSingle();

    if (profileErr || !caller || caller.disabled) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: allowed } = await supabase.rpc("check_permission", {
      p_user_id: authData.user.id,
      p_feature_key: "admin.team_users.manage",
      p_min_level: "full",
    });

    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body: Payload = await req.json();
    const email = body?.email?.trim().toLowerCase();
    const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au").replace(/\/+$/, "");
    const redirectTo = `${APP_BASE_URL}/reset-password`;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Restrict to specific approved email(s) for safety
    const allowedEmails = new Set(["angela@vivacity.com.au"]);
    if (!allowedEmails.has(email)) {
      return new Response(JSON.stringify({ error: "Not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Removed automatic role assignment to prevent privilege escalation

    // Try inviting the user first
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (inviteError) {
    // If user already exists, send reset using token system instead
      if (inviteError.message?.toLowerCase().includes("already registered") || inviteError.status === 422) {
        // Use the token-based system for password reset emails (Mailgun)
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke('issue-token', {
          body: {
            email: email,
            type: 'reset',
            meta: {}
          }
        });

        if (tokenError) {
          console.error("Token issue error:", tokenError);
          return new Response(
            JSON.stringify({ error: tokenError.message || "Failed to issue reset token" }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({ ok: true, mode: "reset", message: `Password reset email sent to ${email}`, data: tokenData }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.error("Invite error:", inviteError);
      return new Response(
        JSON.stringify({ error: inviteError.message || "Failed to invite user" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, mode: "invite", message: `Invitation email sent to ${email}`, data: inviteData }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e: any) {
    console.error("Unhandled error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
