/**
 * Shared webhook signature helpers.
 *
 * Fail-closed receivers must:
 *   1. Read the signing secret at module load.
 *   2. Refuse every request with 500 if the secret is missing.
 *   3. Verify HMAC with a constant-time compare (equivalent to
 *      crypto.timingSafeEqual) — never string ===.
 *   4. Reject Mailgun timestamps older than WEBHOOK_MAX_AGE_SECONDS.
 */

export const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;

/** Constant-time compare of equal-length byte arrays. Length mismatch → false. */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

/** Constant-time compare of two strings (UTF-8). Length mismatch → false. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  return timingSafeEqualBytes(enc.encode(a), enc.encode(b));
}

export function hexToBytes(hex: string): Uint8Array | null {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/.test(normalized)) return null;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Mailgun (and similar) signed timestamps must be within ±maxAge of now.
 * Rejects non-numeric values and both replay (too old) and far-future skew.
 */
export function isWebhookTimestampFresh(
  timestamp: string | number,
  nowSeconds: number = Date.now() / 1000,
  maxAgeSeconds: number = WEBHOOK_MAX_AGE_SECONDS,
): boolean {
  const ts = typeof timestamp === "number" ? timestamp : Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(nowSeconds - ts) <= maxAgeSeconds;
}

export async function hmacSha256(
  key: string,
  data: string,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return new Uint8Array(sig);
}

/** Mailgun: HMAC-SHA256(timestamp + token), hex-encoded, compared constant-time. */
export async function verifyMailgunSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string,
): Promise<boolean> {
  const provided = hexToBytes(signature);
  if (!provided) return false;
  const expected = await hmacSha256(signingKey, String(timestamp) + String(token));
  return timingSafeEqualBytes(expected, provided);
}

/** Xero: HMAC-SHA256(raw body), base64-encoded, compared constant-time. */
export async function verifyXeroSignature(
  webhookKey: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const provided = base64ToBytes(signature);
  if (!provided) return false;
  const expected = await hmacSha256(webhookKey, rawBody);
  return timingSafeEqualBytes(expected, provided);
}
