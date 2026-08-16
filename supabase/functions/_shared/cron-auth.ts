/**
 * Auth for pg_cron-invoked edge functions.
 *
 * Cron jobs send `Authorization: Bearer ${private.cron_function_jwt()}`.
 * That vault secret is a project service_role JWT (`role=service_role`, no
 * `sub`) — not a user token — so `auth.getUser(token)` rejects it.
 *
 * Accepted credentials, in order:
 *   1. `x-cron-invoke-secret` header, constant-time compared to
 *      `Deno.env.get("CRON_INVOKE_SECRET")` (new path).
 *   2. Transition: the Bearer token cron already sends, constant-time
 *      compared to `SUPABASE_SERVICE_ROLE_KEY` (the current vault value).
 *      Flip `ACCEPT_LEGACY_SERVICE_ROLE_JWT` to false after every cron
 *      job is sending the dedicated header and `CRON_INVOKE_SECRET` is
 *      set on the edge functions.
 *
 * Human-triggered branches (e.g. generate-notifications preview/broadcast)
 * keep their own `is_super_admin_safe` gate and should not rely on this
 * helper as a replacement.
 */

export const CRON_INVOKE_SECRET_HEADER = "x-cron-invoke-secret";

/**
 * Transition flag. True = also accept the service_role JWT cron already
 * sends. Set false only after the cron.job DML migration has landed and
 * CRON_INVOKE_SECRET is present in the function environment.
 */
export const ACCEPT_LEGACY_SERVICE_ROLE_JWT = true;

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Always compare equal-length buffers so timing does not leak length.
  const len = Math.max(ab.length, bb.length, 1);
  const pa = new Uint8Array(len);
  const pb = new Uint8Array(len);
  pa.set(ab);
  pb.set(bb);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
  return diff === 0;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export function hasValidCronInvokeSecret(req: Request): boolean {
  const expected = Deno.env.get("CRON_INVOKE_SECRET") ?? "";
  if (expected.length === 0) return false;
  const provided = req.headers.get(CRON_INVOKE_SECRET_HEADER) ?? "";
  return constantTimeEqual(provided, expected);
}

export function hasValidLegacyCronJwt(req: Request): boolean {
  if (!ACCEPT_LEGACY_SERVICE_ROLE_JWT) return false;
  const token = extractBearerToken(req);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || serviceKey.length === 0) return false;
  return constantTimeEqual(token, serviceKey);
}

type RpcAdmin = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function serviceRoleAdmin(): RpcAdmin | null {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return {
    async rpc(fn, args) {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { data: null, error: { message: text.slice(0, 200) } };
      }
      const data = await res.json().catch(() => null);
      return { data, error: null };
    },
  };
}

async function matchesVaultSecret(
  kind: "jwt" | "invoke",
  presented: string,
): Promise<boolean> {
  if (!presented) return false;
  const admin = serviceRoleAdmin();
  if (!admin) return false;
  const { data, error } = await admin.rpc("cron_presented_secret_matches", {
    p_kind: kind,
    p_presented: presented,
  });
  if (error) {
    console.error("[cron-auth] vault compare failed:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Verify a caller JWT via the Auth admin API. The cron JWT is not a user
 * token, so this returns null for pg_cron invocations; human callers with
 * a real session JWT get their user id.
 */
export async function getUserIdFromJwt(
  admin: { auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: { message?: string } | null }> } },
  token: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

export async function isCronAuthorized(req: Request): Promise<boolean> {
  if (hasValidCronInvokeSecret(req)) return true;
  if (hasValidLegacyCronJwt(req)) return true;
  // Vault values can differ from the function env (cron_function_jwt is a
  // long-lived service_role JWT, not necessarily the current
  // SUPABASE_SERVICE_ROLE_KEY). Compare the presented credential against
  // what pg_cron actually sends.
  const token = extractBearerToken(req);
  if (token && await matchesVaultSecret("jwt", token)) return true;
  const header = req.headers.get(CRON_INVOKE_SECRET_HEADER) ?? "";
  if (header && await matchesVaultSecret("invoke", header)) return true;
  return false;
}

export function cronUnauthorizedResponse(
  req: Request,
  corsHeadersFor: (req: Request) => Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}
