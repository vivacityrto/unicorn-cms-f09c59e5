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

Deno.test("joinAppUrl — joins relative paths and preserves absolute URLs", () => {
  const base = "https://unicorn-cms.au";
  assertEquals(joinAppUrl(base, "/reset-password"), "https://unicorn-cms.au/reset-password");
  assertEquals(joinAppUrl(base, "tenant/1"), "https://unicorn-cms.au/tenant/1");
  assertEquals(
    joinAppUrl(base, "/accept-invitation?token=abc"),
    "https://unicorn-cms.au/accept-invitation?token=abc",
  );
  assertEquals(
    joinAppUrl(base, "https://example.test/already-absolute"),
    "https://example.test/already-absolute",
  );
});
