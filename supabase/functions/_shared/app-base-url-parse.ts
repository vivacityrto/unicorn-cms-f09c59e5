/**
 * Pure APP_BASE_URL helpers. The env read lives in `app-base-url.ts` so
 * unit tests can exercise these without requiring the secret at import time.
 */

export const APP_BASE_URL_UNSET_MESSAGE =
  "APP_BASE_URL is not set. Set this edge-function secret to the canonical app origin, e.g. https://unicorn-cms.au";

export function parseAppBaseUrl(raw: string | undefined | null): string {
  if (!raw || raw.trim() === "") {
    throw new Error(APP_BASE_URL_UNSET_MESSAGE);
  }
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Join a path onto `base`, always anchoring the result to `base`'s origin.
 *
 * `path` can be attacker-influenced: `emit_notification` accepts a caller-
 * supplied JSONB payload from any authenticated user, and
 * `process-notification-outbox` reads `payload.deep_link` straight out of
 * that row and passes it here to build the "Open in Unicorn" link in a
 * Teams adaptive card. Every caller of `appUrl`/`joinAppUrl` treats the
 * result as a trusted same-origin destination, so a caller-supplied
 * absolute URL (`https://evil.example/phish`) must never be returned
 * as-is — that would be an open redirect / phishing vector delivered
 * through a legitimate-looking Unicorn notification.
 *
 * A `path` that looks like an absolute URL (`scheme://...`) is therefore
 * never treated as a destination in its own right: it is folded into a
 * path segment under `base`, which keeps the final URL anchored to the
 * app's own origin no matter what `path` contains.
 */
export function joinAppUrl(base: string, path: string): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalised}`;
}
