/**
 * ============================================================================
 *  Packet P2-QA — qa:data-lifecycle (first target: tenant lifecycle)
 * ----------------------------------------------------------------------------
 *  Live, HTTP-level test of the `tenant-lifecycle` Edge Function's real
 *  state machine (suspend/close/archive/reactivate) and its governance
 *  invariants: SuperAdmin gating on suspend/close/archive (a real fixed
 *  security gap -- see AGENTS.md's "tenant-lifecycle gated archive/
 *  reactivate-from-archived on SuperAdmin but originally left suspend/close
 *  on the broader staff.internal gate"), no-duplicate-close, reason-required
 *  validation, the 30-day archive cooldown + force_override, and
 *  reactivate-from-archived's own SuperAdmin gate.
 *
 *  This is the first suite in the layered-QA programme (P2-QA) to call a
 *  real Edge Function rather than reading tables/OpenAPI directly --
 *  `tenant-lifecycle` was deployed to `unicorn-qa` specifically to make this
 *  possible (see progress-log.md; unicorn-qa had zero Edge Functions before
 *  this).
 *
 *  Requires SUPABASE_SERVICE_ROLE_KEY (NON-VITE, see the same warning in
 *  ../tenant/isolation.test.tsx) targeting unicorn-qa specifically. Skipped
 *  entirely when unset, exactly like the P1-C suite.
 * ============================================================================
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/integrations/supabase/types";
import {
  acquireQaSuiteLock,
  getQaSuiteConfigurationError,
  QA_PROJECT_URL,
  readQaSuiteEnvironment,
} from "./qa-suite-guard";

const QA_ENV = readQaSuiteEnvironment();
const CONFIGURATION_ERROR = getQaSuiteConfigurationError(QA_ENV);
if (CONFIGURATION_ERROR) {
  throw new Error(`[qa:data-lifecycle] ${CONFIGURATION_ERROR}`);
}

const SUITE_ENABLED = Boolean(QA_ENV.supabaseUrl && QA_ENV.serviceRole);
const ANON_KEY = process.env.QA_SUPABASE_PUBLISHABLE_KEY ?? "";

const RUN_ID = `vitest-dl-${randomUUID()}`;
const PASS = "Passw0rd!Test-Vitest-DL";
const FUNCTION_URL = `${QA_PROJECT_URL}/functions/v1/tenant-lifecycle`;

type TenantInsert = TablesInsert<"tenants">;
type UserInsert = TablesInsert<"users">;

interface Persona {
  email: string;
  authId: string;
  accessToken: string;
}

interface FixtureLedger {
  tenantIds: number[];
  authUserIds: string[];
  profileUserIds: string[];
}

const fixtureLedger: FixtureLedger = {
  tenantIds: [],
  authUserIds: [],
  profileUserIds: [],
};

function recordOnce<T>(values: T[], value: T) {
  if (!values.includes(value)) values.push(value);
}

async function callLifecycle(
  accessToken: string,
  body: { tenant_id: number; action: string; reason?: string; force_override?: boolean },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json };
}

describe.skipIf(!SUITE_ENABLED).sequential("qa:data-lifecycle — tenant-lifecycle Edge Function", () => {
  let svc: SupabaseClient<Database>;
  let release: () => Promise<void>;
  let superAdmin!: Persona;
  let staffOnly!: Persona;
  let tenantId!: number;

  async function makeStaffPersona(label: string, unicornRole: "Super Admin" | "Team Member"): Promise<Persona> {
    const email = `${RUN_ID}-${label}@example.test`.toLowerCase();
    const { data: created, error } = await svc.auth.admin.createUser({
      email,
      password: PASS,
      email_confirm: true,
      user_metadata: { run_id: RUN_ID, label },
    });
    if (error || !created.user) throw new Error(`createUser ${label}: ${error?.message}`);
    const authId = created.user.id;
    recordOnce(fixtureLedger.authUserIds, authId);
    recordOnce(fixtureLedger.profileUserIds, authId);

    const profile: UserInsert = {
      user_uuid: authId,
      first_name: `Vitest-DL-${label}`,
      last_name: RUN_ID,
      email,
      user_type: "Vivacity",
      unicorn_role: unicornRole,
      tenant_id: null,
    };
    const { error: profileErr } = await svc.from("users").upsert(profile, { onConflict: "user_uuid" });
    if (profileErr) throw new Error(`users upsert ${label}: ${profileErr.message}`);

    const anon = createClient<Database>(QA_ENV.supabaseUrl, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password: PASS });
    if (signErr || !signIn.session) throw new Error(`signIn ${label}: ${signErr?.message}`);

    return { email, authId, accessToken: signIn.session.access_token };
  }

  beforeAll(async () => {
    release = await acquireQaSuiteLock(QA_ENV.lockPath);
    svc = createClient<Database>(QA_ENV.supabaseUrl, QA_ENV.serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    superAdmin = await makeStaffPersona("super", "Super Admin");
    staffOnly = await makeStaffPersona("staff", "Team Member");

    const tenantInsert: TenantInsert = {
      name: `QA DL Test Tenant ${RUN_ID}`,
      slug: `qa-dl-test-tenant-${RUN_ID}`.toLowerCase(),
      consultant_assignment_method: "manual",
    };
    const { data: tenant, error: tenantErr } = await svc
      .from("tenants")
      .insert(tenantInsert)
      .select("id")
      .single();
    if (tenantErr || !tenant) throw new Error(`tenant fixture: ${tenantErr?.message}`);
    tenantId = tenant.id;
    recordOnce(fixtureLedger.tenantIds, tenantId);
  });

  afterAll(async () => {
    for (const id of fixtureLedger.tenantIds) {
      await svc.from("client_audit_log").delete().eq("tenant_id", id);
      await svc.from("tenants").delete().eq("id", id);
    }
    for (const id of fixtureLedger.profileUserIds) {
      await svc.from("users").delete().eq("user_uuid", id);
    }
    for (const id of fixtureLedger.authUserIds) {
      await svc.auth.admin.deleteUser(id);
    }
    await release?.();
  });

  it("blocks a staff.internal-only caller from suspending a tenant (SuperAdmin gate regression guard)", async () => {
    const { status, json } = await callLifecycle(staffOnly.accessToken, { tenant_id: tenantId, action: "suspend" });
    expect(status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
  });

  it("blocks a staff.internal-only caller from closing a tenant", async () => {
    const { status, json } = await callLifecycle(staffOnly.accessToken, {
      tenant_id: tenantId,
      action: "close",
      reason: "should be blocked before reaching here",
    });
    expect(status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
  });

  it("blocks a staff.internal-only caller from archiving a tenant", async () => {
    const { status, json } = await callLifecycle(staffOnly.accessToken, { tenant_id: tenantId, action: "archive" });
    expect(status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
  });

  it("rejects close without a reason", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, { tenant_id: tenantId, action: "close" });
    expect(status).toBe(400);
    expect(json.code).toBe("BAD_REQUEST");
  });

  it("SuperAdmin can close the tenant with a reason, and it writes a matching audit row", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, {
      tenant_id: tenantId,
      action: "close",
      reason: "qa:data-lifecycle fixture close",
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    const data = json.data as Record<string, unknown>;
    expect(data.lifecycle_status).toBe("closed");
    expect(data.access_status).toBe("disabled");
    expect(data.closed_reason).toBe("qa:data-lifecycle fixture close");

    const { data: auditRows, error: auditErr } = await svc
      .from("client_audit_log")
      .select("action, before_data, after_data")
      .eq("tenant_id", tenantId)
      .eq("action", "client_closed");
    expect(auditErr).toBeNull();
    expect(auditRows).toHaveLength(1);
    expect(auditRows?.[0].before_data).toMatchObject({ lifecycle_status: "active" });
    expect(auditRows?.[0].after_data).toMatchObject({ lifecycle_status: "closed", access_status: "disabled" });
  });

  it("blocks a duplicate close on an already-closed tenant", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, {
      tenant_id: tenantId,
      action: "close",
      reason: "second close attempt",
    });
    expect(status).toBe(400);
    expect(json.code).toBe("ALREADY_CLOSED");
  });

  it("blocks archiving within the 30-day cooldown without force_override", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, { tenant_id: tenantId, action: "archive" });
    expect(status).toBe(400);
    expect(json.code).toBe("ARCHIVE_TOO_EARLY");
  });

  it("SuperAdmin can archive within the cooldown using force_override", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, {
      tenant_id: tenantId,
      action: "archive",
      force_override: true,
    });
    expect(status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.lifecycle_status).toBe("archived");
    expect(data.archived_at).toBeTruthy();
  });

  it("blocks a staff.internal-only caller from reactivating an archived tenant", async () => {
    const { status, json } = await callLifecycle(staffOnly.accessToken, {
      tenant_id: tenantId,
      action: "reactivate",
      reason: "should be blocked by the archived-reactivate SuperAdmin gate",
    });
    expect(status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
  });

  it("SuperAdmin can reactivate the archived tenant with a reason", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, {
      tenant_id: tenantId,
      action: "reactivate",
      reason: "qa:data-lifecycle fixture reactivation",
    });
    expect(status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.lifecycle_status).toBe("active");
    expect(data.access_status).toBe("enabled");
    expect(data.closed_at).toBeNull();
    expect(data.archived_at).toBeNull();
    expect(String(data.closed_reason)).toContain("qa:data-lifecycle fixture reactivation");
  });

  it("rejects an invalid transition (archive directly from active)", async () => {
    const { status, json } = await callLifecycle(superAdmin.accessToken, {
      tenant_id: tenantId,
      action: "archive",
      force_override: true,
    });
    expect(status).toBe(400);
    expect(json.code).toBe("INVALID_TRANSITION");
  });
});
