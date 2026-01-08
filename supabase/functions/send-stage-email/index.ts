import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  tenant_id: number;
  client_id?: number; // Client ID for timeline tracking
  package_id?: number;
  stage_id?: number;
  email_template_id: string;
  recipient_type: "tenant" | "internal" | "both";
  to_override?: string; // For test sends
  dry_run?: boolean; // For preview
  stage_release_id?: string; // Track which release triggered email
}

interface MergeData {
  [key: string]: string | undefined;
}

interface EmailTemplateRow {
  id: string;
  internal_name: string;
  subject: string;
  html_body: string;
  version: number;
  status: string;
}

interface TenantRow {
  id: number;
  name: string;
  primary_email: string | null;
  abn: string | null;
  trading_name: string | null;
  legal_name: string | null;
}

interface PackageRow {
  id: number;
  name: string;
  package_code: string | null;
}

interface StageRow {
  id: number;
  title: string;
}

interface UserRow {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY");
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN");
    const mailgunFromEmail = Deno.env.get("MAILGUN_FROM_EMAIL") || "noreply@vivacity.com.au";
    const mailgunFromName = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity";

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate auth - must be SuperAdmin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is SuperAdmin
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("unicorn_role, email, first_name, last_name")
      .eq("user_uuid", user.id)
      .single();

    if (userError || userData?.unicorn_role !== "Super Admin") {
      console.error("Permission denied - not SuperAdmin:", userError);
      return new Response(
        JSON.stringify({ error: "Permission denied. SuperAdmin access required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SendEmailRequest = await req.json();
    const { tenant_id, client_id, package_id, stage_id, email_template_id, recipient_type, to_override, dry_run, stage_release_id } = body;

    console.log("Processing send-stage-email request:", { tenant_id, package_id, stage_id, email_template_id, recipient_type, dry_run });

    // 1. Fetch email template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("id, internal_name, subject, html_body, version, status")
      .eq("id", email_template_id)
      .single();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      return new Response(
        JSON.stringify({ error: "Email template not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedTemplate = template as EmailTemplateRow;

    // Check template status for actual sends
    if (!dry_run && typedTemplate.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Cannot send draft or archived template. Please activate the template first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Build merge data
    const mergeData: MergeData = {};
    const warnings: string[] = [];

    // Fetch tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, primary_email, abn, trading_name, legal_name")
      .eq("id", tenant_id)
      .single();

    if (tenantError) {
      console.error("Tenant not found:", tenantError);
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedTenant = tenant as TenantRow;
    mergeData["ClientName"] = typedTenant.name || "";
    mergeData["RTOName"] = typedTenant.name || "";
    mergeData["TradingName"] = typedTenant.trading_name || typedTenant.name || "";
    mergeData["LegalName"] = typedTenant.legal_name || typedTenant.name || "";
    mergeData["ABN"] = typedTenant.abn || "";

    // Fetch package data if provided
    if (package_id) {
      const { data: pkg } = await supabase
        .from("packages")
        .select("id, name, package_code")
        .eq("id", package_id)
        .single();

      if (pkg) {
        const typedPackage = pkg as PackageRow;
        mergeData["PackageName"] = typedPackage.name || "";
        mergeData["PackageCode"] = typedPackage.package_code || "";
      }
    }

    // Fetch stage data if provided
    if (stage_id) {
      const { data: stage } = await supabase
        .from("documents_stages")
        .select("id, title")
        .eq("id", stage_id)
        .single();

      if (stage) {
        const typedStage = stage as StageRow;
        mergeData["StageName"] = typedStage.title || "";
      }
    }

    // Fetch CSC data if package has assigned CSC
    if (package_id) {
      const { data: clientPackage } = await supabase
        .from("client_packages")
        .select("assigned_csc_user_id")
        .eq("tenant_id", tenant_id)
        .eq("package_id", package_id)
        .maybeSingle();

      if (clientPackage?.assigned_csc_user_id) {
        const { data: csc } = await supabase
          .from("users")
          .select("email, first_name, last_name")
          .eq("user_uuid", clientPackage.assigned_csc_user_id)
          .single();

        if (csc) {
          const typedCsc = csc as UserRow;
          mergeData["CSCName"] = `${typedCsc.first_name || ""} ${typedCsc.last_name || ""}`.trim();
          mergeData["CSCEmail"] = typedCsc.email || "";
        }
      }
    }

    // Default CSC values if not found
    if (!mergeData["CSCName"]) {
      mergeData["CSCName"] = "Your Consultant";
    }
    if (!mergeData["CSCEmail"]) {
      mergeData["CSCEmail"] = "support@vivacity.com.au";
    }

    // 3. Render subject and body by replacing {{FieldName}} tokens
    const renderTemplate = (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
        if (mergeData[fieldName] !== undefined && mergeData[fieldName] !== "") {
          return escapeHtml(mergeData[fieldName]!);
        }
        warnings.push(`Missing merge field: ${fieldName}`);
        return match; // Leave unresolved tokens visible
      });
    };

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const renderedSubject = renderTemplate(typedTemplate.subject);
    const renderedBody = renderTemplate(typedTemplate.html_body);

    // 4. Resolve recipients
    const recipients: string[] = [];
    
    if (to_override) {
      // Test send to specific email
      recipients.push(to_override);
    } else {
      if (recipient_type === "tenant" || recipient_type === "both") {
        if (typedTenant.primary_email) {
          recipients.push(typedTenant.primary_email);
        } else {
          warnings.push("Tenant has no primary email configured");
        }
      }
      
      if (recipient_type === "internal" || recipient_type === "both") {
        if (mergeData["CSCEmail"] && mergeData["CSCEmail"] !== "support@vivacity.com.au") {
          recipients.push(mergeData["CSCEmail"]);
        } else {
          // Fallback to current user for internal
          recipients.push(userData.email);
        }
      }
    }

    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients)];

    // 5. If dry_run, return preview without sending
    if (dry_run) {
      console.log("Dry run - returning preview");
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          preview: {
            subject: renderedSubject,
            body_html: renderedBody,
            recipients: uniqueRecipients,
            merge_data: mergeData,
            warnings: warnings,
            template_name: typedTemplate.internal_name,
            template_version: typedTemplate.version,
            template_status: typedTemplate.status,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Validate we have recipients
    if (uniqueRecipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No recipients found. Please configure tenant email or specify a recipient." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Send email via Mailgun
    if (!mailgunApiKey || !mailgunDomain) {
      console.error("Mailgun not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured. Please add MAILGUN_API_KEY and MAILGUN_DOMAIN secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
    
    const formData = new FormData();
    formData.append("from", `${mailgunFromName} <${mailgunFromEmail}>`);
    formData.append("to", uniqueRecipients.join(","));
    formData.append("subject", renderedSubject);
    formData.append("html", renderedBody);

    // Generate plain text version
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
    formData.append("text", plainText);

    console.log("Sending email via Mailgun to:", uniqueRecipients);

    const mailgunResponse = await fetch(mailgunUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}`,
      },
      body: formData,
    });

    const mailgunResult = await mailgunResponse.json();
    const emailStatus = mailgunResponse.ok ? "sent" : "failed";
    const errorMessage = mailgunResponse.ok ? null : JSON.stringify(mailgunResult);

    console.log("Mailgun response:", mailgunResponse.status, mailgunResult);

    // 8. Log the send (this triggers timeline event via DB trigger)
    const { data: logEntry, error: logError } = await supabase
      .from("email_send_log")
      .insert({
        tenant_id: tenant_id,
        client_id: client_id || tenant_id, // Use client_id if provided, fallback to tenant_id
        package_id: package_id || null,
        stage_id: stage_id || null,
        stage_release_id: stage_release_id || null,
        email_template_id: email_template_id,
        email_template_version: typedTemplate.version,
        to_email: uniqueRecipients.join(","),
        cc_emails: [],
        bcc_emails: [],
        from_email: mailgunFromEmail,
        subject: renderedSubject,
        body_html: renderedBody,
        body_text: plainText,
        merge_data: mergeData,
        status: emailStatus,
        error_message: errorMessage,
        provider: 'mailgun',
        sent_at: emailStatus === "sent" ? new Date().toISOString() : null,
        created_by: user.id,
      })
      .select("id")
      .single();

    // Log email sent event for audit
    if (stage_release_id && emailStatus === "sent") {
      await supabase.from("client_audit_log").insert({
        tenant_id: tenant_id,
        action: "email.documents_ready_sent",
        entity_type: "stage_release",
        entity_id: stage_release_id,
        actor_user_id: user.id,
        details: {
          email_template_id,
          recipients: uniqueRecipients,
          subject: renderedSubject
        }
      });
    }

    if (logError) {
      console.error("Failed to log email send:", logError);
    }

    // 9. Return result
    if (!mailgunResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Failed to send email", 
          details: mailgunResult,
          log_id: logEntry?.id 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent successfully to ${uniqueRecipients.join(", ")}`,
        log_id: logEntry?.id,
        recipients: uniqueRecipients,
        warnings: warnings.length > 0 ? warnings : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-stage-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
