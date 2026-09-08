/**
 * ============================================================================
 *  Packet P2-QA — qa:residue
 * ----------------------------------------------------------------------------
 *  Independent sweep for leftover fixture data in unicorn-qa, run after any
 *  fixture-producing suite (qa:rls, qa:data-lifecycle). Every existing
 *  fixture-producing suite already fails its own run closed on a cleanup
 *  error (see isolation.test.tsx's cleanupFixtures/throwCleanupFailures and
 *  data-lifecycle-tenant.test.ts's afterAll), but that only proves each
 *  delete call didn't *error* -- it doesn't independently prove the rows are
 *  actually gone. This suite re-checks from a completely separate code path
 *  so a bug in one suite's own cleanup logic (wrong ID recorded, wrong
 *  column, an RLS/grant quirk that makes a service-role delete a silent
 *  no-op) can't hide behind its own cleanup step reporting success.
 *
 *  Every fixture-producing suite so far shares two conventions, checked
 *  directly rather than reverse-engineered from each suite's own RUN_ID
 *  format: fixture personas always use the `@example.test` email domain
 *  (isolation.test.tsx, data-lifecycle-tenant.test.ts), and every RUN_ID
 *  starts with `vitest` (`vitest-<uuid>`, `vitest-dl-<uuid>`), which then
 *  appears in every fixture tenant's slug, every fixture conversation's
 *  subject, and every fixture message's body. Matching on those two anchors
 *  catches any fixture-producing suite without hardcoding its exact RUN_ID
 *  shape.
 *
 *  Not covered (out of scope for this first version, tracked as a known
 *  gap rather than silently assumed clean): true orphan detection (a child
 *  row surviving after its parent was deleted) for tenant_members,
 *  conversation_participants, audit_events and client_audit_log -- those
 *  are checked transitively through their parent tenant/conversation/user
 *  rows being clean, not directly.
 *
 *  Requires SUPABASE_SERVICE_ROLE_KEY (NON-VITE) targeting unicorn-qa
 *  specifically. Skipped entirely when unset, exactly like every other
 *  P2-QA suite.
 * ============================================================================
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  acquireQaSuiteLock,
  getQaSuiteConfigurationError,
  readQaSuiteEnvironment,
} from "./qa-suite-guard";

const QA_ENV = readQaSuiteEnvironment();
const CONFIGURATION_ERROR = getQaSuiteConfigurationError(QA_ENV);
if (CONFIGURATION_ERROR) {
  throw new Error(`[qa:residue] ${CONFIGURATION_ERROR}`);
}

const SUITE_ENABLED = Boolean(QA_ENV.supabaseUrl && QA_ENV.serviceRole);
const FIXTURE_EMAIL_DOMAIN = "@example.test";
const FIXTURE_RUN_MARKER = "vitest";

async function listAllFixtureAuthEmails(svc: SupabaseClient<Database>): Promise<string[]> {
  const matches: string[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
    for (const user of data.users) {
      if (user.email?.toLowerCase().endsWith(FIXTURE_EMAIL_DOMAIN)) {
        matches.push(user.email);
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return matches;
}

describe.skipIf(!SUITE_ENABLED).sequential("qa:residue — no leftover fixture data in unicorn-qa", () => {
  let svc: SupabaseClient<Database>;
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await acquireQaSuiteLock(QA_ENV.lockPath);
    svc = createClient<Database>(QA_ENV.supabaseUrl, QA_ENV.serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    await release?.();
  });

  it("has no leftover public.users rows with a fixture email", async () => {
    const { data, error } = await svc
      .from("users")
      .select("user_uuid, email")
      .ilike("email", `%${FIXTURE_EMAIL_DOMAIN}`);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("has no leftover auth.users rows with a fixture email", async () => {
    const fixtureEmails = await listAllFixtureAuthEmails(svc);
    expect(fixtureEmails).toEqual([]);
  });

  it("has no leftover tenants with a fixture slug", async () => {
    const { data, error } = await svc
      .from("tenants")
      .select("id, slug")
      .ilike("slug", `%${FIXTURE_RUN_MARKER}%`);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("has no leftover tenant_conversations with a fixture subject", async () => {
    const { data, error } = await svc
      .from("tenant_conversations")
      .select("id, subject")
      .ilike("subject", `%${FIXTURE_RUN_MARKER}%`);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("has no leftover tenant_messages with a fixture body", async () => {
    const { data, error } = await svc
      .from("tenant_messages")
      .select("id, body")
      .ilike("body", `%${FIXTURE_RUN_MARKER}%`);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
