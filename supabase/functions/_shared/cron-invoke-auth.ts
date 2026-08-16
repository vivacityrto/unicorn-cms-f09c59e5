/**
 * Auth for cron-only edge functions (option b).
 *
 * A decoded-but-unverified JWT `role === "service_role"` claim is not
 * evidence of anything. These functions are invoked by pg_cron and must
 * present `x-cron-invoke-secret` matching Deno.env `CRON_INVOKE_SECRET`.
 *
 * Comparison is constant-time on SHA-256 digests so secret length is not
 * leaked and the XOR loop always runs a fixed 32 iterations.
 */

export const CRON_INVOKE_HEADER = "x-cron-invoke-secret";

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

export async function cronInvokeSecretMatches(
  presented: string,
  expected: string,
): Promise<boolean> {
  if (!expected) return false;
  const [expectedDigest, presentedDigest] = await Promise.all([
    sha256Bytes(expected),
    sha256Bytes(presented),
  ]);
  return timingSafeEqualBytes(expectedDigest, presentedDigest);
}

export async function authorizeCronInvoke(req: Request): Promise<boolean> {
  const expected = Deno.env.get("CRON_INVOKE_SECRET") ?? "";
  const presented = req.headers.get(CRON_INVOKE_HEADER) ?? "";
  return await cronInvokeSecretMatches(presented, expected);
}
