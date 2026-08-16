import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SendEmailRequest {
  templateSlug?: string;
  templateId?: string;
  to: string;
  mergeVars?: Record<string, any>;
  overrides?: {
    subject?: string;
    from?: string;
    replyTo?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const input: SendEmailRequest = await req.json();

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

    const vars = input.mergeVars ?? {};

    const renderTemplate = (tpl: string, mergeVars: Record<string, any>) => {
      let rendered = tpl;
      for (const [key, value] of Object.entries(mergeVars)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
        rendered = rendered.replace(regex, String(value));
      }
      rendered = rendered.replace(/{{APP_BASE_URL}}/g, APP_BASE_URL);
      return rendered;
    };

    const subject = input.overrides?.subject ?? template.subject;
    const renderedSubject = renderTemplate(subject, vars);
    const renderedHtml = renderTemplate(template.html_body, vars);

    const from = input.overrides?.from ?? template.from_address ??
      `Unicorn Notifications <no-reply@${Deno.env.get("MAILGUN_DOMAIN")}>`;
    const replyTo = input.overrides?.replyTo ?? template.reply_to ??
      Deno.env.get("MAIL_REPLY_TO") ?? "support@vivacity.com.au";

    const isAuthEmail = template.slug?.includes("password") ||
      template.slug?.includes("verify") ||
      template.slug?.includes("magic") ||
      subject.toLowerCase().includes("password") ||
      subject.toLowerCase().includes("verify");

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
      console.log("Auth email detected - tracking disabled for:", template.slug || template.id);
    } else {
      formData.append("o:tracking", "yes");
      formData.append("o:tracking-clicks", "yes");
      formData.append("o:tracking-opens", "yes");
    }

    const mailgunUrl = `${baseUrl}/${mailgunDomain}/messages`;
    const auth = "Basic " + btoa(`api:${mailgunApiKey}`);

    console.log("Sending email via Mailgun:", {
      domain: mailgunDomain,
      region: mailgunRegion,
      to: input.to,
      subject: renderedSubject,
      isAuth: isAuthEmail,
    });

    const mailgunResponse = await fetch(mailgunUrl, {
      method: "POST",
      headers: {
        Authorization: auth,
      },
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
          headers: { "Content-Type": "application/json", ...corsHeaders(req) },
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

    console.log("Email sent successfully:", {
      messageId,
      sendId: sentEmail?.id,
      isAuth: isAuthEmail,
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
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  } catch (error: any) {
    console.error("Error in send-enhanced-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }
};

serve(handler);
