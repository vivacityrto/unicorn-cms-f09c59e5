import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  user_uuid: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
    const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error("Missing Mailgun configuration");
      return new Response(
        JSON.stringify({ ok: false, code: "MAILGUN_NOT_CONFIGURED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify caller's auth token
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

    // Get caller's role from users table
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
    
    const isTenantAdmin = callerData.unicorn_role === "Admin" && 
      (callerData.user_type === "Client" || callerData.user_type === "Client Parent");

    if (!isSuperAdmin && !isTenantAdmin) {
      return new Response(
        JSON.stringify({ ok: false, code: "INSUFFICIENT_PERMISSIONS" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { user_uuid }: PasswordResetRequest = await req.json();

    if (!user_uuid) {
      return new Response(
        JSON.stringify({ ok: false, code: "MISSING_USER_UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user's details
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

    // Tenant admins can only reset passwords for users in their own tenant
    if (isTenantAdmin && !isSuperAdmin) {
      if (targetUser.tenant_id !== callerData.tenant_id) {
        return new Response(
          JSON.stringify({ ok: false, code: "CROSS_TENANT_NOT_ALLOWED" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Generating password reset link for ${targetUser.email}`);

    // Get the origin for redirect URL
    const origin = req.headers.get("origin") || "https://vivacity.lovable.app";

    // Generate password reset link using Supabase Admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("Failed to generate reset link:", linkError);
      return new Response(
        JSON.stringify({ ok: false, code: "LINK_GENERATION_FAILED", detail: linkError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resetLink = linkData.properties?.action_link;
    if (!resetLink) {
      console.error("No action_link in response");
      return new Response(
        JSON.stringify({ ok: false, code: "NO_ACTION_LINK" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset link generated successfully`);

    // Build the email HTML from template
    const recipientName = targetUser.first_name || targetUser.email.split("@")[0];
    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password • Vivacity</title>
  <style>
    body { margin: 0; padding: 0; background: #f6f8fb; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; }
    .header { background: #6b21a8; padding: 24px; color: #fff; text-align: center; }
    .content { padding: 24px; }
    .btn { display: inline-block; background: #6b21a8; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 500; }
    .btn:hover { background: #581c87; }
    .muted { color: #666; font-size: 14px; margin-top: 16px; }
    .footer { padding: 16px; text-align: center; color: #666; font-size: 12px; }
    a { color: #6b21a8; }
    .link-box { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 16px 0; word-break: break-all; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">🔒 Password Reset</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Reset your Vivacity password</h2>
      
      <p>Hey ${recipientName},</p>
      
      <p>A Vivacity administrator has requested a password reset for your account.</p>
      
      <p style="text-align: center; margin: 24px 0;">
        <a href="${resetLink}" class="btn">Create New Password 🔑</a>
      </p>
      
      <p class="muted">If the button doesn't work, copy this link:</p>
      <div class="link-box">
        <a href="${resetLink}">${resetLink}</a>
      </div>
      
      <p class="muted">
        <strong>⚡ This link expires in 1 hour.</strong><br>
        If you didn't expect this email, please contact your administrator.
      </p>
    </div>
    <div class="footer">
      Vivacity • <a href="${origin}">${origin}</a>
    </div>
  </div>
</body>
</html>`;

    // Send email via Mailgun
    const formData = new FormData();
    formData.append("from", `Vivacity <noreply@${MAILGUN_DOMAIN}>`);
    formData.append("to", targetUser.email);
    formData.append("subject", "Reset your Vivacity password");
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
      console.error("Mailgun error:", errorText);
      return new Response(
        JSON.stringify({ ok: false, code: "EMAIL_SEND_FAILED", detail: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset email sent to ${targetUser.email}`);

    // Log the action to audit
    await supabaseAdmin.from("audit_eos_events").insert({
      tenant_id: targetUser.tenant_id || callerData.tenant_id || 1,
      user_id: caller.id,
      entity: "user",
      entity_id: user_uuid,
      action: "password_reset_sent",
      details: {
        target_email: targetUser.email,
        initiated_by: caller.email,
      },
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        email: targetUser.email,
        message: "Password reset email sent successfully" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, code: "UNEXPECTED_ERROR", detail: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
