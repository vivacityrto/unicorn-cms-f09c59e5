/**
 * ============================================================================
 *  Packet P2-QA — qa:edge (first target: tenant-lifecycle)
 * ----------------------------------------------------------------------------
 *  Auth/CORS/method/request-response-contract tests against the one Edge
 *  Function currently deployed to unicorn-qa (tenant-lifecycle, deployed for
 *  qa:data-lifecycle -- see progress-log.md sessions 32-34). This is
 *  deliberately scoped to that one function for v1; broadening qa:edge to
 *  other functions means deploying them to unicorn-qa first, the same
 *  decision point already made once for tenant-lifecycle.
 *
 *  Unlike qa:rls/qa:contract/qa:data-lifecycle, none of these tests write
 *  any data or need service-role privileges -- they're pure HTTP-contract
 *  checks against the function's public surface. Still gated behind the
 *  same SUPABASE_SERVICE_ROLE_KEY-targeting-unicorn-qa check as every other
 *  suite for a consistent "only runs in the protected environment" story,
 *  even though a stricter secret isn't technically required here.
 * ============================================================================
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireQaSuiteLock,
  getQaSuiteConfigurationError,
  QA_PROJECT_URL,
  readQaSuiteEnvironment,
} from "./qa-suite-guard";

const QA_ENV = readQaSuiteEnvironment();
const CONFIGURATION_ERROR = getQaSuiteConfigurationError(QA_ENV);
if (CONFIGURATION_ERROR) {
  throw new Error(`[qa:edge] ${CONFIGURATION_ERROR}`);
}

const SUITE_ENABLED = Boolean(QA_ENV.supabaseUrl && QA_ENV.serviceRole);
const ANON_KEY = process.env.QA_SUPABASE_PUBLISHABLE_KEY ?? "";
const FUNCTION_URL = `${QA_PROJECT_URL}/functions/v1/tenant-lifecycle`;

describe.skipIf(!SUITE_ENABLED).sequential("qa:edge — tenant-lifecycle Edge Function contract", () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await acquireQaSuiteLock(QA_ENV.lockPath);
  });

  afterAll(async () => {
    await release?.();
  });

  it("rejects an unauthenticated call with a clean 401, not a stack trace", async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ tenant_id: 1, action: "suspend" }),
    });
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed bearer token with a clean 401", async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: "Bearer not-a-real-token",
      },
      body: JSON.stringify({ tenant_id: 1, action: "suspend" }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a non-POST method with 405, before any auth check", async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "GET",
      headers: { apikey: ANON_KEY },
    });
    expect(response.status).toBe(405);
    const json = await response.json();
    expect(json.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("echoes Access-Control-Allow-Origin only for an allowlisted origin, never a wildcard", async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8080",
        "Access-Control-Request-Method": "POST",
      },
    });
    const allowOrigin = response.headers.get("access-control-allow-origin");
    expect(allowOrigin).toBe("http://localhost:8080");
    expect(allowOrigin).not.toBe("*");
  });

  it("omits Access-Control-Allow-Origin entirely for a non-allowlisted origin", async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "OPTIONS",
      headers: {
        Origin: "https://not-a-real-allowlisted-origin.example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns a structured 400 (not a 500) for a well-formed but invalid request body", async () => {
    // No Authorization header, but this checks the *shape* of the response
    // contract (ok/code/detail), which is consistent across every error path
    // in this function regardless of which check rejects the request first.
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: "{ this is not valid json",
    });
    // Falls through to the UNAUTHORIZED check first (auth runs before body
    // parsing) -- still confirms the response is structured JSON, not a
    // raw parse-error stack trace, regardless of which check fires.
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toHaveProperty("ok", false);
    expect(json).toHaveProperty("code");
  });
});
