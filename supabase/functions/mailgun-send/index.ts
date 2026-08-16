/**
 * mailgun-send
 *
 * Vendored from production (yxkgdalkbrriasiyyrwk, slug mailgun-send,
 * version 113, verify_jwt: true) on 2026-08-15, then hardened so
 * caller-supplied mergeVars cannot override trusted link keys.
 *
 * Same failure class as the 2026-06-04 redirect incident
 * (`req.headers.get("origin")` used as generateLink redirectTo / APP_BASE_URL).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || "Unicorn Notifications <no-reply@app.unicorn-cms.au>";
const MAIL_REPLY_TO = Deno.env.get("MAIL_REPLY_TO") || "support@app.unicorn-cms.au";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "EU").toUpperCase(); // Default EU


type RoleType = "Admin" | "Staff" | "Super Admin" | string;

interface SendEmailRequest {
  templateSlug: string;
  to: string;
  mergeVars?: Record<string, any>;
  overrides?: {
    subject?: string;
    from?: string;
    replyTo?: string;
  };
}

interface MailgunSendResult {
  ok: boolean;
  status: number;
  id?: string;
  messageId?: string;
  error?: string;
  raw?: string;
}

function getMailgunBase(): string {
  return MAILGUN_REGION === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
}

function safeString(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function renderTemplate(tpl: string, vars: Record<string, any>): string {
  if (!tpl) return "";
  return tpl.replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) => safeString(vars?.[key] ?? ""));
}

async function getUserAndRole(req: Request) {
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data } = await supabaseUser.auth.getUser();
  const user = data?.user ?? null;

  if (!user) return { user: null, role: null as RoleType | null };

  const supabaseSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleRow } = await supabaseSrv
    .from("users")
    .select("role_type")
    .eq("user_uuid", user.id)
    .maybeSingle();

  return { user, role: (roleRow?.role_type as RoleType) ?? null };
}

async function sendViaMailgun(to: string, subject: string, html: string, from: string, replyTo: string) {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    const msg = "Mailgun configuration missing (MAILGUN_API_KEY/MAILGUN_DOMAIN)";
    return { ok: false, status: 500, raw: msg, error: msg };
  }

  const form = new FormData();
  form.append("from", from);
  form.append("to", to);
  form.append("subject", subject);
  form.append("html", html);
  form.append("h:Reply-To", replyTo);
  form.append("o:tracking", "yes");
  form.append("h:X-Client", "Unicorn2");

  const resp = await fetch(`${getMailgunBase()}/v3/${MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`api:${MAILGUN_API_KEY}`) },
    body: form,
  });

  const raw = await resp.text();
  let id: string | undefined;
  try {
    const json = JSON.parse(raw);
    id = json?.id;
  } catch {
    // best-effort: extract from text like 'Queued. Thank you. <id@domain>'
    const m = raw.match(/<([^>]+)>/);
    if (m) id = `<${m[1]}>`;
  }
  return { ok: resp.ok, status: resp.status, raw, id, error: resp.ok ? undefined : raw };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(req) });

  try {
    const { user, role } = await getUserAndRole(req);
    const privileged = role === "Admin" || role === "Staff" || role === "Super Admin";
    if (!user || !privileged) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: corsHeaders(req) });
    }

    const body = (await req.json()) as SendEmailRequest;
    const { templateSlug, to, overrides = {} } = body || {};
    const mergeVars: Record<string, any> = { ...(body?.mergeVars || {}) };
    if (!templateSlug || !to) {
      return new Response(JSON.stringify({ ok: false, error: "Missing templateSlug or to" }), { status: 400, headers: corsHeaders(req) });
    }

    const supabaseSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: tpl, error: tplErr } = await supabaseSrv
      .from("email_templates")
      .select("id, slug, subject, preview_text, html_body, from_address, reply_to")
      .eq("slug", templateSlug)
      .maybeSingle();

    if (tplErr || !tpl) {
      return new Response(JSON.stringify({ ok: false, error: "Template not found" }), { status: 404, headers: corsHeaders(req) });
    }

    // Trusted keys are server-owned. Delete any caller-supplied collision
    // before the spread so APP_BASE_URL cannot be overridden.
    for (const k of ["appBaseUrl", "action_link", "redirect_to"]) delete mergeVars[k]; // APP_BASE_URL wins
    const vars = { preview_text: tpl.preview_text || "", ...mergeVars,
                   appBaseUrl: APP_BASE_URL };

    const subject = overrides.subject || renderTemplate(tpl.subject, vars);
    const from = overrides.from || tpl.from_address || MAIL_FROM;
    const replyTo = overrides.replyTo || tpl.reply_to || MAIL_REPLY_TO;
    const html = renderTemplate(tpl.html_body, vars);

    const mg = await sendViaMailgun(to, subject, html, from, replyTo);

    // Record send status
    const sendStatus = mg.ok ? "sent" : "failed";
    const { error: insErr } = await supabaseSrv.from("email_sends").insert({
      template_id: tpl.id,
      to_address: to,
      merge_vars: mergeVars,
      mailgun_message_id: mg.id || null,
      status: sendStatus,
      error: mg.error || null,
    } as any);

    if (insErr) {
      console.error("mailgun-send: failed to insert email_sends", insErr);
    }

    // Audit log (via user context to satisfy RLS)
    try {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      await supabaseUser.from("audit_log").insert({
        user_uuid: user.id,
        field_name: "email_send",
        old_value: null,
        new_value: JSON.stringify({
          template_slug: templateSlug,
          to,
          status: sendStatus,
          message_id: mg.id || null,
        }),
      } as any);
    } catch (e) {
      console.warn("mailgun-send: audit_log insert skipped/failed:", e);
    }

    const resp: MailgunSendResult = {
      ok: mg.ok,
      status: mg.status,
      id: mg.id,
      messageId: mg.id,
      error: mg.error,
      raw: mg.raw,
    };
    return new Response(JSON.stringify(resp), {
      status: mg.ok ? 200 : (mg.status || 500),
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  } catch (err: any) {
    console.error("mailgun-send: unexpected error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Internal error" }), {
      status: 500,
      headers: corsHeaders(req),
    });
  }
});
