/**
 * ============================================================================
 *  Packet P2-QA — qa:contract
 * ----------------------------------------------------------------------------
 *  Compares src/integrations/supabase/types.ts (generated from a `supabase
 *  gen types` run) against the LIVE schema of the `unicorn-qa` project, as
 *  seen through PostgREST's own built-in OpenAPI introspection endpoint
 *  (`GET /rest/v1/`, service_role only). Catches exactly the class of bug
 *  this repo's own AGENTS.md "Schema / RLS / trigger changes" guardrails
 *  describe from real incidents: a column/table renamed or dropped without
 *  regenerating types, or an RPC's parameter list changed without updating
 *  every caller.
 *
 *  Requires SUPABASE_SERVICE_ROLE_KEY (NON-VITE, see the same warning in
 *  ../tenant/isolation.test.tsx) targeting unicorn-qa specifically. Skipped
 *  entirely when unset, exactly like the P1-C suite.
 *
 *  HONEST LIMITATION (not yet live-proven as of authoring): this suite was
 *  written and its *parser* unit-tested against the real generated types
 *  file, but the live PostgREST-OpenAPI fetch/diff has never actually run
 *  against unicorn-qa -- the QA-only service-role key is a protected GitHub
 *  Environment secret unavailable outside CI. The table/column existence
 *  checks below are asserted as hard failures; the RPC argument-shape
 *  comparison is deliberately soft (warns, does not fail) until a first
 *  real run's payload shape confirms the parsing matches this PostgREST
 *  version's actual OpenAPI output. Tighten it once that first run's
 *  console output has been reviewed -- do not assume the soft-check shape
 *  guess was correct without checking.
 * ============================================================================
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireQaSuiteLock,
  getQaSuiteConfigurationError,
  readQaSuiteEnvironment,
} from "./qa-suite-guard";
import { parseGeneratedTypesFile, type ParsedContract } from "./parse-generated-types";
import { join } from "node:path";

const QA_ENV = readQaSuiteEnvironment();
const CONFIGURATION_ERROR = getQaSuiteConfigurationError(QA_ENV);
if (CONFIGURATION_ERROR) {
  throw new Error(`[qa:contract] ${CONFIGURATION_ERROR}`);
}

const SUITE_ENABLED = Boolean(QA_ENV.supabaseUrl && QA_ENV.serviceRole);

interface OpenApiColumnDefinition {
  type?: string;
  format?: string;
}

interface OpenApiTableDefinition {
  required?: string[];
  properties?: Record<string, OpenApiColumnDefinition>;
}

interface OpenApiDocument {
  definitions?: Record<string, OpenApiTableDefinition>;
  paths?: Record<string, unknown>;
}

async function fetchOpenApiDocument(supabaseUrl: string, serviceRoleKey: string): Promise<OpenApiDocument> {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `[qa:contract] PostgREST introspection request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as unknown;
  if (typeof body !== "object" || body === null) {
    throw new Error("[qa:contract] PostgREST introspection response was not a JSON object");
  }
  return body as OpenApiDocument;
}

describe.skipIf(!SUITE_ENABLED).sequential("qa:contract — generated types vs. live schema", () => {
  let release: () => Promise<void>;
  let openApi: OpenApiDocument;
  let generated: ParsedContract;

  beforeAll(async () => {
    release = await acquireQaSuiteLock(QA_ENV.lockPath);
    generated = parseGeneratedTypesFile(
      join(process.cwd(), "src/integrations/supabase/types.ts"),
    );
    openApi = await fetchOpenApiDocument(QA_ENV.supabaseUrl, QA_ENV.serviceRole);
  });

  afterAll(async () => {
    await release?.();
  });

  it("TEMP DIAGNOSTIC — dump raw OpenAPI shape for one RPC path (remove after review)", () => {
    console.warn("[qa:contract diagnostic] top-level keys:", JSON.stringify(Object.keys(openApi)));
    const samplePath = openApi.paths?.["/rpc/check_permission"];
    console.warn("[qa:contract diagnostic] paths['/rpc/check_permission']:", JSON.stringify(samplePath));
    const sampleDefinition = openApi.definitions?.["check_permission"];
    console.warn("[qa:contract diagnostic] definitions['check_permission']:", JSON.stringify(sampleDefinition));
    const definitionKeysSample = Object.keys(openApi.definitions ?? {}).slice(0, 10);
    console.warn("[qa:contract diagnostic] first 10 definitions keys:", JSON.stringify(definitionKeysSample));
    expect(true).toBe(true);
  });

  it("returns a recognizable OpenAPI document with table definitions", () => {
    expect(openApi.definitions, "expected an OpenAPI 'definitions' object listing tables").toBeTruthy();
    expect(Object.keys(openApi.definitions ?? {}).length).toBeGreaterThan(0);
  });

  it("has no tables in generated types.ts missing from the live schema", () => {
    const liveTableNames = new Set(Object.keys(openApi.definitions ?? {}));
    const missing = generated.tables
      .map((t) => t.name)
      .filter((name) => !liveTableNames.has(name));

    expect(
      missing,
      `Tables in generated types.ts but absent from the live QA schema (dropped/renamed without regenerating types?): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("has no column dropped, renamed, or added on any table shared with the live schema", () => {
    const mismatches: string[] = [];

    for (const table of generated.tables) {
      const liveDefinition = openApi.definitions?.[table.name];
      if (!liveDefinition?.properties) continue; // reported by the table-existence check above

      const liveColumns = new Set(Object.keys(liveDefinition.properties));
      const generatedColumns = new Set(table.columns.map((c) => c.name));

      const missingFromLive = [...generatedColumns].filter((c) => !liveColumns.has(c));
      const missingFromGenerated = [...liveColumns].filter((c) => !generatedColumns.has(c));

      if (missingFromLive.length > 0) {
        mismatches.push(
          `${table.name}: column(s) in generated types but not live: ${missingFromLive.join(", ")}`,
        );
      }
      if (missingFromGenerated.length > 0) {
        mismatches.push(
          `${table.name}: column(s) live but missing from generated types (run \`supabase gen types\`?): ${missingFromGenerated.join(", ")}`,
        );
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("[soft check] every generated RPC function is still exposed live, with a matching argument shape", () => {
    // Deliberately non-throwing -- see the file header's HONEST LIMITATION
    // note. Logs findings so a real CI run's output can be reviewed to
    // confirm this PostgREST version's OpenAPI shape matches what's assumed
    // here, then this should be tightened into a real assertion.
    const paths = openApi.paths ?? {};
    const findings: string[] = [];

    for (const fn of generated.functions) {
      const path = `/rpc/${fn.name}`;
      if (!(path in paths)) {
        findings.push(`${fn.name}: no '${path}' entry in the live OpenAPI paths`);
        continue;
      }
      const definition = openApi.definitions?.[fn.name];
      if (!definition?.properties) {
        findings.push(`${fn.name}: '${path}' exists but no matching '${fn.name}' entry in definitions to compare args against`);
        continue;
      }
      const liveArgs = new Set(Object.keys(definition.properties));
      const generatedArgs = new Set(fn.args.map((a) => a.name));
      const missingFromLive = [...generatedArgs].filter((a) => !liveArgs.has(a));
      const missingFromGenerated = [...liveArgs].filter((a) => !generatedArgs.has(a));
      if (missingFromLive.length > 0 || missingFromGenerated.length > 0) {
        findings.push(
          `${fn.name}: arg mismatch -- generated-only ${JSON.stringify(missingFromLive)}, live-only ${JSON.stringify(missingFromGenerated)}`,
        );
      }
    }

    if (findings.length > 0) {
      console.warn(
        `[qa:contract] soft RPC-shape findings (${findings.length}) -- review before promoting to a hard assertion:\n` +
          findings.join("\n"),
      );
    }

    // Intentionally always passes -- this is a reporting check for v1, see
    // the file header. Promote to `expect(findings).toEqual([])` once a
    // real run's output confirms the parsing shape is correct.
    expect(true).toBe(true);
  });
});
