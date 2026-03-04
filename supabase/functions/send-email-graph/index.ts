import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string;
  account_email?: string;
}

async function refreshTokenIfNeeded(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  token: TokenRecord
): Promise<string> {
  const expiresAt = new Date(token.expires_at);
  const now = new Date();

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return token.access_token;
  }

  console.log("[send-email-graph] Refreshing token for user:", userId);

  const tokenResponse = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
        scope:
          token.scope ||
          "openid profile email offline_access Mail.Read Mail.Send",
      }),
    }
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("[send-email-graph] Token refresh failed:", errorText);
    throw new Error("Failed to refresh token - user may need to reconnect");
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await supabaseAdmin
    .from("oauth_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || token.refresh_token,
      expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "microsoft");

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth
    const callerToken = req.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!callerToken) return jsonResponse(401, { error: "Missing Authorization" });

    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(callerToken);
    if (authErr || !user) return jsonResponse(401, { error: "Unauthorized" });

    const { data: profile } = await supabaseAdmin
      .from("users")
      .select(
        "unicorn_role, email, first_name, last_name, global_role, job_title"
      )
      .eq("user_uuid", user.id)
      .single();

    if (!profile) return jsonResponse(403, { error: "Profile not found" });

    // Parse body
    const body = await req.json();
    const {
      tenant_id,
      package_id,
      stage_instance_id,
      email_instance_id,
      to,
      cc,
      bcc,
      subject,
      body_html,
      dry_run,
    } = body;

    if (!to || !subject || !body_html) {
      return jsonResponse(400, {
        error: "to, subject, and body_html are required",
      });
    }

    // Fetch Microsoft OAuth token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at, scope, account_email")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .maybeSingle();

    if (tokenError || !tokenData) {
      return jsonResponse(400, {
        error: "no_microsoft_connection",
        message:
          "No Microsoft 365 connection found. Please connect your account in Settings.",
      });
    }

    // Check if Mail.Send scope is present
    const scopeStr = tokenData.scope || "";
    if (!scopeStr.toLowerCase().includes("mail.send")) {
      return jsonResponse(400, {
        error: "insufficient_scope",
        message:
          "Your Microsoft connection does not have email sending permission. Please disconnect and reconnect to grant the Mail.Send scope.",
      });
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(
      supabaseAdmin,
      user.id,
      tokenData as TokenRecord
    );

    // ── Merge field resolution (same logic as send-composed-email) ──

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, name, primary_email, abn, trading_name, legal_name")
      .eq("id", tenant_id)
      .single();

    const mergeData: Record<string, string> = {};
    if (tenant) {
      mergeData["ClientName"] = tenant.name || "";
      mergeData["RTOName"] = tenant.name || "";
      mergeData["TradingName"] = tenant.trading_name || tenant.name || "";
      mergeData["LegalName"] = tenant.legal_name || tenant.name || "";
      mergeData["ABN"] = tenant.abn || "";
    }

    // Primary contact
    const { data: primaryContactTu } = await supabaseAdmin
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenant_id)
      .eq("primary_contact", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (primaryContactTu?.user_id) {
      const { data: contactUser } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name, email")
        .eq("user_uuid", primaryContactTu.user_id)
        .single();
      if (contactUser) {
        mergeData["FirstName"] = contactUser.first_name || "";
        mergeData["LastName"] = contactUser.last_name || "";
        mergeData["ContactEmail"] = contactUser.email || "";
      }
    }

    // CSC data
    if (package_id) {
      const { data: cp } = await supabaseAdmin
        .from("client_packages")
        .select("assigned_csc_user_id")
        .eq("tenant_id", tenant_id)
        .eq("package_id", package_id)
        .maybeSingle();
      if (cp?.assigned_csc_user_id) {
        const { data: csc } = await supabaseAdmin
          .from("users")
          .select("email, first_name, last_name")
          .eq("user_uuid", cp.assigned_csc_user_id)
          .single();
        if (csc) {
          mergeData["CSCName"] =
            `${csc.first_name || ""} ${csc.last_name || ""}`.trim();
          mergeData["CSCEmail"] = csc.email || "";
        }
      }
    }
    if (!mergeData["CSCName"]) mergeData["CSCName"] = "Your Consultant";
    if (!mergeData["CSCEmail"])
      mergeData["CSCEmail"] = "support@vivacity.com.au";

    // Sender
    const senderName =
      `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    mergeData["SenderName"] = senderName || "Vivacity Team";
    mergeData["SenderEmail"] = profile.email || "";
    mergeData["SenderRole"] =
      profile.job_title || profile.unicorn_role || "";

    // Package info
    if (package_id) {
      const { data: pkg } = await supabaseAdmin
        .from("packages")
        .select("name, package_code")
        .eq("id", package_id)
        .single();
      if (pkg) {
        mergeData["PackageName"] = pkg.name || "";
        mergeData["PackageCode"] = pkg.package_code || "";
      }
    }

    // Render merge fields
    const contextualKeys = new Set([
      "CSCName",
      "CSCEmail",
      "PackageName",
      "PackageCode",
      "SenderName",
      "SenderEmail",
      "SenderRole",
    ]);

    const render = (text: string): string => {
      let result = text.replace(/<<(\w+)>>/g, (match, field) =>
        contextualKeys.has(field) &&
        mergeData[field] !== undefined &&
        mergeData[field] !== ""
          ? mergeData[field]
          : match
      );
      result = result.replace(/\{\{(\w+)\}\}/g, (match, field) =>
        mergeData[field] !== undefined && mergeData[field] !== ""
          ? mergeData[field]
          : match
      );
      return result;
    };

    const renderedSubject = render(subject);
    const renderedBody = render(body_html);
    const renderedTo = render(to);
    const renderedCc = cc ? render(cc) : undefined;
    const renderedBcc = bcc ? render(bcc) : undefined;

    // Plain text fallback
    const plainText = renderedBody
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<li>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .trim();

    if (dry_run) {
      return jsonResponse(200, {
        success: true,
        dry_run: true,
        preview: {
          to: renderedTo,
          cc: renderedCc,
          bcc: renderedBcc,
          subject: renderedSubject,
          body_html: renderedBody,
          body_text: plainText,
          merge_data: mergeData,
          sending_as: tokenData.account_email || profile.email,
          provider: "microsoft_graph",
        },
      });
    }

    // ── Send via Microsoft Graph ──

    const toRecipients = renderedTo
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean)
      .map((email: string) => ({
        emailAddress: { address: email },
      }));

    const ccRecipients = renderedCc
      ? renderedCc
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean)
          .map((email: string) => ({ emailAddress: { address: email } }))
      : [];

    const bccRecipients = renderedBcc
      ? renderedBcc
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean)
          .map((email: string) => ({ emailAddress: { address: email } }))
      : [];

    const graphPayload = {
      message: {
        subject: renderedSubject,
        body: {
          contentType: "HTML",
          content: renderedBody,
        },
        toRecipients,
        ccRecipients: ccRecipients.length > 0 ? ccRecipients : undefined,
        bccRecipients: bccRecipients.length > 0 ? bccRecipients : undefined,
      },
      saveToSentItems: true,
    };

    const graphRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(graphPayload),
      }
    );

    const emailStatus = graphRes.ok ? "sent" : "failed";
    let errorMessage: string | null = null;

    if (!graphRes.ok) {
      const errorBody = await graphRes.text();
      console.error(
        "[send-email-graph] Graph API error:",
        graphRes.status,
        errorBody
      );
      errorMessage = errorBody;
    }

    // Log to email_send_log
    const ccArr = renderedCc
      ? renderedCc
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];
    const bccArr = renderedBcc
      ? renderedBcc
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];

    await supabaseAdmin.from("email_send_log").insert({
      tenant_id,
      client_id: tenant_id,
      package_id: package_id || null,
      stage_id: stage_instance_id || null,
      to_email: renderedTo,
      cc_emails: ccArr,
      bcc_emails: bccArr,
      from_email: tokenData.account_email || profile.email,
      subject: renderedSubject,
      body_html: renderedBody,
      body_text: plainText,
      merge_data: mergeData,
      status: emailStatus,
      error_message: errorMessage,
      provider: "microsoft_graph",
      sent_at: graphRes.ok ? new Date().toISOString() : null,
      created_by: user.id,
    });

    // Mark email_instance as sent if provided
    if (email_instance_id && graphRes.ok) {
      await supabaseAdmin
        .from("email_instances")
        .update({
          is_sent: true,
          sent_date: new Date().toISOString(),
          to: renderedTo,
          cc: renderedCc || null,
          bcc: renderedBcc || null,
          subject: renderedSubject,
          content: renderedBody,
          sender_uuid: user.id,
        })
        .eq("id", email_instance_id);
    }

    // Audit log
    await supabaseAdmin.from("client_audit_log").insert({
      tenant_id,
      action: "email.graph_sent",
      entity_type: "email_instance",
      entity_id: String(email_instance_id || "manual"),
      actor_user_id: user.id,
      details: {
        to: renderedTo,
        cc: renderedCc,
        bcc: renderedBcc,
        subject: renderedSubject,
        provider: "microsoft_graph",
        sending_as: tokenData.account_email || profile.email,
      },
    });

    if (!graphRes.ok) {
      return jsonResponse(500, {
        success: false,
        error: "Failed to send email via Microsoft Graph",
        details: errorMessage,
      });
    }

    return jsonResponse(200, {
      success: true,
      message: `Email sent to ${renderedTo} via Microsoft 365`,
      sending_as: tokenData.account_email || profile.email,
      provider: "microsoft_graph",
    });
  } catch (e: any) {
    console.error("[send-email-graph] Error:", e);
    return jsonResponse(500, { error: e?.message || String(e) });
  }
});
