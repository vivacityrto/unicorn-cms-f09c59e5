import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAllowedRedirects,
  canonicalRedirectUri,
  oauthStateExpiresAt,
  resolveRedirectUri,
} from "./oauth-redirects.ts";

const BASE = "https://unicorn-cms.au";
const OUTLOOK = `${BASE}/calendar/outlook-callback`;
const XERO = `${BASE}/admin/integrations/xero-callback`;

Deno.test("buildAllowedRedirects includes both live callback routes", () => {
  const allowed = buildAllowedRedirects(BASE);
  assertEquals(allowed.has(OUTLOOK), true);
  assertEquals(allowed.has(XERO), true);
  assertEquals(allowed.size, 2);
});

Deno.test("buildAllowedRedirects strips a trailing slash on the base URL", () => {
  const allowed = buildAllowedRedirects(`${BASE}/`);
  assertEquals(allowed.has(OUTLOOK), true);
  assertEquals(allowed.has(XERO), true);
});

Deno.test("canonicalRedirectUri is provider-specific", () => {
  assertEquals(canonicalRedirectUri("outlook", BASE), OUTLOOK);
  assertEquals(canonicalRedirectUri("xero", BASE), XERO);
});

Deno.test("resolveRedirectUri uses the canonical URI when the body omits it", () => {
  assertEquals(resolveRedirectUri("outlook", undefined, BASE), {
    ok: true,
    redirectUri: OUTLOOK,
  });
  assertEquals(resolveRedirectUri("xero", "", BASE), {
    ok: true,
    redirectUri: XERO,
  });
});

Deno.test("resolveRedirectUri accepts the matching canonical URI", () => {
  assertEquals(resolveRedirectUri("outlook", OUTLOOK, BASE), {
    ok: true,
    redirectUri: OUTLOOK,
  });
});

Deno.test("resolveRedirectUri rejects a URI that is not in the allowlist", () => {
  const result = resolveRedirectUri(
    "outlook",
    "https://evil.example/calendar/outlook-callback",
    BASE,
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "redirect_uri is not allowed");
  }
});

Deno.test("resolveRedirectUri rejects the other provider's allowed URI", () => {
  const result = resolveRedirectUri("outlook", XERO, BASE);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "redirect_uri is not allowed");
  }
});

Deno.test("resolveRedirectUri rejects localhost and preview origins", () => {
  const result = resolveRedirectUri(
    "outlook",
    "http://localhost:8080/calendar/outlook-callback",
    BASE,
  );
  assertEquals(result.ok, false);
});

Deno.test("resolveRedirectUri rejects a non-string body value", () => {
  const result = resolveRedirectUri("xero", { url: XERO }, BASE);
  assertEquals(result.ok, false);
});

Deno.test("resolveRedirectUri fails closed when APP_BASE_URL is empty", () => {
  const result = resolveRedirectUri("outlook", undefined, "");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "OAuth redirect is not configured");
  }
});

Deno.test("oauthStateExpiresAt is a 10-minute TTL", () => {
  const now = Date.parse("2026-08-15T08:00:00.000Z");
  assertEquals(oauthStateExpiresAt(now), "2026-08-15T08:10:00.000Z");
});
