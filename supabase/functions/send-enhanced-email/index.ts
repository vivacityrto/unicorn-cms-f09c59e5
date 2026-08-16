/**
 * send-enhanced-email
 *
 * Renders a stored email_templates row and sends it via Mailgun.
 *
 * Authorization: requireCaller(req, "admin.team_users.manage", "full").
 * verify_jwt is not authorization.
 *
 * Sender identity is Deno.env only — `overrides.from` is rejected.
 * Known URL merge slots are constructed from APP_BASE_URL. Every merge
 * variable is HTML-escaped before it reaches the template.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import { envFromAddress, envReplyTo, sanitizeMergeVars } from "../_shared/email-merge.ts";
import { escapeHtml } from "../_shared/escape-html.ts";
import { normalizeAppBaseUrl } from "../_shared/email-urls.ts";

interface SendEmailRequest {
  templateSlug?: string;
  templateId?: string;
  to: string;
  mergeVars?: Record<string, unknown>;
  overrides?: {
    subject?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireCaller(req, "admin.team_users.manage", "full");
  if (caller instanceof Response) return caller;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const input: SendEmailRequest = await req.json();

    if ((input as { overrides?: { from?: unknown } }).overrides?.from) {
      return new Response(
        JSON.stringify({ error: "overrides.from is not accepted" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    let templateQuery = supabase.from("email_templates").select("*");
    if (input.templateSlug) {
      templateQuery = templateQuery.eq("slug", input.templateSlug);
    } else if (input.templateId) {
      templateQuery = templateQuery.eq("id", input.templateId);
    } else {
      throw new Error("Either templateSlug or templateId is required");
    }

    const { data: template, error: templateError } = await templateQuery.single();
    if (templateError || !template) {
      console.error("Template not found:", templateError);
      throw new Error("Email template not found");
    }

    const appBaseUrl = normalizeAppBaseUrl(Deno.env.get("APP_BASE_URL"));
    const vars = sanitizeMergeVars(input.mergeVars ?? {}, appBaseUrl);

    const renderTemplate = (tpl: string, merge: Record<string, string>) => {
      let rendered = tpl;
      for (const [key, value] of Object.entries(merge)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
        rendered = rendered.replace(regex, value);
      }
      rendered = rendered.replace(/{{APP_BASE_URL}}/g, escapeHtml(appBaseUrl));
      return rendered;
    };

    const subject = input.overrides?.subject ?? template.subject;
    const renderedSubject = renderTemplate(subject, vars);
    const renderedHtml = renderTemplate(template.html_body, vars);

    const from = envFromAddress();
    const replyTo = envReplyTo();

    const isAuthEmail = template.slug?.includes("password") ||
      template.slug?.includes("verify") ||
      template.slug?.includes("magic") ||
      String(subject).toLowerCase().includes("password") ||
      String(subject).toLowerCase().includes("verify");

    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN");
    const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY");
    const mailgunRegion = Deno.env.get("MAILGUN_REGION")?.toLowerCase() || "us";

    if (!mailgunApiKey || !mailgunDomain) {
      throw new Error("Mailgun not configured");
    }

    const baseUrl = mailgunRegion === "eu"
      ? "https://api.eu.mailgun.net/v3"
      : "https://api.mailgun.net/v3";

    const formData = new FormData();
    formData.append("from", from);
    formData.append("to", input.to);
    formData.append("subject", renderedSubject);
    formData.append("html", renderedHtml);
    formData.append("h:Reply-To", replyTo);

    if (isAuthEmail) {
      formData.append("o:tracking", "no");
      formData.append("o:tracking-clicks", "no");
      formData.append("o:tracking-opens", "no");
    } else {
      formData.append("o:tracking", "yes");
      formData.append("o:tracking-clicks", "yes");
      formData.append("o:tracking-opens", "yes");
    }

    const mailgunUrl = `${baseUrl}/${mailgunDomain}/messages`;
    const auth = "Basic " + btoa(`api:${mailgunApiKey}`);

    const mailgunResponse = await fetch(mailgunUrl, {
      method: "POST",
      headers: { Authorization: auth },
      body: formData,
    });

    const mailgunBody = await mailgunResponse.json().catch(() => ({}));

    if (!mailgunResponse.ok) {
      console.error("Mailgun send failed:", mailgunResponse.status, mailgunBody);

      const { data: failedSend } = await supabase
        .from("email_sends")
        .insert({
          template_id: template.id,
          to_address: input.to,
          merge_vars: vars,
          status: "failed",
          error: mailgunBody?.message ?? `HTTP ${mailgunResponse.status}`,
        })
        .select("id")
        .single();

      return new Response(
        JSON.stringify({
          status: "failed",
          sendId: failedSend?.id,
          error: mailgunBody?.message ?? `HTTP ${mailgunResponse.status}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const messageId = mailgunBody?.id ?? mailgunBody?.messageId ?? null;
    const { data: sentEmail } = await supabase
      .from("email_sends")
      .insert({
        template_id: template.id,
        to_address: input.to,
        merge_vars: vars,
        mailgun_message_id: messageId,
        status: "sent",
      })
      .select("id")
      .single();

    await supabase.from("audit_events").insert({
      entity: "email_send",
      entity_id: sentEmail?.id,
      action: "send",
      details: {
        templateSlug: input.templateSlug || template.slug,
        messageId,
        isAuth: isAuthEmail,
        to: input.to,
      },
    });

    return new Response(
      JSON.stringify({
        status: "sent",
        messageId,
        sendId: sentEmail?.id,
        isAuth: isAuthEmail,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error("Error in send-enhanced-email function:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

serve(handler);
