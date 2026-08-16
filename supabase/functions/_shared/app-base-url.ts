/**
 * Canonical Unicorn app origin for every edge function.
 *
 * Read exactly `Deno.env.get("APP_BASE_URL")`. There is no fallback: if the
 * secret is unset the isolate fails at module load so the misconfiguration
 * is visible immediately instead of silently linking users to a stale
 * preview domain.
 *
 * Trailing slashes are stripped so callers can concatenate paths safely.
 */

import { joinAppUrl, parseAppBaseUrl } from "./app-base-url-parse.ts";

export {
  APP_BASE_URL_UNSET_MESSAGE,
  joinAppUrl,
  parseAppBaseUrl,
} from "./app-base-url-parse.ts";

export const APP_BASE_URL = parseAppBaseUrl(Deno.env.get("APP_BASE_URL"));

/** Join a path (with or without a leading slash) onto APP_BASE_URL. */
export function appUrl(path: string): string {
  return joinAppUrl(APP_BASE_URL, path);
}

/** Email header logo hosted on the canonical app origin. */
export const EMAIL_LOGO_URL = `${APP_BASE_URL}/assets/brand/unicorn-cms-email-logo.png`;
export const EMAIL_LOGO_ALT = "Unicorn CMS";
