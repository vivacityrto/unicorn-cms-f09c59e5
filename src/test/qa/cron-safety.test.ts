/**
 * ============================================================================
 *  Packet P2-QA — qa:cron-safety
 * ----------------------------------------------------------------------------
 *  Asserts `unicorn-qa` remains schedule-free: no pg_cron jobs registered,
 *  unless a future suite explicitly enables one for a scoped test. Before
 *  this suite, "unicorn-qa is schedule-free" was a one-time baseline
 *  observation (docs/kb/codebase-state/qa-baseline-cutover-2026-09-07.md);
 *  this makes it a live, repeatable assertion instead of a stale claim.
 *
 *  A normal PostgREST client can't query pg_cron.job directly -- the `cron`
 *  schema isn't exposed to PostgREST, and the extension may not even be
 *  installed (it currently isn't in unicorn-qa). A minimal, read-only,
 *  SECURITY DEFINER RPC (`public.qa_cron_safety_status`) was added directly
 *  to unicorn-qa for this purpose only -- it is QA-only tooling, not part of
 *  the production schema, so it does not exist in supabase/migrations/** or
 *  the generated types.ts (hence the untyped raw-fetch call below, matching
 *  edge-tenant-lifecycle.test.ts's pattern rather than the typed
 *  supabase-js client used by qa:data-lifecycle). EXECUTE is granted only to
 *  service_role (revoked from anon/authenticated) -- confirmed empirically
 *  with the QA project's public anon key: PostgREST returns 401/42501
 *  ("permission denied for function qa_cron_safety_status").
 *
 *  Requires SUPABASE_SERVICE_ROLE_KEY (NON-VITE) targeting unicorn-qa
 *  specifically. Skipped entirely when unset, exactly like every other
 *  P2-QA suite.
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
  throw new Error(`[qa:cron-safety] ${CONFIGURATION_ERROR}`);
}

const SUITE_ENABLED = Boolean(QA_ENV.supabaseUrl && QA_ENV.serviceRole);
const ANON_KEY = process.env.QA_SUPABASE_PUBLISHABLE_KEY ?? "";
const RPC_URL = `${QA_PROJECT_URL}/rest/v1/rpc/qa_cron_safety_status`;

interface CronSafetyStatusRow {
  pg_cron_installed: boolean;
  cron_job_count: number;
  cron_job_names: string[];
}

describe.skipIf(!SUITE_ENABLED).sequential("qa:cron-safety — unicorn-qa remains schedule-free", () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await acquireQaSuiteLock(QA_ENV.lockPath);
  });

  afterAll(async () => {
    await release?.();
  });

  it("reports zero registered pg_cron jobs", async () => {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: QA_ENV.serviceRole,
        Authorization: `Bearer ${QA_ENV.serviceRole}`,
      },
      body: "{}",
    });
    expect(response.status).toBe(200);
    const rows = (await response.json()) as CronSafetyStatusRow[];
    expect(rows).toHaveLength(1);
    const [status] = rows;
    expect(status.cron_job_count).toBe(0);
    expect(status.cron_job_names).toEqual([]);
  });

  it("denies the RPC to an unprivileged (anon) caller", async () => {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: "{}",
    });
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("42501");
  });
});
