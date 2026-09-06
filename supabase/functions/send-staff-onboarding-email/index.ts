/**
 * send-staff-onboarding-email
 * ----------------------------
 * Sends the team-leader handover email through one of two channels:
 *   - "mailgun"  → system relay (Mailgun EU)
 *   - "graph"    → from the requesting admin's own Outlook mailbox
 *
 * Authorization: requireCaller(req, "admin.team_users.manage", "full").
 * verify_jwt is not authorization.
 *
 * From address for Mailgun is Deno.env only. The Graph channel sends as
 * the authenticated admin's mailbox (not a caller-supplied From). Body
 * interpolations are HTML-escaped. CORS is APP_BASE_URL-derived.
 *
 * Body: { to, subject, body, channel: "mailgun" | "graph", run_id?: number }
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import { escapeHtml } from "../_shared/escape-html.ts";
import { envFromAddress } from "../_shared/email-merge.ts";

const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

function json(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function sendMailgun(to: string, subject: string, html: string, text: string) {
  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  const region = (Deno.env.get("MAILGUN_REGION") || "us").toLowerCase();
  if (!apiKey || !domain) throw new Error("Mailgun not configured");
  const base = region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  const form = new FormData();
  form.append("from", envFromAddress());
  form.append("to", to);
  form.append("subject", subject);
  form.append("text", text);
  form.append("html", html);
  const res = await fetch(`${base}/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Mailgun ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function sendGraph(
  admin: ReturnType<typeof createClient>,
  userId: string,
  to: string,
  subject: string,
  html: string,
) {
  const { data: token } = await admin
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at, scope, account_email")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (!token) {
    const err = new Error("No Microsoft connection — connect Outlook in Integrations, or use 'Send via Mailgun'.");
    (err as { code?: string }).code = "no_microsoft_connection";
    throw err;
  }

  let accessToken = token.access_token;
  if (new Date(token.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) throw new Error("MICROSOFT_CLIENT_ID/SECRET missing");
    const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
        scope: token.scope || "openid profile email offline_access Mail.Send",
      }),
    });
    if (!r.ok) throw new Error("Token refresh failed — please reconnect Outlook");
    const t = await r.json();
    accessToken = t.access_token;
    await admin.from("oauth_tokens").update({
      access_token: t.access_token,
      refresh_token: t.refresh_token || token.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("provider", "microsoft");
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail ${res.status}: ${await res.text()}`);
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireCaller(req, "admin.team_users.manage", "full");
  if (caller instanceof Response) return caller;
  const { userId } = caller;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { to, subject, body, channel, run_id } = await req.json();
    if (!to || !subject || !body || !channel) {
      return json(400, { ok: false, error: "to, subject, body, channel required" }, corsHeaders);
    }

    const safeBody = escapeHtml(body);
    const html = safeBody.replace(/\n/g, "<br>");
    if (channel === "mailgun") {
      await sendMailgun(to, subject, html, String(body));
    } else if (channel === "graph") {
      if (!userId) return json(401, { ok: false, error: "Unauthorized" }, corsHeaders);
      await sendGraph(supabase, userId, to, subject, html);
    } else {
      return json(400, { ok: false, error: `Unknown channel: ${channel}` }, corsHeaders);
    }

    if (run_id) {
      await supabase.from("staff_provisioning_runs").update({ updated_at: new Date().toISOString() }).eq("id", run_id);
    }
    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    console.error("[send-staff-onboarding-email]", msg);
    return json(code === "no_microsoft_connection" ? 412 : 500, { ok: false, error: msg, code }, corsHeaders);
  }
});
