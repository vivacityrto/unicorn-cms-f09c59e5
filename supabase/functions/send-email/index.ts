/**
 * send-email
 *
 * Vendored from production (yxkgdalkbrriasiyyrwk, slug send-email,
 * version 135, verify_jwt: true) on 2026-08-15, then hardened so
 * request action_link / redirect_to / redirectTo / emailRedirectTo are ignored (APP_BASE_URL only).
 *
 * Verify links are built from APP_BASE_URL plus the token returned by
 * the Supabase Auth admin API (direct mode) or the Auth hook payload
 * token (hook mode — already minted by that API). A caller may only
 * influence the post-verify landing page with a safe relative path.
 *
 * Same failure class as the 2026-06-04 redirect incident.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Env vars
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SEND_EMAIL_HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "").toUpperCase(); // optional: "EU" | "US"
const MAIL_FROM_ADDRESS = Deno.env.get("MAIL_FROM_ADDRESS") || Deno.env.get("MAILGUN_FROM_EMAIL") || "";
const MAIL_FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Vivacity";
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://unicorn-cms.au").replace(/\/+$/, "");

// Optional template names (can be overridden in project secrets)
const TEMPLATE_PASSWORD_RESET = Deno.env.get("MAILGUN_TEMPLATE_PASSWORD_RESET") || "auth_password_reset";
const TEMPLATE_SIGNUP = Deno.env.get("MAILGUN_TEMPLATE_SIGNUP") || "auth_verify_email";
const TEMPLATE_MAGIC_LINK = Deno.env.get("MAILGUN_TEMPLATE_MAGIC_LINK") || "auth_magic_link";
const TEMPLATE_EMAIL_CHANGE = Deno.env.get("MAILGUN_TEMPLATE_EMAIL_CHANGE") || "auth_email_change";

// Static variables required by the user
const PRODUCT_NAME = "Welcome to Vivacity";
const SUPPORT_EMAIL = "support@vivacity.com.au";
const SUPPORT_PHONE = "1300 729 455";


type AuthLinkType = "recovery" | "signup" | "magiclink" | "email_change";

const isSafeRelative = (p: string) =>
  typeof p === "string" && p.startsWith("/") && !p.startsWith("//") &&
  !p.includes("://") && !p.includes("\\");

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function getMailgunBase(): string {
  if (MAILGUN_REGION === "EU" || MAILGUN_DOMAIN.endsWith(".eu")) return "https://api.eu.mailgun.net";
  return "https://api.mailgun.net";
}

function buildFromHeader(): string {
  if (MAIL_FROM_ADDRESS.includes("<") || MAIL_FROM_ADDRESS.includes(">")) return MAIL_FROM_ADDRESS;
  return `${MAIL_FROM_NAME} <${MAIL_FROM_ADDRESS}>`;
}

function redactSensitive(input: any): any {
  try {
    if (input === null || input === undefined) return input;
    if (typeof input === "string") {
      let v = input;
      const patterns = [
        /token=[^&]+/gi,
        /access_token=[^&]+/gi,
        /refresh_token=[^&]+/gi,
        /token_hash[^=]*=[^&]+/gi,
      ];
      for (const p of patterns) {
        v = v.replace(p, (m) => `${m.split("=")[0]}=[REDACTED]`);
      }
      return v;
    }
    if (Array.isArray(input)) return input.map(redactSensitive);
    if (typeof input === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(input)) {
        if (/token|action_link|redirect/i.test(k)) { // redacted; links use APP_BASE_URL
          out[k] = "[REDACTED]";
        } else {
          out[k] = redactSensitive(v);
        }
      }
      return out;
    }
    return input;
  } catch (_) {
    return "[REDACTED]";
  }
}

async function insertLog(log: {
  to_email: string;
  template_name: string;
  variables: Record<string, any>;
  status: string;
  error_message?: string | null;
}) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("email_logs").insert({
      to_email: log.to_email,
      template_name: log.template_name,
      variables: log.variables,
      status: log.status,
      error_message: log.error_message ?? null,
    });
  } catch (e) {
    console.error("send-email: failed to insert email_logs", e);
  }
}

async function getUserFromAuthHeader(req: Request) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

async function getUserRole(userId: string) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("users")
      .select("role_type")
      .eq("user_uuid", userId)
      .maybeSingle();
    return data?.role_type ?? null;
  } catch {
    return null;
  }
}

function mapHookTypeToTemplate(type: string): string {
  switch (type) {
    case "password_reset":
    case "recovery":
      return TEMPLATE_PASSWORD_RESET;
    case "signup":
    case "verify":
      return TEMPLATE_SIGNUP;
    case "magic_link":
    case "magiclink":
      return TEMPLATE_MAGIC_LINK;
    case "email_change":
      return TEMPLATE_EMAIL_CHANGE;
    default:
      return TEMPLATE_SIGNUP; // sensible default
  }
}

function mapHookTypeToAuthType(type: string): AuthLinkType {
  switch (type) {
    case "password_reset":
    case "recovery":
      return "recovery";
    case "magic_link":
    case "magiclink":
      return "magiclink";
    case "email_change":
      return "email_change";
    default:
      return "signup";
  }
}

function inferAuthLinkType(templateName: string, explicitType?: unknown): AuthLinkType | null {
  if (explicitType === "recovery" || explicitType === "signup" || explicitType === "magiclink" || explicitType === "email_change") {
    return explicitType;
  }
  if (templateName === TEMPLATE_PASSWORD_RESET || /password|reset|recovery/i.test(templateName)) return "recovery";
  if (templateName === TEMPLATE_MAGIC_LINK || /magic/i.test(templateName)) return "magiclink";
  if (templateName === TEMPLATE_EMAIL_CHANGE || /email_change|email-change/i.test(templateName)) return "email_change";
  if (templateName === TEMPLATE_SIGNUP || /verify|signup|sign_up/i.test(templateName)) return "signup";
  return null;
}

function defaultLandingPath(type: AuthLinkType | null): string {
  if (type === "recovery") return "/reset-password";
  if (type === "magiclink") return "/auth/callback";
  return "/activate";
}

function resolveLandingPath(requested: unknown, fallback: string): { ok: true; path: string } | { ok: false } {
  if (requested == null || requested === "") return { ok: true, path: fallback };
  if (typeof requested !== "string" || !isSafeRelative(requested)) return { ok: false };
  return { ok: true, path: requested };
}

function buildActivateLink(token: string, type: AuthLinkType, email: string): string {
  return `${APP_BASE_URL}/activate?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}&email=${encodeURIComponent(email)}`;
}

function isLikelyHookPayload(body: any): boolean {
  try {
    if (!body || typeof body !== "object") return false;
    const type = body?.type || body?.email_action_type || body?.event;
    const email = body?.email || body?.user?.email;
    const ed = body?.email_data || body?.data || {};
    const hasTokenish = !!(ed?.token || ed?.token_hash || ed?.token_new || ed?.token_hash_new);
    const looksAuthy = !!(type && email && (ed || hasTokenish));
    return Boolean(looksAuthy);
  } catch {
    return false;
  }
}

async function sendViaMailgun(to: string, template: string, variables: Record<string, any>, subject?: string) {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !MAIL_FROM_ADDRESS) {
    const msg = "Mailgun configuration missing (MAILGUN_API_KEY/MAILGUN_DOMAIN/MAIL_FROM_EMAIL)";
    return { ok: false, status: 500, raw: msg, error: msg };
  }

  const form = new FormData();
  form.append("from", buildFromHeader());
  form.append("to", to);
  form.append("template", template);
  // Pass variables via header field as requested, and keep t:variables for broader compatibility
  form.append("h:X-Mailgun-Variables", JSON.stringify(variables));
  form.append("t:variables", JSON.stringify(variables));
  if (subject) form.append("subject", subject);

  const resp = await fetch(`${getMailgunBase()}/v3/${MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`api:${MAILGUN_API_KEY}`) },
    body: form,
  });
  const raw = await resp.text();
  return { ok: resp.ok, status: resp.status, raw, error: resp.ok ? undefined : raw };
}

function stripRequestLinkKeys(obj: Record<string, any> | null | undefined): Record<string, any> {
  const out = { ...(obj || {}) };
  // action_link / redirect_to / redirectTo / emailRedirectTo are never taken from the request; APP_BASE_URL only.
  for (const k of ["appBaseUrl", "action_link", "redirect_to", "redirectTo", "emailRedirectTo"]) { // APP_BASE_URL wins
    delete out[k];
  }
  return out;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(req) });

  try {
    // Detect AUTH HOOK mode: presence of valid x-hook-secret only
    const isHookHeader = req.headers.get("x-hook-secret") === SEND_EMAIL_HOOK_SECRET && SEND_EMAIL_HOOK_SECRET.length > 0;

    // Try to parse body but handle non-JSON gracefully
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const isHookMode = isHookHeader;
    if (!isHookMode && isLikelyHookPayload(body)) {
      // Reject payload-only hook attempts without the correct secret header
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: corsHeaders(req) });
    }

    if (isHookMode) {
      // Payloads vary depending on Supabase version; support several shapes
      const evtType = (body?.type || body?.email_action_type || body?.event || "").toString();
      const email = (body?.email || body?.user?.email || body?.user?.user_metadata?.email || body?.user_metadata?.email || "").toString();
      const emailData = body?.email_data || body?.data || {};

      if (!evtType || !email) {
        console.log("send-email: invalid hook payload", { evtType, email });
        return new Response(JSON.stringify({ ok: false, error: "Invalid auth hook payload" }), { status: 400, headers: corsHeaders(req) });
      }

      const token = emailData?.token ?? emailData?.token_hash ?? emailData?.tokenHash ?? emailData?.token_hash_new ?? emailData?.token_new;
      if (!token) {
        return json(req, 400, { error: "MISSING_TOKEN" });
      }

      const authType = mapHookTypeToAuthType(evtType);
      const landing = resolveLandingPath(
        body.redirect_path ?? emailData.redirect_path,
        defaultLandingPath(authType),
      );
      if (!landing.ok) return json(req, 400, { error: "INVALID_REDIRECT_PATH" });
      const landingUrl = `${APP_BASE_URL}${landing.path}`;

      // Never use action_link / redirect_to / redirectTo from the hook body (APP_BASE_URL only).
      // CTA is the scanner-safe /activate URL; landingUrl is APP_BASE_URL + relative path.
      const verify_link = buildActivateLink(String(token), authType, email);

      const template = mapHookTypeToTemplate(evtType);
      const extraVars = stripRequestLinkKeys(emailData?.variables);

      const vars = {
        product_name: PRODUCT_NAME,
        support_email: SUPPORT_EMAIL,
        support_phone: SUPPORT_PHONE,
        email,
        ...extraVars,
        redirect_url: verify_link,
        site_url: APP_BASE_URL,
        landing_url: landingUrl,
      };

      console.log("send-email: hook", { evtType, email, template });
      const result = await sendViaMailgun(email, template, vars, emailData?.subject);

      await insertLog({
        to_email: email,
        template_name: template,
        variables: redactSensitive(vars),
        status: result.ok ? "sent" : "error",
        error_message: result.error as string | undefined,
      });

      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : (result.status || 500),
        headers: corsHeaders(req),
      });
    }

    // DIRECT MODE: require authenticated Admin/Super Admin (no secret-based bypass)
    const user = await getUserFromAuthHeader(req);
    const role = user?.id ? await getUserRole(user.id) : null;
    const authorized = role === "Admin" || role === "Super Admin";
    if (!authorized) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: corsHeaders(req) });
    }

    const { to, template_name, variables, subject, type: explicitType, redirect_path } = body || {};
    if (!to || !template_name) {
      return new Response(JSON.stringify({ ok: false, error: "Missing 'to' or 'template_name'" }), { status: 400, headers: corsHeaders(req) });
    }

    const toEmail = Array.isArray(to) ? String(to[0] || "") : String(to);
    const mergeVars = stripRequestLinkKeys(variables);
    const linkType = inferAuthLinkType(String(template_name), explicitType);
    const landing = resolveLandingPath(redirect_path, defaultLandingPath(linkType));
    if (!landing.ok) return json(req, 400, { error: "INVALID_REDIRECT_PATH" });

    let verify_link: string | undefined;
    if (linkType) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: linkType,
        email: toEmail,
        options: { redirectTo: `${APP_BASE_URL}${landing.path}` },
      });
      if (linkError || !linkData?.properties?.action_link) { // token only; URL from APP_BASE_URL
        return json(req, 500, { error: "LINK_GENERATION_FAILED", detail: linkError?.message });
      }
      // Token from the Auth admin API; URL rebuilt from APP_BASE_URL (ignore GoTrue action_link host).
      const generatedLink = linkData.properties.action_link as string; // token only; URL from APP_BASE_URL
      let rawToken: string | null = null;
      try {
        rawToken = new URL(generatedLink).searchParams.get("token");
      } catch {
        rawToken = null;
      }
      if (!rawToken) {
        return json(req, 500, { error: "TOKEN_EXTRACT_FAILED" });
      }
      verify_link = buildActivateLink(rawToken, linkType, toEmail);
    }

    const vars = {
      product_name: PRODUCT_NAME,
      support_email: SUPPORT_EMAIL,
      support_phone: SUPPORT_PHONE,
      site_url: APP_BASE_URL,
      ...mergeVars,
      ...(verify_link
        ? { redirect_url: verify_link, landing_url: `${APP_BASE_URL}${landing.path}` }
        : {}),
    };

    console.log("send-email: direct", { to, template_name });
    const result = await sendViaMailgun(to, template_name, vars, subject);

    await insertLog({
      to_email: Array.isArray(to) ? to.join(", ") : to,
      template_name,
      variables: redactSensitive(vars),
      status: result.ok ? "sent" : "error",
      error_message: result.error as string | undefined,
    });

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : (result.status || 500),
      headers: corsHeaders(req),
    });
  } catch (err: any) {
    console.error("send-email: unexpected error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Internal error" }), {
      status: 500,
      headers: corsHeaders(req),
    });
  }
});
