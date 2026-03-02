import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SendComposedEmailRequest {
  tenant_id: number;
  package_id?: number;
  stage_instance_id?: number;
  email_instance_id?: number;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body_html: string;
  dry_run?: boolean;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY");
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN");
    const mailgunRegion = Deno.env.get("MAILGUN_REGION") || "us"; // "us" or "eu"
    const mailgunFromEmail = Deno.env.get("MAILGUN_FROM_EMAIL") || "noreply@vivacity.com.au";
    const mailgunFromName = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity";
    const mailgunBaseUrl = mailgunRegion.toLowerCase() === "eu"
      ? "https://api.eu.mailgun.net/v3"
      : "https://api.mailgun.net/v3";

    // Auth
    const callerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!callerToken) return jsonResponse(401, { error: "Missing Authorization" });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(callerToken);
    if (authErr || !user) return jsonResponse(401, { error: "Unauthorized" });

    const { data: profile } = await supabase
      .from("users")
      .select("unicorn_role, email, first_name, last_name, global_role, job_title")
      .eq("user_uuid", user.id)
      .single();

    if (!profile) return jsonResponse(403, { error: "Profile not found" });

    // Parse body
    const body: SendComposedEmailRequest = await req.json();
    const { tenant_id, package_id, stage_instance_id, email_instance_id, to, cc, bcc, subject, body_html, dry_run } = body;

    if (!to || !subject || !body_html) {
      return jsonResponse(400, { error: "to, subject, and body_html are required" });
    }

    // Resolve merge fields from tenant data
    const { data: tenant } = await supabase
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

    // Get primary contact info
    const { data: primaryContactTu } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenant_id)
      .eq("primary_contact", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (primaryContactTu?.user_id) {
      const { data: contactUser } = await supabase
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

    // CSC data if package
    if (package_id) {
      const { data: cp } = await supabase
        .from("client_packages")
        .select("assigned_csc_user_id")
        .eq("tenant_id", tenant_id)
        .eq("package_id", package_id)
        .maybeSingle();
      if (cp?.assigned_csc_user_id) {
        const { data: csc } = await supabase
          .from("users")
          .select("email, first_name, last_name")
          .eq("user_uuid", cp.assigned_csc_user_id)
          .single();
        if (csc) {
          mergeData["CSCName"] = `${csc.first_name || ""} ${csc.last_name || ""}`.trim();
          mergeData["CSCEmail"] = csc.email || "";
        }
      }
    }
    if (!mergeData["CSCName"]) mergeData["CSCName"] = "Your Consultant";
    if (!mergeData["CSCEmail"]) mergeData["CSCEmail"] = "support@vivacity.com.au";

    // Sender signature merge fields from caller profile
    const senderName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    mergeData["SenderName"] = senderName || "Vivacity Team";
    mergeData["SenderEmail"] = profile.email || "";
    mergeData["SenderRole"] = profile.job_title || profile.unicorn_role || "";

    // Package info
    if (package_id) {
      const { data: pkg } = await supabase.from("packages").select("name, package_code").eq("id", package_id).single();
      if (pkg) {
        mergeData["PackageName"] = pkg.name || "";
        mergeData["PackageCode"] = pkg.package_code || "";
      }
    }

    // Render merge fields
    const render = (text: string): string =>
      text.replace(/\{\{(\w+)\}\}/g, (match, field) =>
        mergeData[field] !== undefined && mergeData[field] !== "" ? mergeData[field] : match
      );

    const renderedSubject = render(subject);
    const renderedBody = render(body_html);
    const renderedTo = render(to);
    const renderedCc = cc ? render(cc) : undefined;
    const renderedBcc = bcc ? render(bcc) : undefined;

    // Plain text
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
        },
      });
    }

    // Send via Mailgun
    if (!mailgunApiKey || !mailgunDomain) {
      return jsonResponse(500, { error: "Email service not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN)" });
    }

    const formData = new FormData();
    formData.append("from", `${mailgunFromName} <${mailgunFromEmail}>`);
    formData.append("to", renderedTo);
    formData.append("subject", renderedSubject);
    formData.append("html", renderedBody);
    formData.append("text", plainText);
    if (renderedCc) formData.append("cc", renderedCc);
    if (renderedBcc) formData.append("bcc", renderedBcc);

    const mgRes = await fetch(`${mailgunBaseUrl}/${mailgunDomain}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}` },
      body: formData,
    });

    const mgText = await mgRes.text();
    let mgResult: any;
    try {
      mgResult = JSON.parse(mgText);
    } catch {
      mgResult = { message: mgText };
    }
    const emailStatus = mgRes.ok ? "sent" : "failed";
    console.log("Mailgun response:", mgRes.status, mgResult);

    // Log to email_send_log
    const ccArr = renderedCc ? renderedCc.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    const bccArr = renderedBcc ? renderedBcc.split(",").map((s: string) => s.trim()).filter(Boolean) : [];

    await supabase.from("email_send_log").insert({
      tenant_id,
      client_id: tenant_id,
      package_id: package_id || null,
      stage_id: stage_instance_id || null,
      to_email: renderedTo,
      cc_emails: ccArr,
      bcc_emails: bccArr,
      from_email: mailgunFromEmail,
      subject: renderedSubject,
      body_html: renderedBody,
      body_text: plainText,
      merge_data: mergeData,
      status: emailStatus,
      error_message: mgRes.ok ? null : JSON.stringify(mgResult),
      provider: "mailgun",
      sent_at: mgRes.ok ? new Date().toISOString() : null,
      created_by: user.id,
    });

    // Mark email_instance as sent if provided
    if (email_instance_id && mgRes.ok) {
      await supabase.from("email_instances").update({
        is_sent: true,
        sent_date: new Date().toISOString(),
        to: renderedTo,
        cc: renderedCc || null,
        bcc: renderedBcc || null,
        subject: renderedSubject,
        content: renderedBody,
        sender_uuid: user.id,
      }).eq("id", email_instance_id);
    }

    // Audit log
    await supabase.from("client_audit_log").insert({
      tenant_id,
      action: "email.composed_sent",
      entity_type: "email_instance",
      entity_id: String(email_instance_id || "manual"),
      actor_user_id: user.id,
      details: { to: renderedTo, cc: renderedCc, bcc: renderedBcc, subject: renderedSubject },
    });

    if (!mgRes.ok) {
      return jsonResponse(500, { success: false, error: "Failed to send email", details: mgResult });
    }

    return jsonResponse(200, {
      success: true,
      message: `Email sent to ${renderedTo}`,
    });
  } catch (e: any) {
    console.error("Error:", e);
    return jsonResponse(500, { error: e?.message || String(e) });
  }
});
