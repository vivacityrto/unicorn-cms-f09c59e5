/**
 * send-magic-link — gated magic-link / recovery email sender
 *
 * Live on project yxkgdalkbrriasiyyrwk (orphan — no in-repo callers; Login uses
 * signInWithOtp). Supabase MCP was unavailable here, so this is reconstructed to
 * match the live error contract observed 18 Jul 2026:
 *   NO_AUTH → AUTH_FAILED (getUser) → MISSING_EMAIL
 * plus the required authz gate (self-service email match OR
 * check_permission(..., 'admin.team_users.manage', 'full')).
 *
 * Survives as the keeper for magic-link edge sends after auth-send-magic-link
 * is retired (unauthenticated duplicate).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type LinkType = "magiclink" | "recovery";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
    const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
    const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL");
    const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME");
    const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au").replace(/\/+$/, "");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, code: "NO_AUTH", detail: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const linkType: LinkType = body?.type === "recovery" ? "recovery" : "magiclink";

    if (!email) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_EMAIL", detail: "email is required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "AUTH_FAILED",
          detail: authError?.message || "Unable to authenticate caller",
        }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const callerEmail = (user.email || "").trim().toLowerCase();
    const isSelfService = callerEmail.length > 0 && callerEmail === email;

    let isAdmin = false;
    if (!isSelfService) {
      const { data: allowed } = await supabaseAdmin.rpc("check_permission", {
        p_user_id: user.id,
        p_feature_key: "admin.team_users.manage",
        p_min_level: "full",
      });
      isAdmin = !!allowed;
    }

    if (!isSelfService && !isAdmin) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "FORBIDDEN",
          detail: "Only self-service or admin.team_users.manage (full) can send magic links",
        }),
        { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      return new Response(
        JSON.stringify({ ok: false, code: "EMAIL_SEND_FAILED", detail: "Mailgun not configured" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const redirectPath = linkType === "recovery" ? "/reset-password" : "/auth/callback";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo: `${APP_BASE_URL}${redirectPath}` },
    });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "MAGIC_LINK_FAILED",
          detail: linkError?.message || "Failed to generate link",
        }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      return new Response(
        JSON.stringify({ ok: false, code: "MAGIC_LINK_FAILED", detail: "No action_link generated" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Normalize to scanner-safe /activate URL when a GoTrue token is present
    let finalLink = actionLink;
    try {
      const actionUrl = new URL(actionLink);
      const rawToken = actionUrl.searchParams.get("token");
      if (rawToken) {
        finalLink =
          `${APP_BASE_URL}/activate?token=${encodeURIComponent(rawToken)}` +
          `&type=${encodeURIComponent(linkType)}&email=${encodeURIComponent(email)}`;
      }
    } catch {
      // keep actionLink
    }

    const fromEmail = MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;
    const fromName = MAILGUN_FROM_NAME || "Unicorn CMS";
    const subject =
      linkType === "recovery"
        ? "Reset your Unicorn CMS password"
        : "Your Unicorn CMS magic link";
    const template =
      linkType === "recovery" ? "unicorn-password-reset" : "unicorn-magic-link";

    const formData = new FormData();
    formData.append("from", `${fromName} <${fromEmail}>`);
    formData.append("to", email);
    formData.append("subject", subject);
    formData.append("template", template);
    formData.append("h:X-Mailgun-Variables", JSON.stringify({ action_link: finalLink }));

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
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, email, type: linkType, message: "Link sent successfully" }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL", detail }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
