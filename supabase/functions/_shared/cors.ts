/**
 * Allowlisted CORS headers for Unicorn edge functions.
 *
 * Echoes the request Origin only when it is in the allowlist; otherwise the
 * Access-Control-Allow-Origin header is omitted entirely (never `*`).
 *
 * Allowlist:
 * - `APP_BASE_URL` (falls back to https://unicorn-cms.au)
 * - the www / apex sibling of that origin
 * - optional comma-separated `CORS_ALLOWED_ORIGINS`
 * - Vite dev origins from AGENTS.md (`http://localhost:8080` / 127.0.0.1)
 *
 * The Outlook / Teams add-in is served from the same SPA (`/addin`), so it
 * does not need a separate host. Extra request headers used by a few
 * functions (`idempotency-key`, `x-action`, `x-caller-authorization`,
 * `x-worker-secret`, `x-cron-invoke-secret`, `x-hook-secret`,
 * `x-internal-email-secret`, `x-cron-secret`) are included in Allow-Headers
 * so those preflights keep working.
 *
 * Usage:
 * ```ts
 * import { corsHeaders } from "../_shared/cors.ts";
 *
 * Deno.serve(async (req) => {
 *   if (req.method === "OPTIONS") {
 *     return new Response("ok", { headers: corsHeaders(req) });
 *   }
 *   return new Response(JSON.stringify(data), {
 *     headers: { ...corsHeaders(req), "Content-Type": "application/json" },
 *   });
 * });
 * ```
 */
const DEFAULT_APP_ORIGIN = "https://unicorn-cms.au";

const CORS_ALLOW_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
  "idempotency-key",
  "x-action",
  "x-caller-authorization",
  "x-worker-secret",
  "x-cron-invoke-secret",
  "x-hook-secret",
  "x-internal-email-secret",
  "x-cron-secret",
].join(", ");

const CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

export function originFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function wwwSiblingOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return null;
    }
    url.hostname = url.hostname.startsWith("www.")
      ? url.hostname.slice(4)
      : `www.${url.hostname}`;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(
  appBaseUrl: string | null | undefined,
  extraOrigins: string | null | undefined,
): Set<string> {
  const origins = new Set<string>();

  const appOrigin = originFromUrl(appBaseUrl) ?? DEFAULT_APP_ORIGIN;
  origins.add(appOrigin);
  const sibling = wwwSiblingOrigin(appOrigin);
  if (sibling) origins.add(sibling);

  // Production hosts appear as both apex and www in existing edge-function
  // fallbacks; keep both even if APP_BASE_URL is a preview URL.
  origins.add("https://unicorn-cms.au");
  origins.add("https://www.unicorn-cms.au");

  if (extraOrigins) {
    for (const part of extraOrigins.split(",")) {
      const origin = originFromUrl(part);
      if (origin) origins.add(origin);
    }
  }

  for (const local of LOCAL_DEV_ORIGINS) origins.add(local);

  return origins;
}

export function isAllowedOrigin(
  origin: string | null,
  allowed: Set<string>,
): boolean {
  return !!origin && allowed.has(origin);
}

export function buildCorsHeaders(
  requestOrigin: string | null,
  allowed: Set<string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    Vary: "Origin",
  };

  if (isAllowedOrigin(requestOrigin, allowed)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin as string;
  }

  return headers;
}

function envAllowedOrigins(): Set<string> {
  return buildAllowedOrigins(
    Deno.env.get("APP_BASE_URL"),
    Deno.env.get("CORS_ALLOWED_ORIGINS"),
  );
}

/** Request-aware CORS headers. Echoes Origin only when it is allowlisted. */
export function corsHeaders(req: Request): Record<string, string> {
  return buildCorsHeaders(req.headers.get("Origin"), envAllowedOrigins());
}

export function handleCors(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}
