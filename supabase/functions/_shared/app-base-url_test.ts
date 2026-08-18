import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  APP_BASE_URL_UNSET_MESSAGE,
  joinAppUrl,
  parseAppBaseUrl,
} from "./app-base-url-parse.ts";

Deno.test("parseAppBaseUrl — rejects unset and blank values", () => {
  assertThrows(() => parseAppBaseUrl(undefined), Error, APP_BASE_URL_UNSET_MESSAGE);
  assertThrows(() => parseAppBaseUrl(null), Error, APP_BASE_URL_UNSET_MESSAGE);
  assertThrows(() => parseAppBaseUrl(""), Error, APP_BASE_URL_UNSET_MESSAGE);
  assertThrows(() => parseAppBaseUrl("   "), Error, APP_BASE_URL_UNSET_MESSAGE);
});

Deno.test("parseAppBaseUrl — trims and strips trailing slashes", () => {
  assertEquals(parseAppBaseUrl("https://unicorn-cms.au"), "https://unicorn-cms.au");
  assertEquals(parseAppBaseUrl("https://unicorn-cms.au/"), "https://unicorn-cms.au");
  assertEquals(parseAppBaseUrl("  https://unicorn-cms.au///  "), "https://unicorn-cms.au");
});

Deno.test("joinAppUrl — joins relative paths onto base", () => {
  const base = "https://unicorn-cms.au";
  assertEquals(joinAppUrl(base, "/reset-password"), "https://unicorn-cms.au/reset-password");
  assertEquals(joinAppUrl(base, "tenant/1"), "https://unicorn-cms.au/tenant/1");
  assertEquals(
    joinAppUrl(base, "/accept-invitation?token=abc"),
    "https://unicorn-cms.au/accept-invitation?token=abc",
  );
});

Deno.test("joinAppUrl — never returns a caller-supplied absolute URL as-is (open-redirect guard)", () => {
  const base = "https://unicorn-cms.au";
  // A caller-controlled `deep_link` (e.g. from the emit_notification RPC
  // payload, read by process-notification-outbox) must never escape the
  // app's own origin — the parsed origin of the result must always be
  // `base`, regardless of what scheme/host-looking text is embedded in it.
  const evil = joinAppUrl(base, "https://evil.example/phish");
  assertEquals(evil.startsWith(base), true);
  assertEquals(new URL(evil).origin, base);

  const protocolRelative = joinAppUrl(base, "//evil.example/phish");
  assertEquals(protocolRelative.startsWith(base), true);
  assertEquals(new URL(protocolRelative).origin, base);
});
