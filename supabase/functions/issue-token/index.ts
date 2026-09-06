/**
 * HISTORICAL + H3 — issue-token
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (verify_jwt: true).
 * Vendored from production via get_edge_function on 15 Jul 2026
 * (function id 6c56b6de-e935-4b98-a77d-95c7bf7680b5, version 90).
 *
 * H3 / token-issuance hardening (14–15 Jul 2026 Unicorn security audit):
 * - Gateway verify_jwt accepts the public anon key, so in-code caller auth
 *   is required before any token is minted.
 * - Trusted service-role callers (e.g. invite-or-reset-user) pass via
 *   isTrustedInternalCall; external callers must authenticate via
 *   admin.auth.getUser(bearer). Issuing for a different email than the
 *   caller requires check_permission(..., 'admin.team_users.manage', 'full').
 * - Opaque tokens are delivered only via Mailgun — the HTTP response never
 *   includes the raw token value.
 *
 * Feature key confirmed against the only in-repo caller
 * (invite-or-reset-user) and the matching admin user-management gates;
 * no frontend UI invokes this function.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { APP_BASE_URL } from "../_shared/app-base-url.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SIGNING_SECRET = Deno.env.get("TOKEN_SIGNING_SECRET")!;

export type TokenType = "magic" | "verify" | "reset" | "setpwd";

const TTL: Record<TokenType, number> = {
  magic: 15 * 60, // 15 minutes
  verify: 24 * 3600, // 24 hours
  reset: 60 * 60, // 1 hour
  setpwd: 24 * 3600, // 24 hours
};

const EMAIL_SUBJECT: Record<TokenType, string> = {
  magic: "Your Unicorn sign-in link",
  verify: "Verify your Unicorn email",
  reset: "Reset your Unicorn password",
  setpwd: "Set your Unicorn password",
};

const EMAIL_CTA: Record<TokenType, string> = {
  magic: "Sign in to Unicorn",
  verify: "Verify email",
  reset: "Reset password",
  setpwd: "Set password",
};

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(TOKEN_SIGNING_SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function makeOpaqueToken(payload: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(payload);
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const sig = await sign(b64);
  return `${b64}.${sig}`;
}

async function assertRateLimit(supabase: ReturnType<typeof createClient>, email: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("auth_tokens")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);

  if ((count || 0) > 5) {
    throw new Error("Too many requests, please try later.");
  }
}

function buildActionLink(type: TokenType, email: string, token: string): string {
  const path = type === "magic" || type === "verify" ? "/auth/callback" : "/reset-password";
  const url = new URL(path, `${APP_BASE_URL}/`);
  url.searchParams.set("token", token);
  url.searchParams.set("type", type);
  url.searchParams.set("email", email);
  return url.toString();
}

function buildEmailHtml(opts: {
  type: TokenType;
  firstName: string | null;
  actionLink: string;
  expiresAtUnix: number;
}): string {
  const recipientName = opts.firstName || "there";
  const cta = EMAIL_CTA[opts.type];
  const expiryLabel = new Date(opts.expiresAtUnix * 1000).toUTCString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${EMAIL_SUBJECT[opts.type]}</title>
  <style>
    body { margin: 0; padding: 0; background: #f6f8fb; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; }
    .header { background: #6b21a8; padding: 24px; color: #fff; text-align: center; }
    .content { padding: 24px; }
    .btn { display: inline-block; background: #6b21a8; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 500; }
    .muted { color: #666; font-size: 14px; margin-top: 16px; }
    .footer { padding: 16px; text-align: center; color: #666; font-size: 12px; }
    a { color: #6b21a8; }
    .link-box { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 16px 0; word-break: break-all; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">Unicorn</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">${EMAIL_SUBJECT[opts.type]}</h2>
      <p>Hey ${recipientName},</p>
      <p>Use the button below to continue. This link is single-use and expires at ${expiryLabel}.</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${opts.actionLink}" class="btn">${cta}</a>
      </p>
      <p class="muted">If the button doesn't work, copy this link:</p>
      <div class="link-box"><a href="${opts.actionLink}">${opts.actionLink}</a></div>
      <p class="muted">If you didn't request this, you can ignore this email.</p>
    </div>
    <div class="footer">
      Unicorn CMS • <a href="${APP_BASE_URL}">${APP_BASE_URL}</a>
    </div>
  </div>
</body>
</html>`;
}

async function sendTokenEmail(opts: {
  email: string;
  type: TokenType;
  firstName: string | null;
  token: string;
  expiresAtUnix: number;
}): Promise<void> {
  const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
  const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
  const MAILGUN_FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL");
  const MAILGUN_FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "Unicorn CMS";
  const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    throw new Error("MAILGUN_NOT_CONFIGURED");
  }

  const actionLink = buildActionLink(opts.type, opts.email, opts.token);
  const fromEmail = MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;
  const formData = new FormData();
  formData.append("from", `${MAILGUN_FROM_NAME} <${fromEmail}>`);
  formData.append("to", opts.email);
  formData.append("subject", EMAIL_SUBJECT[opts.type]);
  formData.append(
    "html",
    buildEmailHtml({
      type: opts.type,
      firstName: opts.firstName,
      actionLink,
      expiresAtUnix: opts.expiresAtUnix,
    }),
  );

  const apiBase = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const mailgunResponse = await fetch(`${apiBase}/v3/${MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
    },
    body: formData,
  });

  if (!mailgunResponse.ok) {
    const errorText = await mailgunResponse.text();
    console.error("Mailgun error:", {
      status: mailgunResponse.status,
      statusText: mailgunResponse.statusText,
      body: errorText,
    });
    throw new Error("EMAIL_SEND_FAILED");
  }

  console.log(`[issue-token] Mailgun delivery accepted for ${opts.email} type=${opts.type}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const { email, type, meta } = await req.json();

    const currentTime = new Date();
    console.log(`[issue-token] UTC time: ${currentTime.toISOString()}`);

    if (!email || !type) {
      return jsonResponse(req, { error: "Missing required fields" }, 400);
    }

    if (typeof email !== "string" || typeof type !== "string") {
      return jsonResponse(req, { error: "email and type must be strings" }, 400);
    }

    if (!(type in TTL)) {
      return jsonResponse(req, { error: "Invalid token type" }, 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const tokenType = type as TokenType;

    // Authenticate caller before any token is minted.
    // verify_jwt alone is satisfied by the public anon key.
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const isTrustedInternalCall = bearer === SERVICE_KEY;
    if (!isTrustedInternalCall) {
      const { data: callerData, error: callerErr } = await admin.auth.getUser(bearer);
      if (callerErr || !callerData?.user) {
        return jsonResponse(req, { error: "Unauthorized" }, 401);
      }

      const caller = callerData.user;
      const isSelf = caller.email?.toLowerCase() === normalizedEmail;
      if (!isSelf) {
        const { data: allowed } = await admin.rpc("check_permission", {
          p_user_id: caller.id,
          p_feature_key: "admin.team_users.manage",
          p_min_level: "full",
        });
        if (!allowed) {
          return jsonResponse(req, { error: "Forbidden" }, 403);
        }
      }
    }

    const { data: userData, error: userError } = await admin
      .from("users")
      .select("user_uuid, first_name, email")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (userError || !userData) {
      return jsonResponse(req, { error: "User not found" }, 404);
    }

    const user_id = userData.user_uuid;

    await assertRateLimit(admin, normalizedEmail);

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TTL[tokenType];

    console.log(`[issue-token] Token created at: ${new Date(now * 1000).toISOString()}`);
    console.log(`[issue-token] Token expires at: ${new Date(exp * 1000).toISOString()}`);

    const payload = {
      t: tokenType,
      e: normalizedEmail,
      u: user_id,
      iat: now,
      exp,
    };

    const token = await makeOpaqueToken(payload);
    const token_hash = await sha256(token);

    await admin
      .from("auth_tokens")
      .update({ expires_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .eq("token_type", tokenType)
      .is("used_at", null);

    const { error } = await admin.from("auth_tokens").insert({
      user_id,
      email: normalizedEmail,
      token_type: tokenType,
      token_hash,
      expires_at: new Date(exp * 1000).toISOString(),
      meta: meta || {},
    });

    if (error) {
      console.error("Database error:", error);
      throw new Error(error.message);
    }

    // Deliver only via Mailgun — never return the raw token in the HTTP body.
    await sendTokenEmail({
      email: normalizedEmail,
      type: tokenType,
      firstName: userData.first_name,
      token,
      expiresAtUnix: exp,
    });

    return jsonResponse(req, {
      ok: true,
      email: normalizedEmail,
      type: tokenType,
      expiresAt: exp,
      message: "Token emailed successfully",
    });
  } catch (error: unknown) {
    console.error("Error in issue-token function:", error);
    return jsonResponse(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
