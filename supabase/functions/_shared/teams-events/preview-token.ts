/**
 * Short-lived, server-signed preview token (brief section 14).
 *
 * The preview step binds {user, event type, event id, group id, resolved
 * membership count + fingerprint, expiry} into an HMAC-SHA256-signed token.
 * The register step refuses anything the browser could have tampered with,
 * and re-resolves the group on the server regardless — the token proves the
 * operator saw (and confirmed) this exact event/group/count, nothing more.
 *
 * Format: base64url(JSON claims) + "." + base64url(HMAC)
 */

export type TeamsEventType = "webinar" | "meeting";

export interface PreviewClaims {
  /** Operator's auth user id. */
  uid: string;
  eventType: TeamsEventType;
  eventId: string;
  groupId: number;
  /** Total resolved group members at preview time. */
  memberCount: number;
  /** SHA-256 fingerprint of the sorted member keys at preview time. */
  membershipHash: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

export type PreviewVerifyFailure =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "mismatch";

export type PreviewVerifyResult =
  | { ok: true; claims: PreviewClaims }
  | { ok: false; reason: PreviewVerifyFailure };

export const PREVIEW_TOKEN_TTL_SECONDS = 10 * 60;

const KEY_LABEL = "unicorn-teams-events-preview-v1:";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(KEY_LABEL + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signPreviewToken(claims: PreviewClaims, secret: string): Promise<string> {
  if (!secret) throw new Error("Preview token signing secret is not configured");
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await hmacKey(secret, "sign");
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return `${payload}.${toBase64Url(signature)}`;
}

function isClaims(value: unknown): value is PreviewClaims {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.uid === "string" &&
    (c.eventType === "webinar" || c.eventType === "meeting") &&
    typeof c.eventId === "string" &&
    Number.isInteger(c.groupId) &&
    Number.isInteger(c.memberCount) &&
    typeof c.membershipHash === "string" &&
    Number.isInteger(c.exp)
  );
}

export async function verifyPreviewToken(
  token: unknown,
  secret: string,
  expected: Pick<PreviewClaims, "uid" | "eventType" | "eventId" | "groupId">,
  nowSeconds: number,
): Promise<PreviewVerifyResult> {
  if (typeof token !== "string" || !secret) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  const signature = fromBase64Url(parts[1]);
  const payloadBytes = fromBase64Url(parts[0]);
  if (!signature || !payloadBytes) return { ok: false, reason: "malformed" };

  // crypto.subtle.verify compares in constant time.
  const key = await hmacKey(secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(parts[0]),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isClaims(claims)) return { ok: false, reason: "malformed" };
  if (claims.exp <= nowSeconds) return { ok: false, reason: "expired" };

  if (
    claims.uid !== expected.uid ||
    claims.eventType !== expected.eventType ||
    claims.eventId !== expected.eventId ||
    claims.groupId !== expected.groupId
  ) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, claims };
}
