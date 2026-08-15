/**
 * requireCaller — in-function authorization for edge functions.
 *
 * Gateway `verify_jwt=true` is NOT authorization: the public anon key is a
 * valid JWT and satisfies the gateway. Every privileged function must call
 * this helper before doing work. Same lesson as security finding C1
 * (14 Jul 2026, unauthenticated create-session token mint).
 *
 * Modes:
 *   - permission  — auth.getUser + check_permission(featureKey, minLevel)
 *   - super_admin — auth.getUser + users.unicorn_role === "Super Admin"
 *   - internal    — constant-time compare of a shared secret (cron / fn-to-fn)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowedOriginsFromAppBaseUrl, corsHeadersForOrigin } from "./cors.ts";

export type RequireCallerMode =
  | { kind: "permission"; featureKey: string; minLevel?: "full" | "view" | "edit" }
  | { kind: "super_admin" }
  | { kind: "internal" };

export type CallerOk = {
  ok: true;
  userId: string | null;
  kind: RequireCallerMode["kind"];
  corsHeaders: Record<string, string>;
  supabase: SupabaseClient;
};

export type CallerDenied = {
  ok: false;
  response: Response;
  corsHeaders: Record<string, string>;
};

export type CallerResult = CallerOk | CallerDenied;

const SUPER_ADMIN_ROLE = "Super Admin";

/** Constant-time string compare. Length mismatch still walks a padded buffer. */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length, 1);
  const pa = new Uint8Array(len);
  const pb = new Uint8Array(len);
  pa.set(ab);
  pb.set(bb);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
  return diff === 0;
}

export function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

function jsonError(
  status: number,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders },
  });
}

function collectInternalSecrets(): string[] {
  const names = [
    "INTERNAL_EMAIL_SECRET",
    "CRON_FUNCTION_JWT",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const secrets: string[] = [];
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.length > 0) secrets.push(value);
  }
  return secrets;
}

/**
 * Internal/system callers (other edge functions, pg_cron via pg_net).
 * Accepts the Authorization bearer or `x-internal-email-secret` when it
 * matches INTERNAL_EMAIL_SECRET, CRON_FUNCTION_JWT, or the service-role key.
 * Cron already sends `Authorization: Bearer <private.cron_function_jwt()>`;
 * set the Deno secret `CRON_FUNCTION_JWT` to that vault value (or set
 * INTERNAL_EMAIL_SECRET to the same string) so existing schedules keep working
 * without a database change.
 */
export function matchesInternalSecret(req: Request): boolean {
  const secrets = collectInternalSecrets();
  if (secrets.length === 0) return false;

  const candidates = [
    extractBearer(req),
    req.headers.get("x-internal-email-secret"),
    req.headers.get("x-cron-secret"),
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  let matched = false;
  // Always walk every candidate × every secret so timing does not leak which
  // header or which secret matched.
  if (candidates.length === 0) {
    for (const secret of secrets) constantTimeEqual("", secret);
    return false;
  }
  for (const candidate of candidates) {
    for (const secret of secrets) {
      if (constantTimeEqual(candidate, secret)) matched = true;
    }
  }
  return matched;
}

function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function corsForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? req.headers.get("origin");
  const allowed = allowedOriginsFromAppBaseUrl(Deno.env.get("APP_BASE_URL"));
  return corsHeadersForOrigin(origin, allowed);
}

export async function requireCaller(
  req: Request,
  mode: RequireCallerMode,
): Promise<CallerResult> {
  const corsHeaders = corsForRequest(req);

  if (mode.kind === "internal") {
    if (!matchesInternalSecret(req)) {
      return {
        ok: false,
        corsHeaders,
        response: jsonError(401, { error: "Unauthorized" }, corsHeaders),
      };
    }
    return {
      ok: true,
      userId: null,
      kind: "internal",
      corsHeaders,
      supabase: createServiceClient(),
    };
  }

  const bearer = extractBearer(req);
  if (!bearer) {
    return {
      ok: false,
      corsHeaders,
      response: jsonError(401, { error: "Unauthorized" }, corsHeaders),
    };
  }

  // A service-role / shared-secret bearer is not a user session. User-gated
  // email functions require a real user JWT + permission / Super Admin check.
  if (matchesInternalSecret(req)) {
    return {
      ok: false,
      corsHeaders,
      response: jsonError(401, { error: "Unauthorized" }, corsHeaders),
    };
  }

  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(bearer);
  if (userError || !userData?.user) {
    return {
      ok: false,
      corsHeaders,
      response: jsonError(401, { error: "Unauthorized" }, corsHeaders),
    };
  }

  const userId = userData.user.id;

  if (mode.kind === "super_admin") {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("unicorn_role, state")
      .eq("user_uuid", userId)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.unicorn_role !== SUPER_ADMIN_ROLE ||
      profile.state === "inactive" ||
      profile.state === "suspended"
    ) {
      return {
        ok: false,
        corsHeaders,
        response: jsonError(403, { error: "Forbidden" }, corsHeaders),
      };
    }

    return { ok: true, userId, kind: "super_admin", corsHeaders, supabase };
  }

  const { data: allowed, error: permError } = await supabase.rpc("check_permission", {
    p_user_id: userId,
    p_feature_key: mode.featureKey,
    p_min_level: mode.minLevel ?? "full",
  });

  if (permError || !allowed) {
    return {
      ok: false,
      corsHeaders,
      response: jsonError(403, { error: "Forbidden" }, corsHeaders),
    };
  }

  return { ok: true, userId, kind: "permission", corsHeaders, supabase };
}

export function handleCorsPreflight(req: Request): Response {
  return new Response("ok", { headers: corsForRequest(req) });
}
