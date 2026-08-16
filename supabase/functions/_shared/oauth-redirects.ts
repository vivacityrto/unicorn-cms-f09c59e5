/**
 * OAuth redirect URI allowlist for outlook-auth and xero-auth.
 *
 * Redirect URIs are derived from APP_BASE_URL only — never from the request
 * body. If a caller still supplies redirect_uri, it must match the single
 * canonical value for that provider or the request is rejected with 400.
 *
 * Paths are the live callback routes (`/calendar/outlook-callback`,
 * `/admin/integrations/xero-callback`), not a generic
 * `/integrations/{provider}/callback` sketch.
 */

export type OAuthProvider = "outlook" | "xero";

export const OUTLOOK_REDIRECT_PATH = "/calendar/outlook-callback";
export const XERO_REDIRECT_PATH = "/admin/integrations/xero-callback";

const STATE_TTL_MS = 10 * 60 * 1000;

export function getAppBaseUrl(): string {
  return (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/+$/, "");
}

export function canonicalRedirectUri(provider: OAuthProvider, appBaseUrl = getAppBaseUrl()): string {
  const base = appBaseUrl.replace(/\/+$/, "");
  return provider === "outlook"
    ? `${base}${OUTLOOK_REDIRECT_PATH}`
    : `${base}${XERO_REDIRECT_PATH}`;
}

export function buildAllowedRedirects(appBaseUrl = getAppBaseUrl()): Set<string> {
  const base = appBaseUrl.replace(/\/+$/, "");
  return new Set([
    `${base}${OUTLOOK_REDIRECT_PATH}`,
    `${base}${XERO_REDIRECT_PATH}`,
  ]);
}

/** Evaluated once per isolate from env — do not accept these from the request. */
export const ALLOWED_REDIRECTS = buildAllowedRedirects();

export function oauthStateExpiresAt(now = Date.now()): string {
  return new Date(now + STATE_TTL_MS).toISOString();
}

export type ResolveRedirectResult =
  | { ok: true; redirectUri: string }
  | { ok: false; error: string };

/**
 * Always returns the provider's canonical redirect URI when the client omits
 * redirect_uri. A supplied value is accepted only if it equals that canonical
 * URI (which is also a member of ALLOWED_REDIRECTS).
 */
export function resolveRedirectUri(
  provider: OAuthProvider,
  supplied: unknown,
  appBaseUrl = getAppBaseUrl(),
): ResolveRedirectResult {
  const base = appBaseUrl.replace(/\/+$/, "");
  if (!base) {
    return { ok: false, error: "OAuth redirect is not configured" };
  }

  const canonical = canonicalRedirectUri(provider, base);
  const allowed = buildAllowedRedirects(base);

  if (supplied == null || supplied === "") {
    return { ok: true, redirectUri: canonical };
  }

  if (typeof supplied !== "string") {
    return { ok: false, error: "redirect_uri is not allowed" };
  }

  if (!allowed.has(supplied) || supplied !== canonical) {
    return { ok: false, error: "redirect_uri is not allowed" };
  }

  return { ok: true, redirectUri: canonical };
}
