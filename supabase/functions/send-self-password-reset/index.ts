import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  GENERIC_RESET_MESSAGE,
  checkPasswordResetRateLimit,
  getClientIp,
  recordPasswordResetAttempt,
} from "../_shared/password-reset-rate-limit.ts";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";

interface SelfPasswordResetRequest {
  email: string;
}

function genericSuccess(req: Request): Response {
  return new Response(
    JSON.stringify({ ok: true, message: GENERIC_RESET_MESSAGE }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
}

// auth-gate: none -- intentionally public self-service reset endpoint; it
// prevents enumeration and is protected by per-email/per-IP rate limiting.
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
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
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request body
    const { email }: SelfPasswordResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_EMAIL" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);

    // Per-email / per-IP rate limit (invite-user pattern + IP ceiling)
    const rate = await checkPasswordResetRateLimit(supabaseAdmin, normalizedEmail, clientIp);
    if (rate.limited) {
      console.log(`Password reset rate-limited (${rate.reason}): ${normalizedEmail} ip=${clientIp}`);
      return new Response(
        JSON.stringify({
          ok: false,
          code: "RATE_LIMIT_EXCEEDED",
          detail: "Too many password reset attempts. Please try again later.",
        }),
        { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    await recordPasswordResetAttempt(supabaseAdmin, {
      email: normalizedEmail,
      ip: clientIp,
      endpoint: "send-self-password-reset",
    });

    // Check if user exists in our users table (case-insensitive)
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("user_uuid, email, first_name, last_name, tenant_id, disabled")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    // Security: Always return success to prevent email enumeration
    // But only actually send email if user exists and is active
    if (targetError || !targetUser) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`, targetError ?? "");
      return genericSuccess(req, );
    }

    // Check if user is active (disabled flag)
    if (targetUser.disabled) {
      console.log(`Password reset requested for disabled user: ${normalizedEmail}`);
      return genericSuccess(req, );
    }

    console.log(`Generating self-service password reset link for ${targetUser.email}`);

    // Generate password reset link using Supabase Admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo: `${APP_BASE_URL}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("Failed to generate reset link:", linkError);
      return new Response(
        JSON.stringify({ ok: false, code: "LINK_GENERATION_FAILED", detail: linkError?.message }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const resetLink = linkData.properties?.action_link; // token only; URL rebuilt from APP_BASE_URL
    if (!resetLink) {
      console.error("No action_link in response"); // token only; URL rebuilt from APP_BASE_URL
      return new Response(
        JSON.stringify({ ok: false, code: "NO_ACTION_LINK" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Transform raw GoTrue link into scanner-safe /activate URL
    const actionUrl = new URL(resetLink);
    const rawToken = actionUrl.searchParams.get('token');
    if (!rawToken) {
      console.error("Could not extract token from action_link"); // token only; URL rebuilt from APP_BASE_URL
      return new Response(
        JSON.stringify({ ok: false, code: "TOKEN_EXTRACT_FAILED" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    const safeResetLink = `${APP_BASE_URL}/activate?token=${encodeURIComponent(rawToken)}&type=recovery&email=${encodeURIComponent(targetUser.email)}`;

    console.log(`Password reset link generated successfully for ${targetUser.email}`);

    // Build the email HTML
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
    .btn:hover { background: #581c87; }
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

    // Send email via Mailgun (EU region)
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
      }
    );

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error("Mailgun error:", {
        status: mailgunResponse.status,
        statusText: mailgunResponse.statusText,
        body: errorText,
      });
      return new Response(
        JSON.stringify({
          ok: false,
          code: "EMAIL_SEND_FAILED",
          detail: errorText,
        }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    console.log(`Self-service password reset email sent to ${targetUser.email}`);

    // Log the action to audit (no user_id since this is self-service)
    await supabaseAdmin.from("audit_eos_events").insert({
      tenant_id: targetUser.tenant_id || 1,
      user_id: targetUser.user_uuid,
      entity: "user",
      entity_id: targetUser.user_uuid,
      action: "self_password_reset_requested",
      details: {
        email: targetUser.email,
        ip: clientIp,
        endpoint: "send-self-password-reset",
      },
    });

    return genericSuccess(req, );

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, code: "UNEXPECTED_ERROR", detail: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
