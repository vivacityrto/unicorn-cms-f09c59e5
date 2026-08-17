const DEFAULT_APP_ORIGIN = "https://unicorn-cms.au";
const CORS_ALLOW_HEADERS = [
  "authorization", "x-client-info", "apikey", "content-type",
  "x-supabase-client-platform", "x-supabase-client-platform-version",
  "x-supabase-client-runtime", "x-supabase-client-runtime-version",
  "idempotency-key", "x-action", "x-caller-authorization",
  "x-worker-secret", "x-cron-invoke-secret", "x-hook-secret",
  "x-internal-email-secret", "x-cron-secret",
].join(", ");
const CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const LOCAL_DEV_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"];

function originFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value.trim()).origin; } catch { return null; }
}

function wwwSiblingOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return null;
    url.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    return url.origin;
  } catch { return null; }
}

function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const appOrigin = originFromUrl(Deno.env.get("APP_BASE_URL")) ?? DEFAULT_APP_ORIGIN;
  origins.add(appOrigin);
  const sibling = wwwSiblingOrigin(appOrigin);
  if (sibling) origins.add(sibling);
  origins.add("https://unicorn-cms.au");
  origins.add("https://www.unicorn-cms.au");
  for (const part of (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "").split(",")) {
    const origin = originFromUrl(part);
    if (origin) origins.add(origin);
  }
  for (const local of LOCAL_DEV_ORIGINS) origins.add(local);
  return origins;
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin");
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
