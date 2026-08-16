/**
 * Shared caller authentication for Edge Functions.
 *
 * Modelled on cohort-access-sender-worker: service-role admin.auth.getUser(token)
 * is the only acceptable way to establish caller identity. Never base64-decode a
 * JWT to read claims, and never trust a `role` claim from an unverified token.
 *
 * Bearer tokens are accepted only as exactly `Bearer <token>` (two parts).
 * A prefix replace (`authHeader.replace(/^Bearer\s+/i, "")`) is not sufficient.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  allowlistFromAppBaseUrl,
  constantTimeEqual,
  parseBearerToken,
} from "./requireCaller-helpers.ts";

export {
  allowlistFromAppBaseUrl,
  constantTimeEqual,
  parseBearerToken,
} from "./requireCaller-helpers.ts";

export type PermissionMinLevel = "full" | "edit" | "view";

const DEFAULT_ALLOW_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
];

export function corsHeadersFor(
  req: Request,
  extraAllowHeaders: string[] = [],
): Record<string, string> {
  const appBase = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/+$/, "");
  const allowlist = allowlistFromAppBaseUrl(appBase);
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && allowlist.has(origin) ? origin : (appBase || "null");
  const allowHeaders = [...DEFAULT_ALLOW_HEADERS, ...extraAllowHeaders];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": allowHeaders.join(", "),
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, PATCH, DELETE",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, status: number, body: unknown, extraAllowHeaders?: string[]): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req, extraAllowHeaders), "Content-Type": "application/json" },
  });
}

/**
 * Authenticate the caller and gate on check_permission.
 * Returns `{ userId }` on success, or a 401/403 Response to return immediately.
 */
export async function requireCaller(
  req: Request,
  featureKey: string,
  minLevel: PermissionMinLevel = "full",
): Promise<{ userId: string } | Response> {
  const token = parseBearerToken(req.headers.get("Authorization"));
  if (!token) return jsonResponse(req, 401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, 500, { error: "Server misconfigured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return jsonResponse(req, 401, { error: "Unauthorized" });
  }

  const { data: allowed } = await admin.rpc("check_permission", {
    p_user_id: callerData.user.id,
    p_feature_key: featureKey,
    p_min_level: minLevel,
  });
  if (allowed !== true) {
    return jsonResponse(req, 403, { error: "Forbidden" });
  }

  return { userId: callerData.user.id };
}

/**
 * Machine-to-machine gate: constant-time compare of a request header against
 * a Deno.env secret. Rejects when the secret is unset or the header is missing
 * or mismatched. Never logs the secret or the provided value.
 */
export function requireSharedSecret(
  req: Request,
  envKey: string,
  headerName = "x-worker-secret",
  extraAllowHeaders: string[] = [],
): { ok: true } | Response {
  const expected = Deno.env.get(envKey) ?? "";
  const provided = req.headers.get(headerName) ?? "";
  if (!expected || !constantTimeEqual(provided, expected)) {
    return jsonResponse(req, 401, { error: "Unauthorized" }, extraAllowHeaders);
  }
  return { ok: true };
}

const SUPER_ADMIN_ROLE = "Super Admin";

const INTERNAL_EMAIL_SECRET_ENVS = [
  "INTERNAL_EMAIL_SECRET",
  "CRON_FUNCTION_JWT",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const INTERNAL_EMAIL_EXTRA_HEADERS = [
  "x-internal-email-secret",
  "x-cron-secret",
];

/**
 * Super Admin gate. Same getUser path as requireCaller; role is read from
 * `users.unicorn_role`, never from an unverified JWT claim.
 */
export async function requireSuperAdmin(
  req: Request,
): Promise<{ userId: string } | Response> {
  const token = parseBearerToken(req.headers.get("Authorization"));
  if (!token) return jsonResponse(req, 401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, 500, { error: "Server misconfigured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return jsonResponse(req, 401, { error: "Unauthorized" });
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("unicorn_role, state")
    .eq("user_uuid", callerData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.unicorn_role !== SUPER_ADMIN_ROLE ||
    profile.state === "inactive" ||
    profile.state === "suspended"
  ) {
    return jsonResponse(req, 403, { error: "Forbidden" });
  }

  return { userId: callerData.user.id };
}

/**
 * Internal/system callers for outbound email (other edge functions, pg_cron
 * via pg_net). Accepts Authorization bearer or `x-internal-email-secret` /
 * `x-cron-secret` when it matches INTERNAL_EMAIL_SECRET, CRON_FUNCTION_JWT,
 * or the service-role key.
 *
 * Cron already sends `Authorization: Bearer <private.cron_function_jwt()>`.
 * Set Deno secret `CRON_FUNCTION_JWT` to that vault value (or set
 * INTERNAL_EMAIL_SECRET to the same string) so existing schedules keep
 * working without a database change. This is deliberately not
 * `requireSharedSecret`: that helper checks one header against one env key,
 * and would 401 when INTERNAL_EMAIL_SECRET is unset even if the bearer
 * matches the cron JWT or service-role key.
 */
export function requireInternalEmailSecret(req: Request): { ok: true } | Response {
  const secrets: string[] = [];
  for (const name of INTERNAL_EMAIL_SECRET_ENVS) {
    const value = Deno.env.get(name);
    if (value && value.length > 0) secrets.push(value);
  }

  const candidates = [
    parseBearerToken(req.headers.get("Authorization")),
    req.headers.get("x-internal-email-secret"),
    req.headers.get("x-cron-secret"),
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  let matched = false;
  // Always walk every candidate × every secret so timing does not leak which
  // header or which secret matched. When nothing was presented, still walk
  // the secrets against "" so an unset header is not a fast-path.
  if (candidates.length === 0) {
    for (const secret of secrets) constantTimeEqual("", secret);
    return jsonResponse(req, 401, { error: "Unauthorized" }, INTERNAL_EMAIL_EXTRA_HEADERS);
  }
  if (secrets.length === 0) {
    return jsonResponse(req, 401, { error: "Unauthorized" }, INTERNAL_EMAIL_EXTRA_HEADERS);
  }
  for (const candidate of candidates) {
    for (const secret of secrets) {
      if (constantTimeEqual(candidate, secret)) matched = true;
    }
  }
  if (!matched) {
    return jsonResponse(req, 401, { error: "Unauthorized" }, INTERNAL_EMAIL_EXTRA_HEADERS);
  }
  return { ok: true };
}
