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

export function joinAppUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalised}`;
}
