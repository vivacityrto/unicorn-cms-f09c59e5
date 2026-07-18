/**
 * HISTORICAL SNAPSHOT — auth-send-magic-link (pre-retirement)
 *
 * Live on project yxkgdalkbrriasiyyrwk with NO caller authentication.
 * Probed 18 Jul 2026: unauthenticated POST {email} reaches admin.generateLink
 * and Mailgun send (EMAIL_SEND_FAILED / Mailgun "Forbidden").
 *
 * Supabase MCP was unavailable in this agent environment (needsAuth; interactive
 * mcp_auth not offered). Source reconstructed from live error-contract probes
 * (MISSING_EMAIL, MAGIC_LINK_FAILED, EMAIL_SEND_FAILED, INTERNAL) to record the
 * vulnerability before retirement — not a byte-accurate get_edge_function pull.
 *
 * Orphan: zero in-repo callers. Login uses supabase.auth.signInWithOtp.
 * Next commit retires this to HTTP 410 FUNCTION_RETIRED.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
    const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
    const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL");
    const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME");
    const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au").replace(/\/+$/, "");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // No caller JWT check — this is the vulnerability being retired.
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const linkType = body?.type === "recovery" ? "recovery" : "magiclink";

    if (!email) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_EMAIL", detail: "email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email,
      options: {
        redirectTo: typeof body?.redirectTo === "string" ? body.redirectTo : `${APP_BASE_URL}/auth/callback`,
      },
    });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "MAGIC_LINK_FAILED",
          detail: linkError?.message || "Failed to generate magic link",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      return new Response(
        JSON.stringify({ ok: false, code: "MAGIC_LINK_FAILED", detail: "No action_link generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      return new Response(
        JSON.stringify({ ok: false, code: "EMAIL_SEND_FAILED", detail: "Mailgun not configured" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromEmail = MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;
    const fromName = MAILGUN_FROM_NAME || "Unicorn CMS";
    const formData = new FormData();
    formData.append("from", `${fromName} <${fromEmail}>`);
    formData.append("to", email);
    formData.append("subject", "Your Unicorn CMS magic link");
    formData.append("template", "unicorn-magic-link");
    formData.append("h:X-Mailgun-Variables", JSON.stringify({ action_link: actionLink }));

    const mailgunResponse = await fetch(
      `https://api.eu.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: formData,
      },
    );

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      return new Response(
        JSON.stringify({ ok: false, code: "EMAIL_SEND_FAILED", detail: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, email, message: "Magic link sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL", detail }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
