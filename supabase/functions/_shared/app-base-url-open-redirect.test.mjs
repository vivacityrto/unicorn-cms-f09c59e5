/**
 * Regression: joinAppUrl (supabase/functions/_shared/app-base-url-parse.ts)
 * must never return a caller-supplied absolute/protocol-relative URL as-is.
 *
 * Real path this guards: `emit_notification` accepts a caller-supplied JSONB
 * payload from any authenticated user (public.emit_notification, see
 * supabase/migrations/20260206071351_bbfe0506-1cc4-4eec-aad1-e65a2c4b172b.sql
 * — no server-side validation of payload contents). `process-notification-outbox`
 * reads `payload.deep_link` straight out of that row and calls `appUrl(deepLink)`
 * to build the "Open in Unicorn" action URL in a Teams adaptive card. Before
 * this fix, `joinAppUrl` returned any `https://`/`http://`-prefixed `path`
 * unchanged, so a caller could set `deep_link` to an attacker-controlled URL
 * and have it delivered, verbatim, as a trusted-looking "Open in Unicorn"
 * link — an open redirect / phishing vector.
 *
 * Run:
 *   node --experimental-strip-types --test supabase/functions/_shared/app-base-url-open-redirect.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { joinAppUrl, parseAppBaseUrl } from "./app-base-url-parse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const parseSrc = readFileSync(join(here, "app-base-url-parse.ts"), "utf8");
const outboxSrc = readFileSync(
  join(here, "..", "process-notification-outbox", "index.ts"),
  "utf8",
);

describe("joinAppUrl — open-redirect guard", () => {
  const base = "https://unicorn-cms.au";

  it("joins relative paths onto base unchanged", () => {
    assert.equal(joinAppUrl(base, "/reset-password"), "https://unicorn-cms.au/reset-password");
    assert.equal(joinAppUrl(base, "tenant/1"), "https://unicorn-cms.au/tenant/1");
    assert.equal(
      joinAppUrl(base, "/accept-invitation?token=abc"),
      "https://unicorn-cms.au/accept-invitation?token=abc",
    );
  });

  it("never returns a caller-supplied absolute URL as-is", () => {
    const evil = joinAppUrl(base, "https://evil.example/phish");
    assert.equal(evil.startsWith(base), true);
    assert.equal(new URL(evil).origin, base);
    assert.notEqual(evil, "https://evil.example/phish");
  });

  it("never returns a caller-supplied protocol-relative URL as-is", () => {
    const evil = joinAppUrl(base, "//evil.example/phish");
    assert.equal(evil.startsWith(base), true);
    assert.equal(new URL(evil).origin, base);
  });

  it("never returns an uppercase-scheme absolute URL as-is", () => {
    const evil = joinAppUrl(base, "HTTPS://evil.example/phish");
    assert.equal(new URL(evil).origin, base);
  });
});

describe("app-base-url-parse.ts source", () => {
  it("joinAppUrl body no longer contains an absolute-URL passthrough branch", () => {
    // Guards against a future edit reintroducing `if (/^https?:\/\//.test(path)) return path;`.
    assert.equal(/return\s+path\s*;/.test(parseSrc), false);
  });
});

describe("process-notification-outbox source", () => {
  it("still builds the Teams action URL through appUrl(), not payload.deep_link directly", () => {
    assert.match(outboxSrc, /const fullUrl = appUrl\(deepLink\);/);
    assert.doesNotMatch(outboxSrc, /url:\s*deepLink/);
  });
});

// Sanity: parseAppBaseUrl still fails closed (unrelated to this fix, but
// exercised here since this file is the one place both parse-layer
// functions are covered under node:test).
describe("parseAppBaseUrl", () => {
  it("rejects unset/blank values", () => {
    assert.throws(() => parseAppBaseUrl(undefined));
    assert.throws(() => parseAppBaseUrl(""));
  });
});
