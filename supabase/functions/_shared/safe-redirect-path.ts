/**
 * Shared guards for token-bearing email links.
 *
 * Same failure class as the 2026-06-04 redirect incident: never let a
 * request header or body supply the base URL of a magic/recovery/invite
 * link. Callers may only influence the post-verify landing page with a
 * same-origin relative path.
 */

export const TRUSTED_LINK_KEYS = [
  "appBaseUrl",
  "action_link", // stripped — URL rebuilt from APP_BASE_URL
  "redirect_to", // stripped — URL rebuilt from APP_BASE_URL
  "redirectTo", // stripped — URL rebuilt from APP_BASE_URL
  "emailRedirectTo", // stripped — URL rebuilt from APP_BASE_URL
] as const;

export function isSafeRelative(p: string): boolean {
  return (
    typeof p === "string" &&
    p.startsWith("/") &&
    !p.startsWith("//") &&
    !p.includes("://") &&
    !p.includes("\\")
  );
}

export function stripTrustedLinkKeys<T extends Record<string, unknown>>(
  mergeVars: T,
): T {
  for (const k of ["appBaseUrl", "action_link", "redirect_to"] as const) { // APP_BASE_URL wins
    delete mergeVars[k];
  }
  // Same class as the explicit trio — camelCase / Auth API aliases.
  delete mergeVars.redirectTo; // APP_BASE_URL wins
  delete mergeVars.emailRedirectTo; // APP_BASE_URL wins
  return mergeVars;
}

export function buildTrustedAppUrl(appBaseUrl: string, path: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}${path}`;
}

export function extractGoTrueToken(actionLink: string): string | null {
  try {
    return new URL(actionLink).searchParams.get("token");
  } catch {
    return null;
  }
}
