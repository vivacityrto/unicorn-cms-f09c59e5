import assert from "node:assert/strict";
import { test } from "node:test";
import {
  originFromUrl,
  wwwSiblingOrigin,
  buildAllowedOrigins,
  buildCorsHeaders,
} from "./cors.ts";

test("originFromUrl extracts origin and rejects junk", () => {
  assert.equal(originFromUrl("https://unicorn-cms.au/reset-password"), "https://unicorn-cms.au");
  assert.equal(originFromUrl(" https://www.unicorn-cms.au/ "), "https://www.unicorn-cms.au");
  assert.equal(originFromUrl("not-a-url"), null);
  assert.equal(originFromUrl(""), null);
  assert.equal(originFromUrl(null), null);
});

test("wwwSiblingOrigin flips www / apex and skips localhost", () => {
  assert.equal(wwwSiblingOrigin("https://unicorn-cms.au"), "https://www.unicorn-cms.au");
  assert.equal(wwwSiblingOrigin("https://www.unicorn-cms.au"), "https://unicorn-cms.au");
  assert.equal(wwwSiblingOrigin("http://localhost:8080"), null);
});

test("buildAllowedOrigins includes APP_BASE_URL, www sibling, production hosts, extras, and Vite", () => {
  const allowed = buildAllowedOrigins(
    "https://preview.example.com/app",
    "https://extra.example.com, not-valid, https://second.example.com/path",
  );

  assert.ok(allowed.has("https://preview.example.com"));
  assert.ok(allowed.has("https://www.preview.example.com"));
  assert.ok(allowed.has("https://unicorn-cms.au"));
  assert.ok(allowed.has("https://www.unicorn-cms.au"));
  assert.ok(allowed.has("https://extra.example.com"));
  assert.ok(allowed.has("https://second.example.com"));
  assert.ok(allowed.has("http://localhost:8080"));
  assert.ok(allowed.has("http://127.0.0.1:8080"));
  assert.equal(allowed.has("https://evil.example"), false);
});

test("buildAllowedOrigins falls back to production when APP_BASE_URL is missing", () => {
  const allowed = buildAllowedOrigins(undefined, undefined);
  assert.ok(allowed.has("https://unicorn-cms.au"));
  assert.ok(allowed.has("https://www.unicorn-cms.au"));
});

test("buildCorsHeaders echoes allowlisted Origin and omits it otherwise", () => {
  const allowed = buildAllowedOrigins("https://unicorn-cms.au", null);

  const allowedHeaders = buildCorsHeaders("https://unicorn-cms.au", allowed);
  assert.equal(allowedHeaders["Access-Control-Allow-Origin"], "https://unicorn-cms.au");
  assert.equal(allowedHeaders.Vary, "Origin");
  assert.match(allowedHeaders["Access-Control-Allow-Headers"], /authorization/);
  assert.match(allowedHeaders["Access-Control-Allow-Headers"], /idempotency-key/);
  assert.match(allowedHeaders["Access-Control-Allow-Methods"], /OPTIONS/);

  const wwwHeaders = buildCorsHeaders("https://www.unicorn-cms.au", allowed);
  assert.equal(wwwHeaders["Access-Control-Allow-Origin"], "https://www.unicorn-cms.au");

  const denied = buildCorsHeaders("https://evil.example", allowed);
  assert.equal(Object.hasOwn(denied, "Access-Control-Allow-Origin"), false);

  const missing = buildCorsHeaders(null, allowed);
  assert.equal(Object.hasOwn(missing, "Access-Control-Allow-Origin"), false);
});
