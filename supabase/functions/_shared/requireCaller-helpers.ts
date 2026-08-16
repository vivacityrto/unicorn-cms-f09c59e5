/**
 * Pure helpers for requireCaller — no Deno / network imports, so they can
 * be unit-tested from Node/vitest as well as imported by Edge Functions.
 */

/**
 * Parse `Authorization` as `Bearer <token>`. Returns null unless the header
 * has exactly two space-separated parts and the scheme is Bearer.
 * A prefix replace (`authHeader.replace(/^Bearer\s+/i, "")`) is not sufficient.
 */
export function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const parts = authorizationHeader.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  if (!parts[1]) return null;
  return parts[1];
}

/**
 * Build the CORS origin allowlist from APP_BASE_URL (apex + www variant).
 */
export function allowlistFromAppBaseUrl(appBaseUrl: string | null | undefined): Set<string> {
  const allowlist = new Set<string>();
  const trimmed = (appBaseUrl ?? "").replace(/\/+$/, "");
  if (!trimmed) return allowlist;
  allowlist.add(trimmed);
  try {
    const url = new URL(trimmed);
    const host = url.hostname;
    const port = url.port ? `:${url.port}` : "";
    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    allowlist.add(`${url.protocol}//${altHost}${port}`);
  } catch {
    // APP_BASE_URL is not a valid absolute URL — keep the raw trimmed value only.
  }
  return allowlist;
}

/**
 * Constant-time string compare. Length mismatch still walks a padded buffer
 * so timing does not leak the expected secret's length.
 */
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
