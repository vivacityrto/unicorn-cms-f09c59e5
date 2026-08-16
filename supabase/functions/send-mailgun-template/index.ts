/**
 * send-mailgun-template
 *
 * Sends a stored Mailgun template. Authorization:
 * requireCaller(req, "admin.team_users.manage", "full").
 *
 * `fromOverride` is rejected. From / Reply-To come from Deno.env.
 * Known URL merge slots are constructed from APP_BASE_URL. Every merge
 * variable is HTML-escaped before it is handed to Mailgun.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import { envFromAddress, envReplyTo, sanitizeMergeVars } from "../_shared/email-merge.ts";
import { normalizeAppBaseUrl } from "../_shared/email-urls.ts";

interface SendTemplateRequest {
  to: string;
  template: string;
  subject?: string;
  vars?: Record<string, unknown>;
}

const authTemplates = [
  "magic_link_login_v1",
  "verify_email_v1",
  "reset_password_v1",
  "set_password_v1",
  "password_reset_confirmation_v1",
  "security_new_device_signin_v1",
  "security_password_changed_v1",
];

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const caller = await requireCaller(req, "admin.team_users.manage", "full");
  if (caller instanceof Response) return caller;

  try {
    const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
    const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      throw new Error("Mailgun configuration missing");
    }

    const body = await req.json() as SendTemplateRequest & { fromOverride?: unknown; replyTo?: unknown };
    if (body.fromOverride) {
      return new Response(JSON.stringify({ error: "fromOverride is not accepted" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, template, subject, vars } = body;

    if (!to || !template) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, template" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeVars = sanitizeMergeVars(vars ?? {}, normalizeAppBaseUrl(Deno.env.get("APP_BASE_URL")));

    const formData = new FormData();
    formData.append("to", to);
    formData.append("template", template);
    formData.append("from", envFromAddress());
    formData.append("h:Reply-To", envReplyTo());

    if (subject) {
      formData.append("subject", subject);
    }

    if (Object.keys(safeVars).length > 0) {
      formData.append("h:X-Mailgun-Variables", JSON.stringify(safeVars));
    }

    const isAuthTemplate = authTemplates.includes(template);
    if (isAuthTemplate) {
      formData.append("o:tracking", "no");
      formData.append("o:tracking-clicks", "no");
      formData.append("o:tracking-opens", "no");
    }

    const mailgunResponse = await fetch(`https://api.eu.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });

    const responseData = await mailgunResponse.json();

    if (!mailgunResponse.ok) {
      console.error("Mailgun error:", responseData);
      return new Response(JSON.stringify({
        ok: false,
        error: "Failed to send email",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      messageId: responseData.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error sending template email:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(JSON.stringify({
      ok: false,
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
