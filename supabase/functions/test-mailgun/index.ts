import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Mailgun Test Harness - SuperAdmin Only
 * 
 * POST /test-mailgun
 * Body: {
 *   to_email: string,
 *   template_name: 'team_invite' | 'client_invite' | 'notification',
 *   template_variables?: Record<string, any>
 * }
 * 
 * Returns diagnostic information about the send attempt
 */

// Email Configuration
const EMAIL_LOGO_URL = "https://unicorncms.lovable.app/assets/brand/unicorn-cms-email-logo.png";
const EMAIL_LOGO_ALT = "Unicorn CMS";

// Mailgun Configuration
const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "mg.unicorn-cms.au";
const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL") || "no-reply@mg.unicorn-cms.au";
const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Unicorn CMS";
const MAILGUN_REGION = Deno.env.get("MAILGUN_REGION") || "EU";
const MAILGUN_API_BASE = MAILGUN_REGION === "EU" 
  ? "https://api.eu.mailgun.net" 
  : "https://api.mailgun.net";

interface TestRequest {
  to_email: string;
  template_name: 'team_invite' | 'client_invite' | 'notification' | 'test';
  template_variables?: Record<string, any>;
}

interface AuditLog {
  triggered_by: string;
  triggered_at: string;
  to_email: string;
  template_name: string;
  success: boolean;
  message_id?: string;
  error?: string;
  request_payload?: Record<string, any>;
  response?: any;
}

function generateTestEmail(templateName: string, variables: Record<string, any>): { subject: string; html: string } {
  const recipientName = variables.recipient_name || 'User';
  const inviteUrl = variables.invite_url || 'https://unicorn-cms.au/accept-invitation?token=TEST_TOKEN';
  const roleName = variables.role_name || 'Team Member';
  const orgName = variables.org_name || 'Vivacity';

  switch (templateName) {
    case 'team_invite':
      return {
        subject: `[TEST] Invitation to Join Unicorn 2.0 - Vivacity Team`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 16px;" />
                <h1 style="margin: 0;">✨ Welcome to Unicorn CMS</h1>
                <p style="margin: 10px 0 0 0;">RTO + CRICOS Compliance Management System</p>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <p><span style="display: inline-block; padding: 6px 12px; background: #7130A0; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">VIVACITY TEAM - TEST EMAIL</span></p>
                
                <h2>Hello ${recipientName}!</h2>
                <p>You've been invited to join Unicorn 2.0 as a <strong>${roleName}</strong>.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
                </div>
                
                <p style="font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px;">
                  <strong>This is a TEST email sent via Mailgun Test Harness.</strong><br>
                  Invite URL: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">${inviteUrl}</code>
                </p>
              </div>
              <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                <p><strong>Powered by ✒️ Vivacity</strong></p>
                <p>RTO + CRICOS SUPERHERO</p>
              </div>
            </body>
          </html>
        `,
      };

    case 'client_invite':
      return {
        subject: `[TEST] Invitation to Join ${orgName} on Unicorn 2.0`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 16px;" />
                <h1 style="margin: 0;">✨ Welcome to Unicorn CMS</h1>
                <p style="margin: 10px 0 0 0;">RTO + CRICOS Compliance Management System</p>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <p><span style="display: inline-block; padding: 6px 12px; background: #00B0F0; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">CLIENT INVITATION - TEST EMAIL</span></p>
                
                <h2>Hello ${recipientName}!</h2>
                <p>You've been invited to join <strong>${orgName}</strong> on Unicorn 2.0.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; background: #23C0DD; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
                </div>
                
                <p style="font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px;">
                  <strong>This is a TEST email sent via Mailgun Test Harness.</strong><br>
                  Organisation: ${orgName}
                </p>
              </div>
              <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                <p><strong>Powered by ✒️ Vivacity</strong></p>
                <p>RTO + CRICOS SUPERHERO</p>
              </div>
            </body>
          </html>
        `,
      };

    case 'test':
    default:
      return {
        subject: `[TEST] Mailgun Configuration Test - ${new Date().toISOString()}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" style="height: 40px; margin-bottom: 16px;" />
                <h1 style="margin: 0;">🔧 Mailgun Test</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <h2>Configuration Test Successful! ✅</h2>
                <p>If you're reading this, your Mailgun configuration is working correctly.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Domain</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${MAILGUN_DOMAIN}</code></td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Region</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${MAILGUN_REGION}</code></td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">API Base</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${MAILGUN_API_BASE}</code></td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">From</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${MAILGUN_FROM_NAME} &lt;${MAILGUN_FROM_EMAIL}&gt;</code></td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Sent At</td><td style="padding: 8px;"><code>${new Date().toISOString()}</code></td></tr>
                </table>
                
                <p style="font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 20px;">
                  This is a test email from the Unicorn CMS Mailgun Test Harness.
                </p>
              </div>
            </body>
          </html>
        `,
      };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const auditLog: AuditLog = {
    triggered_by: 'unknown',
    triggered_at: new Date().toISOString(),
    to_email: '',
    template_name: '',
    success: false,
  };

  try {
    // Initialize Supabase client
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Validate caller's auth token
    const callerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!callerToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing Authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // 2. Get caller's user info
    const { data: callerUser, error: callerErr } = await supabase.auth.getUser(callerToken);
    if (callerErr || !callerUser?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Authentication failed" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    auditLog.triggered_by = callerUser.user.email || callerUser.user.id;

    // 3. RBAC Check - Super Admin only
    const { data: callerProfile, error: roleErr } = await supabase
      .from("users")
      .select("unicorn_role, first_name, last_name")
      .eq("user_uuid", callerUser.user.id)
      .maybeSingle();

    if (roleErr || !callerProfile) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to verify role" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    if (!["Super Admin", "SuperAdmin"].includes(callerProfile.unicorn_role)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Forbidden: Super Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // 4. Parse request
    const body: TestRequest = await req.json();
    const { to_email, template_name, template_variables = {} } = body;

    if (!to_email || !template_name) {
      return new Response(
        JSON.stringify({ ok: false, error: "to_email and template_name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    auditLog.to_email = to_email;
    auditLog.template_name = template_name;

    // 5. Check Mailgun configuration
    const configCheck = {
      MAILGUN_API_KEY: MAILGUN_API_KEY ? '✅ Set (redacted)' : '❌ Missing',
      MAILGUN_DOMAIN: MAILGUN_DOMAIN,
      MAILGUN_FROM_EMAIL: MAILGUN_FROM_EMAIL,
      MAILGUN_FROM_NAME: MAILGUN_FROM_NAME,
      MAILGUN_REGION: MAILGUN_REGION,
      MAILGUN_API_BASE: MAILGUN_API_BASE,
    };

    if (!MAILGUN_API_KEY) {
      auditLog.error = "Mailgun API key not configured";
      await logAudit(supabase, auditLog);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Mailgun API key not configured",
          config: configCheck 
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // 6. Generate email content
    const { subject, html } = generateTestEmail(template_name, template_variables);

    // 7. Build request payload (for logging)
    const requestPayload = {
      from: `${MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`,
      to: to_email,
      subject: subject,
      html: '[HTML content - see template]',
    };
    auditLog.request_payload = requestPayload;

    // 8. Send via Mailgun
    console.log("Sending test email via Mailgun:", {
      domain: MAILGUN_DOMAIN,
      region: MAILGUN_REGION,
      apiBase: MAILGUN_API_BASE,
      to: to_email,
      template: template_name,
    });

    const formData = new FormData();
    formData.append("from", `${MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`);
    formData.append("to", to_email);
    formData.append("subject", subject);
    formData.append("html", html);

    const mailgunResponse = await fetch(
      `${MAILGUN_API_BASE}/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
        },
        body: formData,
      }
    );

    const responseText = await mailgunResponse.text();
    let responseJson: any = {};
    
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    auditLog.response = {
      status: mailgunResponse.status,
      statusText: mailgunResponse.statusText,
      body: responseJson,
    };

    if (!mailgunResponse.ok) {
      auditLog.error = `Mailgun API error (${mailgunResponse.status}): ${responseText}`;
      await logAudit(supabase, auditLog);

      // Diagnostic information for common failures
      const diagnostics: string[] = [];
      
      if (mailgunResponse.status === 401) {
        diagnostics.push("❌ Invalid API key - check MAILGUN_API_KEY secret");
      }
      if (mailgunResponse.status === 404) {
        diagnostics.push(`❌ Domain not found - verify '${MAILGUN_DOMAIN}' exists in Mailgun`);
      }
      if (mailgunResponse.status === 400 && responseText.includes("from")) {
        diagnostics.push(`❌ From address not authorized - verify '${MAILGUN_FROM_EMAIL}' is allowed for domain`);
      }
      if (MAILGUN_REGION === "US" && responseText.includes("not found")) {
        diagnostics.push("⚠️ If domain is in EU region, set MAILGUN_REGION=EU");
      }
      if (MAILGUN_REGION === "EU" && responseText.includes("not found")) {
        diagnostics.push("⚠️ If domain is in US region, set MAILGUN_REGION=US");
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: `Mailgun error: ${mailgunResponse.status} ${mailgunResponse.statusText}`,
          details: responseJson,
          config: configCheck,
          diagnostics,
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // Success
    auditLog.success = true;
    auditLog.message_id = responseJson.id;
    await logAudit(supabase, auditLog);

    console.log("Test email sent successfully:", responseJson);

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Test email sent successfully",
        message_id: responseJson.id,
        config: configCheck,
        audit: {
          triggered_by: auditLog.triggered_by,
          triggered_at: auditLog.triggered_at,
          to_email: auditLog.to_email,
          template_name: auditLog.template_name,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  } catch (error: any) {
    console.error("Error in test-mailgun:", error);
    auditLog.error = error.message;

    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }
});

async function logAudit(supabase: any, log: AuditLog) {
  try {
    await supabase.from("audit_eos_events").insert({
      tenant_id: 319, // Vivacity tenant
      entity: "mailgun_test",
      action: log.success ? "test_success" : "test_failure",
      reason: `Mailgun test: ${log.template_name} to ${log.to_email}`,
      user_id: null,
      details: {
        triggered_by: log.triggered_by,
        to_email: log.to_email,
        template_name: log.template_name,
        success: log.success,
        message_id: log.message_id,
        error: log.error,
        request_payload: log.request_payload,
        response: log.response,
      },
    });
  } catch (e) {
    console.error("Failed to log audit:", e);
  }
}
