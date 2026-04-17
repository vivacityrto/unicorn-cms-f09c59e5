/**
 * send-staff-onboarding-email
 * ----------------------------
 * Sends the team-leader handover email through one of two channels:
 *   - "mailgun"  → system relay (Mailgun EU)
 *   - "graph"    → from the requesting admin's own Outlook mailbox
 *
 * Body: { to, subject, body, channel: "mailgun" | "graph", run_id?: number }
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

function json(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function sendMailgun(to: string, subject: string, html: string, text: string) {
  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  const region = (Deno.env.get("MAILGUN_REGION") || "us").toLowerCase();
  const fromEmail = Deno.env.get("MAILGUN_FROM_EMAIL") || "noreply@vivacity.com.au";
  const fromName = Deno.env.get("MAILGUN_FROM_NAME") || "Vivacity";
  if (!apiKey || !domain) throw new Error("Mailgun not configured");
  const base = region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  const form = new FormData();
  form.append("from", `${fromName} <${fromEmail}>`);
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

async function sendGraph(admin: any, userId: string, to: string, subject: string, html: string) {
  // Lookup user's Outlook OAuth token
  const { data: token } = await admin
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at, scope, account_email")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (!token) {
    const err = new Error("No Microsoft connection — connect Outlook in Integrations, or use 'Send via Mailgun'.");
    (err as any).code = "no_microsoft_connection";
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth) return json(401, { ok: false, error: "Missing Authorization" });
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: aErr } = await admin.auth.getUser(auth);
    if (aErr || !user) return json(401, { ok: false, error: "Unauthorized" });

    const { to, subject, body, channel, run_id } = await req.json();
    if (!to || !subject || !body || !channel) return json(400, { ok: false, error: "to, subject, body, channel required" });

    const html = body.replace(/\n/g, "<br>");
    if (channel === "mailgun") {
      await sendMailgun(to, subject, html, body);
    } else if (channel === "graph") {
      await sendGraph(admin, user.id, to, subject, html);
    } else {
      return json(400, { ok: false, error: `Unknown channel: ${channel}` });
    }

    if (run_id) {
      await admin.from("staff_provisioning_runs").update({ updated_at: new Date().toISOString() }).eq("id", run_id);
    }
    return json(200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as any)?.code;
    console.error("[send-staff-onboarding-email]", msg);
    return json(code === "no_microsoft_connection" ? 412 : 500, { ok: false, error: msg, code });
  }
});
