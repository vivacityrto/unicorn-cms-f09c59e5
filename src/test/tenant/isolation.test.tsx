/**
 * ============================================================================
 *  ⚠️  CRITICAL — DO NOT RENAME THE ENV VAR BELOW WITH A `VITE_` PREFIX. ⚠️
 * ----------------------------------------------------------------------------
 *  This file reads `process.env.SUPABASE_SERVICE_ROLE_KEY` to seed the DB
 *  via a service-role client. The service role key BYPASSES RLS.
 *
 *  - Vitest runs in Node — `process.env` is a Node-only object, never bundled.
 *  - NEVER read this key via `import.meta.env` and NEVER prefix it `VITE_`.
 *    Vite would inline the value into the production browser bundle, which
 *    is full database compromise.
 *  - When unset (typical CI without secrets), the live RLS describe block is
 *    skipped via `describe.sequential.skipIf` so test runs do not fail.
 * ============================================================================
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  acquireRlsSuiteLock,
  getRlsSuiteConfigurationError,
  readRlsSuiteEnvironment,
} from "./rls-suite-guard";

/* -------------------------------------------------------------------------- */
/*  Live RLS suite — tenant_messages / tenant_conversations                   */
/*  Requires SUPABASE_SERVICE_ROLE_KEY (NON-VITE) + VITE_SUPABASE_URL +       */
/*  VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY).                */
/* -------------------------------------------------------------------------- */

const RLS_ENV = readRlsSuiteEnvironment();
const SUPABASE_URL = RLS_ENV.supabaseUrl;
const SUPABASE_ANON = RLS_ENV.supabaseAnon;
const SERVICE_ROLE = RLS_ENV.serviceRole;
const RLS_CONFIGURATION_ERROR = getRlsSuiteConfigurationError(RLS_ENV);

if (RLS_CONFIGURATION_ERROR) {
  throw new Error(`[tenant isolation] ${RLS_CONFIGURATION_ERROR}`);
}

const RLS_SUITE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON && SERVICE_ROLE);

/** Postgres 42501 = insufficient_privilege (RLS / GRANT). */
function expectRlsViolation(error: { code?: string; message?: string } | null) {
  expect(error).toBeTruthy();
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  const ok = code === "42501" || /row-level security|violates.*policy/i.test(msg);
  if (!ok) {
    throw new Error(
      `Expected RLS violation, got code="${code}" message="${msg}"`,
    );
  }
}

interface Persona {
  email: string;
  authId: string;
  client: SupabaseClient<Database>;
}

type TenantInsert = TablesInsert<"tenants">;
type UserInsert = TablesInsert<"users">;
type TenantMemberInsert = TablesInsert<"tenant_members">;
type ConversationInsert = TablesInsert<"tenant_conversations">;
type ParticipantInsert = TablesInsert<"conversation_participants">;
type MessageInsert = TablesInsert<"tenant_messages">;
type TenantMessageIdRow = Pick<Tables<"tenant_messages">, "id">;
type ConversationIdRow = Pick<Tables<"tenant_conversations">, "id">;
type AuditEventRow = Pick<
  Tables<"audit_events">,
  "id" | "entity" | "action" | "user_id" | "entity_id"
>;

interface FixtureLedger {
  tenantIds: number[];
  authUserIds: string[];
  profileUserIds: string[];
  tenantMemberIds: string[];
  conversationIds: string[];
  participantKeys: string[];
  messageIds: string[];
  auditEventIds: string[];
}

interface CleanupFailure {
  resource: string;
  error: unknown;
}

const RUN_ID = `vitest-${randomUUID()}`;
const PASS = "Passw0rd!Test-Vitest";

const fixtureLedger: FixtureLedger = {
  tenantIds: [],
  authUserIds: [],
  profileUserIds: [],
  tenantMemberIds: [],
  conversationIds: [],
  participantKeys: [],
  messageIds: [],
  auditEventIds: [],
};

function recordOnce<T>(values: T[], value: T) {
  if (!values.includes(value)) values.push(value);
}

function formatCleanupError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

async function attemptCleanup(
  failures: CleanupFailure[],
  resource: string,
  operation: () => PromiseLike<{ error: { message?: string } | null }>,
) {
  try {
    const { error } = await operation();
    if (error) {
      failures.push({
        resource,
        error: new Error(error.message ?? "Supabase cleanup returned an error"),
      });
    }
  } catch (error) {
    failures.push({ resource, error });
  }
}

async function cleanupFixtures(): Promise<CleanupFailure[]> {
  if (!svc) return [];

  const failures: CleanupFailure[] = [];

  // Delete children before their conversations, users and tenants.
  for (const messageId of fixtureLedger.messageIds) {
    await attemptCleanup(failures, `tenant_messages/${messageId}`, () =>
      svc.from("tenant_messages").delete().eq("id", messageId),
    );
  }

  for (const auditEventId of fixtureLedger.auditEventIds) {
    await attemptCleanup(failures, `audit_events/${auditEventId}`, () =>
      svc.from("audit_events").delete().eq("id", auditEventId),
    );
  }

  for (const participantKey of fixtureLedger.participantKeys) {
    const separator = participantKey.indexOf(":");
    const conversationId = participantKey.slice(0, separator);
    const userId = participantKey.slice(separator + 1);
    await attemptCleanup(
      failures,
      `conversation_participants/${participantKey}`,
      () =>
        svc
          .from("conversation_participants")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", userId),
    );
  }

  for (const conversationId of fixtureLedger.conversationIds) {
    await attemptCleanup(
      failures,
      `tenant_conversations/${conversationId}`,
      () => svc.from("tenant_conversations").delete().eq("id", conversationId),
    );
  }

  for (const memberId of fixtureLedger.tenantMemberIds) {
    await attemptCleanup(failures, `tenant_members/${memberId}`, () =>
      svc.from("tenant_members").delete().eq("id", memberId),
    );
  }

  for (const profileUserId of fixtureLedger.profileUserIds) {
    await attemptCleanup(failures, `users/${profileUserId}`, () =>
      svc.from("users").delete().eq("user_uuid", profileUserId),
    );
  }

  for (const authUserId of fixtureLedger.authUserIds) {
    await attemptCleanup(failures, `auth.users/${authUserId}`, async () => {
      const { error } = await svc.auth.admin.deleteUser(authUserId);
      return { error };
    });
  }

  for (const tenantId of fixtureLedger.tenantIds) {
    await attemptCleanup(failures, `tenants/${tenantId}`, () =>
      svc.from("tenants").delete().eq("id", tenantId),
    );
  }

  return failures;
}

function throwCleanupFailures(failures: CleanupFailure[]) {
  if (!failures.length) return;
  const details = failures
    .map(({ resource, error }) => `${resource}: ${formatCleanupError(error)}`)
    .join("; ");
  throw new Error(`[tenant isolation] cleanup failed: ${details}`);
}

let svc: SupabaseClient<Database>;

let tenantA = 0;
let tenantB = 0;

let A1!: Persona;
let A2!: Persona;
let B1!: Persona;
let S!: Persona;

let convA = "";
let convA2 = "";
let convA_noStaff = "";
let convB = "";
let setupFailed = false;
let releaseRlsLock: (() => Promise<void>) | null = null;

// Captured from test 4 so test 15 can assert on the exact audit row.
let a1InsertedMessageId: string | null = null;

async function makePersona(
  label: string,
  role: "Client User" | "Team Member",
): Promise<Persona> {
  // unicorn_role enum: Super Admin | Admin | User | Team Leader | Team Member.
  // 'Client User' is spec shorthand → 'User'. Staff S → 'Team Member'.
  const unicornRole = role === "Team Member" ? "Team Member" : "User";
  const userType = role === "Team Member" ? "Vivacity" : "Client";

  const email = `${RUN_ID}-${label}@example.test`.toLowerCase();
  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    user_metadata: { run_id: RUN_ID, label },
  });
  if (error || !created.user) {
    throw new Error(`createUser ${label}: ${error?.message}`);
  }
  const authId = created.user.id;
  recordOnce(fixtureLedger.authUserIds, authId);
  recordOnce(fixtureLedger.profileUserIds, authId);

  // The `link_auth_user_to_profile` trigger may have created a stub row;
  // upsert on user_uuid handles both create and update paths.
  const profile: UserInsert = {
    user_uuid: authId,
    first_name: `Vitest-${label}`,
    last_name: RUN_ID,
    email,
    user_type: userType,
    unicorn_role: unicornRole,
    tenant_id: null,
  };
  const { error: profileErr } = await svc
    .from("users")
    .upsert(profile, { onConflict: "user_uuid" });
  if (profileErr) {
    throw new Error(`users upsert ${label}: ${profileErr.message}`);
  }

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await client.auth.signInWithPassword({
    email,
    password: PASS,
  });
  if (signErr) throw new Error(`signIn ${label}: ${signErr.message}`);

  return { email, authId, client };
}

async function addTenantMember(tenantId: number, userId: string): Promise<string> {
  const membership: TenantMemberInsert = {
    tenant_id: tenantId,
    user_id: userId,
    role: "member",
    status: "active",
    joined_at: new Date().toISOString(),
  };
  const { data, error } = await svc
    .from("tenant_members")
    .insert(membership)
    .select("id")
    .single();
  if (error) throw new Error(`tenant_members: ${error.message}`);
  if (!data) throw new Error("tenant_members: insert returned no row");
  recordOnce(fixtureLedger.tenantMemberIds, data.id);
  return data.id;
}

async function createConversation(
  tenantId: number,
  creatorAuthId: string,
): Promise<string> {
  const conversation: ConversationInsert = {
    tenant_id: tenantId,
    topic: "general",
    type: "general",
    subject: `vitest ${RUN_ID}`,
    created_by_user_uuid: creatorAuthId,
    status: "open",
  };
  const { data, error } = await svc
    .from("tenant_conversations")
    .insert(conversation)
    .select("id")
    .single();
  if (error || !data) throw new Error(`tenant_conversations: ${error?.message}`);
  const row: ConversationIdRow = data;
  recordOnce(fixtureLedger.conversationIds, row.id);
  return row.id;
}

async function addParticipant(
  conversationId: string,
  userId: string,
  role: "member" | "csc",
) {
  const participant: ParticipantInsert = {
    conversation_id: conversationId,
    user_id: userId,
    role,
    last_read_at: new Date().toISOString(),
  };
  const { error } = await svc.from("conversation_participants").insert(participant);
  if (error) throw new Error(`participant: ${error.message}`);
  recordOnce(fixtureLedger.participantKeys, `${conversationId}:${userId}`);
}

async function seedMessage(
  conversationId: string,
  tenantId: number,
  senderAuthId: string,
) {
  const message: MessageInsert = {
    conversation_id: conversationId,
    tenant_id: tenantId,
    sender_user_uuid: senderAuthId,
    sender_type: "client",
    body: `seed message ${RUN_ID}`,
  };
  const { data, error } = await svc
    .from("tenant_messages")
    .insert(message)
    .select("id")
    .single();
  if (error) throw new Error(`seed message: ${error.message}`);
  if (!data) throw new Error("seed message: insert returned no row");
  recordOnce(fixtureLedger.messageIds, data.id);
}

describe.skipIf(!RLS_SUITE_ENABLED).sequential(
  "tenant_messages RLS — live database",
  () => {
    beforeAll(async () => {
      releaseRlsLock = await acquireRlsSuiteLock(RLS_ENV.lockPath);
      svc = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      try {
        // Tenants — let DB assign bigint id.
        const tenantAInsert: TenantInsert = {
          name: `Test Tenant A ${RUN_ID}`,
          slug: `test-tenant-a-${RUN_ID}`.toLowerCase(),
          status: "active",
          // Keep the fixture focused on tenant/message RLS. The production
          // auto-assignment trigger is unrelated and requires consultant
          // capacity data that is intentionally absent from the empty QA DB.
          consultant_assignment_method: "manual",
        };
        const { data: tA, error: tAErr } = await svc
          .from("tenants")
          .insert(tenantAInsert)
          .select("id")
          .single();
        if (tAErr || !tA) throw new Error(`tenant A: ${tAErr?.message}`);
        tenantA = tA.id;
        recordOnce(fixtureLedger.tenantIds, tenantA);

        const tenantBInsert: TenantInsert = {
          name: `Test Tenant B ${RUN_ID}`,
          slug: `test-tenant-b-${RUN_ID}`.toLowerCase(),
          status: "active",
          consultant_assignment_method: "manual",
        };
        const { data: tB, error: tBErr } = await svc
          .from("tenants")
          .insert(tenantBInsert)
          .select("id")
          .single();
        if (tBErr || !tB) throw new Error(`tenant B: ${tBErr?.message}`);
        tenantB = tB.id;
        recordOnce(fixtureLedger.tenantIds, tenantB);

        // Personas.
        A1 = await makePersona("a1", "Client User");
        A2 = await makePersona("a2", "Client User");
        B1 = await makePersona("b1", "Client User");
        S = await makePersona("s", "Team Member");

        // Tenant memberships — S has none (staff identity is unicorn_role).
        await addTenantMember(tenantA, A1.authId);
        await addTenantMember(tenantA, A2.authId);
        await addTenantMember(tenantB, B1.authId);

        // Conversations.
        convA = await createConversation(tenantA, A1.authId);
        convA2 = await createConversation(tenantA, A2.authId);
        convA_noStaff = await createConversation(tenantA, A1.authId);
        convB = await createConversation(tenantB, B1.authId);

        // Participants. convA_noStaff intentionally has NO staff row — proves
        // tm_select_staff bypasses the participant check rather than matching it.
        await addParticipant(convA, A1.authId, "member");
        await addParticipant(convA, S.authId, "csc");

        await addParticipant(convA2, A2.authId, "member");
        await addParticipant(convA2, S.authId, "csc");

        await addParticipant(convA_noStaff, A1.authId, "member");

        await addParticipant(convB, B1.authId, "member");
        await addParticipant(convB, S.authId, "csc");

        // Seed one message per conversation.
        await seedMessage(convA, tenantA, A1.authId);
        await seedMessage(convA2, tenantA, A2.authId);
        await seedMessage(convA_noStaff, tenantA, A1.authId);
        await seedMessage(convB, tenantB, B1.authId);
      } catch (error) {
        setupFailed = true;
        const cleanupFailures = await cleanupFixtures();
        if (cleanupFailures.length) {
          const cleanupDetails = cleanupFailures
            .map(({ resource, error: cleanupError }) =>
              `${resource}: ${formatCleanupError(cleanupError)}`,
            )
            .join("; ");
          throw new Error(
            `Tenant isolation fixture setup failed: ${formatCleanupError(error)}; ` +
              `cleanup failed: ${cleanupDetails}`,
          );
        }
        throw error;
      }
    }, 60_000);

    afterAll(async () => {
      try {
        if (!svc || setupFailed) return;
        throwCleanupFailures(await cleanupFixtures());
      } finally {
        if (releaseRlsLock) await releaseRlsLock();
      }
    }, 60_000);

    /* ---------------- Persona A1 ---------------- */

    it("1. A1 SELECT messages in convA → 1 row", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convA);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(1);
    });

    it("2. A1 SELECT messages in same-tenant convA2 (not a participant) → 0 rows", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convA2);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("3. A1 SELECT messages in cross-tenant convB → 0 rows", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convB);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("4. A1 INSERT into convA → success (capture message id for test 15)", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages")
        .insert({
          conversation_id: convA,
          tenant_id: tenantA,
          sender_user_uuid: A1.authId,
          sender_type: "client",
          body: `test send ${RUN_ID}`,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      const insertedMessage: TenantMessageIdRow | null = data;
      a1InsertedMessageId = insertedMessage?.id ?? null;
      if (a1InsertedMessageId) {
        recordOnce(fixtureLedger.messageIds, a1InsertedMessageId);
      }
      expect(a1InsertedMessageId).toBeTruthy();
    });

    it("5. A1 INSERT into same-tenant convA2 (not participant) → RLS rejection", async () => {
      const { error } = await A1.client.from("tenant_messages").insert({
        conversation_id: convA2,
        tenant_id: tenantA,
        sender_user_uuid: A1.authId,
        sender_type: "client",
        body: `should fail ${RUN_ID}`,
      });
      expectRlsViolation(error);
    });

    it("6. A1 INSERT into cross-tenant convB → RLS rejection", async () => {
      const { error } = await A1.client.from("tenant_messages").insert({
        conversation_id: convB,
        tenant_id: tenantB,
        sender_user_uuid: A1.authId,
        sender_type: "client",
        body: `should fail ${RUN_ID}`,
      });
      expectRlsViolation(error);
    });

    it("7. A1 SELECT tenant_conversations for tenant A → contains convA, convA2, convA_noStaff (≥3)", async () => {
      const { data, error } = await A1.client
        .from("tenant_conversations")
        .select("id")
        .eq("tenant_id", tenantA);
      expect(error).toBeNull();
      const ids = new Set((data ?? []).map((row) => row.id));
      expect(ids.has(convA)).toBe(true);
      expect(ids.has(convA2)).toBe(true);
      expect(ids.has(convA_noStaff)).toBe(true);
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(3);
    });

    /* ---------------- Persona B1 ---------------- */

    it("8. B1 SELECT messages in convA → 0 rows", async () => {
      const { data, error } = await B1.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convA);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("9. B1 SELECT messages in convA2 → 0 rows", async () => {
      const { data, error } = await B1.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convA2);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("10. B1 INSERT into convA → RLS rejection", async () => {
      const { error } = await B1.client.from("tenant_messages").insert({
        conversation_id: convA,
        tenant_id: tenantA,
        sender_user_uuid: B1.authId,
        sender_type: "client",
        body: `should fail ${RUN_ID}`,
      });
      expectRlsViolation(error);
    });

    /* ---------------- Persona Staff S ---------------- */

    it("11. S SELECT messages in convA_noStaff (S NOT a participant) → ≥1 row (tm_select_staff)", async () => {
      const { data, error } = await S.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convA_noStaff);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });

    it("12. S SELECT messages in convA2 → ≥1 row", async () => {
      const { data, error } = await S.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convA2);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });

    it("13. S SELECT messages in convB → ≥1 row", async () => {
      const { data, error } = await S.client
        .from("tenant_messages")
        .select("id")
        .eq("conversation_id", convB);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });

    it("14. S INSERT into convA as staff → success (tm_insert_staff)", async () => {
      const { data, error } = await S.client
        .from("tenant_messages")
        .insert({
          conversation_id: convA,
          tenant_id: tenantA,
          sender_user_uuid: S.authId,
          sender_type: "staff",
          body: `staff reply ${RUN_ID}`,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (data) recordOnce(fixtureLedger.messageIds, data.id);
    });

    /* ---------------- Audit trigger (M2) ---------------- */

    it("15. audit_events row exists for A1's INSERT (entity_id = captured message id)", async () => {
      expect(a1InsertedMessageId).toBeTruthy();
      const { data, error } = await svc
        .from("audit_events")
        .select("id, entity, action, user_id, entity_id")
        .eq("entity", "tenant_message")
        .eq("entity_id", a1InsertedMessageId as string);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
      const auditRows: AuditEventRow[] = data ?? [];
      auditRows.forEach((row) => recordOnce(fixtureLedger.auditEventIds, row.id));
      expect(auditRows.some((row) => row.user_id === A1.authId)).toBe(true);
    });
  },
);
