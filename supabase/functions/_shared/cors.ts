/**
 * Standard CORS headers for all Supabase Edge Functions.
 * 
 * These headers allow the Unicorn 2.0 frontend to call edge functions
 * from any origin. The headers include support for:
 * - Authorization: JWT tokens for authenticated requests
 * - x-client-info: Supabase client identification
 * - apikey: Supabase anonymous key
 * - content-type: JSON and other content types
 * - x-supabase-client-*: Modern Supabase client headers for platform detection
 * 
 * Usage in edge functions:
 * ```ts
 * import { corsHeaders } from '../_shared/cors.ts';
 * 
 * Deno.serve(async (req) => {
 *   // Handle CORS preflight
 *   if (req.method === 'OPTIONS') {
 *     return new Response('ok', { headers: corsHeaders });
 *   }
 *   
 *   // ... function logic ...
 *   
 *   return new Response(JSON.stringify(data), {
 *     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
 *   });
 * });
 * ```
 */
/**
 * Legacy wide-open CORS object. New privileged functions (especially the
 * outbound email surface) must use `corsHeadersForOrigin` /
 * `requireCaller` instead — `*` is not an allowlist.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-internal-email-secret, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

const CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/**
 * Origins derived from APP_BASE_URL: the exact origin, plus the www /
 * apex twin of the same host. Nothing else is allowed.
 */
export function allowedOriginsFromAppBaseUrl(appBaseUrl: string | undefined | null): string[] {
  const fallback = "https://unicorn-cms.au";
  const raw = (appBaseUrl && appBaseUrl.trim()) || fallback;
  const origins = new Set<string>();

  const addFrom = (value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      origins.add(url.origin);
      const host = url.hostname;
      if (host.startsWith("www.")) {
        origins.add(`${url.protocol}//${host.slice(4)}`);
      } else if (host.includes(".")) {
        origins.add(`${url.protocol}//www.${host}`);
      }
    } catch {
      // ignore unparseable values
    }
  };

  addFrom(raw);
  if (origins.size === 0) addFrom(fallback);
  return [...origins];
}

export function pickAllowedOrigin(
  requestOrigin: string | null | undefined,
  allowed: string[],
): string | null {
  if (!requestOrigin) return null;
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

export function corsHeadersForOrigin(
  requestOrigin: string | null | undefined,
  allowed: string[],
): Record<string, string> {
  const matched = pickAllowedOrigin(requestOrigin, allowed);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    Vary: "Origin",
  };
  // Server-to-server / cron calls have no Origin. Omit ACAO rather than
  // reflecting `*` or an unvalidated host.
  if (matched) headers["Access-Control-Allow-Origin"] = matched;
  return headers;
}
