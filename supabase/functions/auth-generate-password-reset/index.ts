/**
 * HISTORICAL orphan — auth-generate-password-reset
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (verify_jwt: false; callable
 * with the public anon key). No in-repo frontend callers — Login.tsx uses
 * send-self-password-reset exclusively. Confirmed via live probe (18 Jul 2026):
 * missing/invalid email → 400 "Valid email is required"; unknown email → 500
 * "Failed to create reset link"; known email → 200 {"ok":true} — classic
 * account-enumeration leak.
 *
 * Keeper-repo source was missing; this file reimplements the self-service
 * reset path on top of send-self-password-reset's hardened behaviour:
 * - Anti-enumeration: always 200 + GENERIC_RESET_MESSAGE (missing / disabled)
 * - users.disabled gate (no email for disabled accounts)
 * - Per-email / per-IP rate limit (shared with send-self-password-reset)
 * - Mailgun delivery of a scanner-safe /activate recovery link
 *
 * Deploy this patched source when ready — do not leave the live enumerating
 * build in place.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GENERIC_RESET_MESSAGE,
  checkPasswordResetRateLimit,
  getClientIp,
  recordPasswordResetAttempt,
} from "../_shared/password-reset-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuthGeneratePasswordResetRequest {
  email: string;
}

function genericSuccess(): Response {
  return new Response(
    JSON.stringify({ ok: true, message: GENERIC_RESET_MESSAGE }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function isValidEmail(email: string): boolean {
  // Keep a light shape check (live orphan rejected values without '@').
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req: Request): Promise<Response> => {
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

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error("Missing Mailgun configuration");
      return new Response(
        JSON.stringify({ ok: false, code: "MAILGUN_NOT_CONFIGURED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email : "";

    if (!email || !isValidEmail(email.trim())) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_EMAIL", detail: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);

    const rate = await checkPasswordResetRateLimit(supabaseAdmin, normalizedEmail, clientIp);
    if (rate.limited) {
      console.log(
        `auth-generate-password-reset rate-limited (${rate.reason}): ${normalizedEmail} ip=${clientIp}`,
      );
      return new Response(
        JSON.stringify({
          ok: false,
          code: "RATE_LIMIT_EXCEEDED",
          detail: "Too many password reset attempts. Please try again later.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await recordPasswordResetAttempt(supabaseAdmin, {
      email: normalizedEmail,
      ip: clientIp,
      endpoint: "auth-generate-password-reset",
    });

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("user_uuid, email, first_name, last_name, tenant_id, disabled")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    // Anti-enumeration: identical success for missing accounts
    if (targetError || !targetUser) {
      console.log(
        `auth-generate-password-reset for non-existent email: ${normalizedEmail}`,
        targetError ?? "",
      );
      return genericSuccess();
    }

    // Anti-enumeration: identical success for disabled accounts
    if (targetUser.disabled) {
      console.log(`auth-generate-password-reset for disabled user: ${normalizedEmail}`);
      return genericSuccess();
    }

    console.log(`Generating password reset link (auth-generate) for ${targetUser.email}`);

    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au";

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo: `${APP_BASE_URL}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("Failed to generate reset link:", linkError);
      // Do not reveal link-generation failure to the client (enumeration).
      return genericSuccess();
    }

    const resetLink = linkData.properties?.action_link;
    if (!resetLink) {
      console.error("No action_link in response");
      return genericSuccess();
    }

    const actionUrl = new URL(resetLink);
    const rawToken = actionUrl.searchParams.get("token");
    if (!rawToken) {
      console.error("Could not extract token from action_link");
      return genericSuccess();
    }
    const safeResetLink =
      `${APP_BASE_URL}/activate?token=${encodeURIComponent(rawToken)}` +
      `&type=recovery&email=${encodeURIComponent(targetUser.email)}`;

    const recipientName = targetUser.first_name || targetUser.email.split("@")[0];
    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password • Unicorn CMS</title>
  <style>
    body { margin: 0; padding: 0; background: #f6f8fb; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); padding: 24px; color: #fff; text-align: center; }
    .content { padding: 24px; }
    .btn { display: inline-block; background: #6b21a8; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; }
    .muted { color: #666; font-size: 14px; margin-top: 16px; }
    .footer { padding: 16px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e5e7eb; }
    a { color: #6b21a8; }
    .link-box { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 16px 0; word-break: break-all; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🦄 Unicorn CMS</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Password Reset</p>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Reset your password</h2>
      <p>Hey ${recipientName},</p>
      <p>You requested to reset your password for your Unicorn CMS account. Click the button below to create a new password:</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${safeResetLink}" class="btn">Reset My Password</a>
      </p>
      <p class="muted">If the button doesn't work, copy and paste this link into your browser:</p>
      <div class="link-box">
        <a href="${safeResetLink}">${safeResetLink}</a>
      </div>
      <p class="muted">
        <strong>This link expires in 24 hours.</strong><br><br>
        If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>
    <div class="footer">
      <p>Unicorn CMS by Vivacity</p>
      <p style="margin: 4px 0;"><a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
    </div>
  </div>
</body>
</html>`;

    const fromEmail = MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;
    const fromName = MAILGUN_FROM_NAME || "Unicorn CMS";

    const formData = new FormData();
    formData.append("from", `${fromName} <${fromEmail}>`);
    formData.append("to", targetUser.email);
    formData.append("subject", "Reset your Unicorn CMS password");
    formData.append("html", emailHtml);

    const mailgunResponse = await fetch(
      `https://api.eu.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
        },
        body: formData,
      },
    );

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error("Mailgun error:", {
        status: mailgunResponse.status,
        statusText: mailgunResponse.statusText,
        body: errorText,
      });
      // Anti-enumeration: same generic success even when delivery fails.
      return genericSuccess();
    }

    console.log(`auth-generate-password-reset email sent to ${targetUser.email}`);

    await supabaseAdmin.from("audit_eos_events").insert({
      tenant_id: targetUser.tenant_id || 1,
      user_id: targetUser.user_uuid,
      entity: "user",
      entity_id: targetUser.user_uuid,
      action: "self_password_reset_requested",
      details: {
        email: targetUser.email,
        ip: clientIp,
        endpoint: "auth-generate-password-reset",
      },
    });

    return genericSuccess();
  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    // Prefer generic success over leaking unexpected failures for valid-looking emails.
    return genericSuccess();
  }
});
