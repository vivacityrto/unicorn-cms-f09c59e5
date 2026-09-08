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
 *  LIVE-PROVEN 2026-09-08 (workflow run 34238305046, then a diagnostic run
 *  34238555502 to inspect the real OpenAPI shape): table/column existence
 *  passed clean against the real unicorn-qa schema. The RPC-argument check
 *  was shipped as a soft, warn-only placeholder because the initial
 *  assumption about where PostgREST stores an RPC's argument shape
 *  (`definitions[functionName]`) was wrong -- confirmed via the diagnostic
 *  run's raw payload: `definitions` is table-only, and an RPC's argument
 *  shape actually lives at `paths['/rpc/<name>'].post.parameters[].schema`
 *  (an object schema with `properties` per arg and a `required` array).
 *  Rewritten below to the confirmed-correct shape and promoted to a real
 *  hard assertion; re-run once more (workflow run to be recorded in
 *  progress-log.md) to confirm it passes clean before trusting this comment.
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

interface OpenApiBodyParameter {
  in: "body";
  name: string;
  required?: boolean;
  schema?: {
    properties?: Record<string, OpenApiColumnDefinition>;
    required?: string[];
  };
}

interface OpenApiRpcPathEntry {
  post?: {
    parameters?: Array<OpenApiBodyParameter | Record<string, unknown>>;
  };
}

interface OpenApiDocument {
  definitions?: Record<string, OpenApiTableDefinition>;
  paths?: Record<string, OpenApiRpcPathEntry>;
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

/**
 * Extracts an RPC's argument names + required-ness from its `/rpc/<name>`
 * path entry's POST body-parameter schema. Returns null when the path
 * entry doesn't have the expected shape (e.g. a GET-only RPC with no POST
 * verb at all), so the caller can report "shape not found" distinctly from
 * "found and mismatched".
 */
function extractRpcArgs(
  pathEntry: OpenApiRpcPathEntry | undefined,
): { name: string; required: boolean }[] | null {
  const parameters = pathEntry?.post?.parameters;
  if (!Array.isArray(parameters)) return null;
  const bodyParam = parameters.find(
    (p): p is OpenApiBodyParameter =>
      typeof p === "object" && p !== null && (p as OpenApiBodyParameter).in === "body",
  );
  const properties = bodyParam?.schema?.properties;
  if (!properties) return null;
  const required = new Set(bodyParam?.schema?.required ?? []);
  return Object.keys(properties).map((name) => ({ name, required: required.has(name) }));
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

  it("has no RPC function missing live, or with a drifted argument list", () => {
    const paths = openApi.paths ?? {};
    const mismatches: string[] = [];

    for (const fn of generated.functions) {
      const path = `/rpc/${fn.name}`;
      const pathEntry = paths[path];
      if (!pathEntry) {
        mismatches.push(`${fn.name}: no '${path}' entry in the live OpenAPI paths (dropped/renamed function?)`);
        continue;
      }

      const liveArgs = extractRpcArgs(pathEntry);
      if (!liveArgs) {
        // A handful of RPCs are GET-only (STABLE/IMMUTABLE with no body
        // params) or otherwise don't expose a POST body schema -- can't
        // meaningfully diff those, so skip rather than false-positive.
        continue;
      }

      const liveArgNames = new Set(liveArgs.map((a) => a.name));
      const generatedArgNames = new Set(fn.args.map((a) => a.name));

      const missingFromLive = [...generatedArgNames].filter((a) => !liveArgNames.has(a));
      const missingFromGenerated = [...liveArgNames].filter((a) => !generatedArgNames.has(a));

      if (missingFromLive.length > 0 || missingFromGenerated.length > 0) {
        mismatches.push(
          `${fn.name}: arg name mismatch -- generated-only ${JSON.stringify(missingFromLive)}, live-only ${JSON.stringify(missingFromGenerated)}`,
        );
        continue;
      }

      for (const liveArg of liveArgs) {
        const generatedArg = fn.args.find((a) => a.name === liveArg.name);
        if (!generatedArg) continue; // already reported above
        // Live "required" means no default in Postgres; generated
        // "optional" means the arg had a default when types were generated.
        if (generatedArg.optional === liveArg.required) {
          mismatches.push(
            `${fn.name}.${liveArg.name}: optional/required drifted -- generated ${generatedArg.optional ? "optional" : "required"}, live ${liveArg.required ? "required" : "optional"}`,
          );
        }
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });
});
