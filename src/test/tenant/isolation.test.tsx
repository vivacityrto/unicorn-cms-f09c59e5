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

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*  Legacy placeholder block (preserved verbatim).                            */
/* -------------------------------------------------------------------------- */

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: mockFrom,
  },
}));

describe("Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Data Access Restrictions", () => {
    it("should only return data for the user's tenant", async () => {
      expect(true).toBe(true);
    });
    it("should prevent access to other tenant's data via direct ID", async () => {
      expect(true).toBe(true);
    });
    it("should prevent cross-tenant data insertion", async () => {
      expect(true).toBe(true);
    });
    it("should prevent cross-tenant data updates", async () => {
      expect(true).toBe(true);
    });
    it("should prevent cross-tenant data deletion", async () => {
      expect(true).toBe(true);
    });
  });

  describe("Vivacity Staff Cross-Tenant Access", () => {
    it("should allow Vivacity staff to view all tenants", async () => {
      expect(true).toBe(true);
    });
    it("should allow Vivacity staff to manage any tenant's data", async () => {
      expect(true).toBe(true);
    });
  });

  describe("Tenant Member Status", () => {
    it("should deny access to inactive tenant members", async () => {
      expect(true).toBe(true);
    });
    it("should deny access to suspended tenant members", async () => {
      expect(true).toBe(true);
    });
  });

  describe("Multi-Tenant Users", () => {
    it("should only access data from the currently selected tenant", async () => {
      expect(true).toBe(true);
    });
  });

  describe("Client Notes Confidentiality", () => {
    it("should prevent clients from seeing internal notes", async () => {
      expect(true).toBe(true);
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Live RLS suite — tenant_messages / tenant_conversations                   */
/*  Requires SUPABASE_SERVICE_ROLE_KEY (NON-VITE) + VITE_SUPABASE_URL +       */
/*  VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY).                */
/* -------------------------------------------------------------------------- */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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
  client: SupabaseClient;
}

const RUN_ID = `vitest-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const PASS = "Passw0rd!Test-Vitest";

let svc: SupabaseClient;

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

  // The `link_auth_user_to_profile` trigger may have created a stub row;
  // upsert on user_uuid handles both create and update paths.
  const { error: profileErr } = await svc
    .from("users")
    .upsert(
      {
        user_uuid: authId,
        first_name: `Vitest-${label}`,
        last_name: RUN_ID,
        email,
        user_type: userType,
        unicorn_role: unicornRole,
        tenant_id: null,
      } as any,
      { onConflict: "user_uuid" },
    );
  if (profileErr) {
    throw new Error(`users upsert ${label}: ${profileErr.message}`);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await client.auth.signInWithPassword({
    email,
    password: PASS,
  });
  if (signErr) throw new Error(`signIn ${label}: ${signErr.message}`);

  return { email, authId, client };
}

async function addTenantMember(tenantId: number, userId: string) {
  const { error } = await svc.from("tenant_members").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "member",
    status: "active",
    joined_at: new Date().toISOString(),
  } as any);
  if (error) throw new Error(`tenant_members: ${error.message}`);
}

async function createConversation(
  tenantId: number,
  creatorAuthId: string,
): Promise<string> {
  const { data, error } = await svc
    .from("tenant_conversations" as any)
    .insert({
      tenant_id: tenantId,
      topic: "general",
      type: "general",
      subject: `vitest ${RUN_ID}`,
      created_by_user_uuid: creatorAuthId,
      status: "open",
    } as any)
    .select("id")
    .single();
  if (error || !data) throw new Error(`tenant_conversations: ${error?.message}`);
  return (data as any).id as string;
}

async function addParticipant(
  conversationId: string,
  userId: string,
  role: "member" | "csc",
) {
  const { error } = await svc.from("conversation_participants" as any).insert({
    conversation_id: conversationId,
    user_id: userId,
    role,
    last_read_at: new Date().toISOString(),
  } as any);
  if (error) throw new Error(`participant: ${error.message}`);
}

async function seedMessage(
  conversationId: string,
  tenantId: number,
  senderAuthId: string,
) {
  const { error } = await svc.from("tenant_messages" as any).insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    sender_user_uuid: senderAuthId,
    sender_type: "client",
    body: "seed message",
  } as any);
  if (error) throw new Error(`seed message: ${error.message}`);
}

describe.sequential.skipIf(!RLS_SUITE_ENABLED)(
  "tenant_messages RLS — live database",
  () => {
    beforeAll(async () => {
      svc = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Tenants — let DB assign bigint id.
      const { data: tA, error: tAErr } = await svc
        .from("tenants")
        .insert({
          name: `Test Tenant A ${RUN_ID}`,
          slug: `test-tenant-a-${RUN_ID}`.toLowerCase(),
          status: "active",
        } as any)
        .select("id")
        .single();
      if (tAErr || !tA) throw new Error(`tenant A: ${tAErr?.message}`);
      tenantA = (tA as any).id;

      const { data: tB, error: tBErr } = await svc
        .from("tenants")
        .insert({
          name: `Test Tenant B ${RUN_ID}`,
          slug: `test-tenant-b-${RUN_ID}`.toLowerCase(),
          status: "active",
        } as any)
        .select("id")
        .single();
      if (tBErr || !tB) throw new Error(`tenant B: ${tBErr?.message}`);
      tenantB = (tB as any).id;

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
    }, 60_000);

    afterAll(async () => {
      if (!svc) return;
      try {
        const convIds = [convA, convA2, convA_noStaff, convB].filter(Boolean);
        const userIds = [A1, A2, B1, S].filter(Boolean).map((p) => p.authId);

        if (convIds.length) {
          await svc.from("tenant_messages").delete().in("conversation_id", convIds);
          await svc
            .from("conversation_participants")
            .delete()
            .in("conversation_id", convIds);
          await svc.from("tenant_conversations").delete().in("id", convIds);
        }
        if (userIds.length) {
          await svc
            .from("audit_events")
            .delete()
            .eq("entity", "tenant_message")
            .in("user_id", userIds);
        }
        const tenantIds = [tenantA, tenantB].filter((id) => id > 0);
        if (tenantIds.length) {
          await svc.from("tenant_members").delete().in("tenant_id", tenantIds);
        }
        if (userIds.length) {
          await svc.from("users").delete().in("user_uuid", userIds);
        }
        if (tenantIds.length) {
          await svc.from("tenants").delete().in("id", tenantIds);
        }
        for (const p of [A1, A2, B1, S]) {
          if (p?.authId) {
            await svc.auth.admin.deleteUser(p.authId).catch(() => {});
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[tenant isolation] cleanup error:", err);
      }
    }, 60_000);

    /* ---------------- Persona A1 ---------------- */

    it("1. A1 SELECT messages in convA → 1 row", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convA);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(1);
    });

    it("2. A1 SELECT messages in same-tenant convA2 (not a participant) → 0 rows", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convA2);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("3. A1 SELECT messages in cross-tenant convB → 0 rows", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convB);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("4. A1 INSERT into convA → success (capture message id for test 15)", async () => {
      const { data, error } = await A1.client
        .from("tenant_messages" as any)
        .insert({
          conversation_id: convA,
          tenant_id: tenantA,
          sender_user_uuid: A1.authId,
          sender_type: "client",
          body: "test send",
        } as any)
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      a1InsertedMessageId = (data as any)?.id ?? null;
      expect(a1InsertedMessageId).toBeTruthy();
    });

    it("5. A1 INSERT into same-tenant convA2 (not participant) → RLS rejection", async () => {
      const { error } = await A1.client.from("tenant_messages" as any).insert({
        conversation_id: convA2,
        tenant_id: tenantA,
        sender_user_uuid: A1.authId,
        sender_type: "client",
        body: "should fail",
      } as any);
      expectRlsViolation(error as any);
    });

    it("6. A1 INSERT into cross-tenant convB → RLS rejection", async () => {
      const { error } = await A1.client.from("tenant_messages" as any).insert({
        conversation_id: convB,
        tenant_id: tenantB,
        sender_user_uuid: A1.authId,
        sender_type: "client",
        body: "should fail",
      } as any);
      expectRlsViolation(error as any);
    });

    it("7. A1 SELECT tenant_conversations for tenant A → contains convA, convA2, convA_noStaff (≥3)", async () => {
      const { data, error } = await A1.client
        .from("tenant_conversations" as any)
        .select("id")
        .eq("tenant_id", tenantA);
      expect(error).toBeNull();
      const ids = new Set((data ?? []).map((r: any) => r.id));
      expect(ids.has(convA)).toBe(true);
      expect(ids.has(convA2)).toBe(true);
      expect(ids.has(convA_noStaff)).toBe(true);
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(3);
    });

    /* ---------------- Persona B1 ---------------- */

    it("8. B1 SELECT messages in convA → 0 rows", async () => {
      const { data, error } = await B1.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convA);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("9. B1 SELECT messages in convA2 → 0 rows", async () => {
      const { data, error } = await B1.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convA2);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(0);
    });

    it("10. B1 INSERT into convA → RLS rejection", async () => {
      const { error } = await B1.client.from("tenant_messages" as any).insert({
        conversation_id: convA,
        tenant_id: tenantA,
        sender_user_uuid: B1.authId,
        sender_type: "client",
        body: "should fail",
      } as any);
      expectRlsViolation(error as any);
    });

    /* ---------------- Persona Staff S ---------------- */

    it("11. S SELECT messages in convA_noStaff (S NOT a participant) → ≥1 row (tm_select_staff)", async () => {
      const { data, error } = await S.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convA_noStaff);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });

    it("12. S SELECT messages in convA2 → ≥1 row", async () => {
      const { data, error } = await S.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convA2);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });

    it("13. S SELECT messages in convB → ≥1 row", async () => {
      const { data, error } = await S.client
        .from("tenant_messages" as any)
        .select("id")
        .eq("conversation_id", convB);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    });

    it("14. S INSERT into convA as staff → success (tm_insert_staff)", async () => {
      const { error } = await S.client.from("tenant_messages" as any).insert({
        conversation_id: convA,
        tenant_id: tenantA,
        sender_user_uuid: S.authId,
        sender_type: "staff",
        body: "staff reply",
      } as any);
      expect(error).toBeNull();
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
      expect((data ?? []).some((r: any) => r.user_id === A1.authId)).toBe(true);
    });
  },
);
