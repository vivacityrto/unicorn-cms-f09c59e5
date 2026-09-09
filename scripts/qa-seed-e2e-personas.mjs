#!/usr/bin/env node
// Idempotently provisions the persistent qa:e2e fixtures in unicorn-qa: one
// tenant and two personas (Super Admin, client). Unlike every other
// fixture-producing P2-QA suite, these are deliberately NOT cleaned up after
// each run -- Playwright's authenticated read-only route checks need
// something real to log into and render, and re-seeding a throwaway persona
// before every Playwright run would add real complexity for no benefit here
// (these fixtures make zero writes once created; qa:residue's own sweep is
// deliberately unaffected -- see below).
//
// Naming is deliberately distinct from every ephemeral fixture-producing
// suite's convention (RUN_ID starting with "vitest", @example.test emails)
// specifically so qa:residue's sweep (src/test/qa/residue.test.ts) does not
// flag these persistent fixtures as leftover data: emails use the
// "@example.qa" domain (not "@example.test") and the tenant slug/name use
// "qa-e2e" (not "vitest").
//
// Safe to re-run: looks up each persona by email and the tenant by slug
// first; creates only what's missing, and always resets the two personas'
// passwords to the current QA_E2E_*_PASSWORD env values (so a storage-state
// regeneration after a password rotation always succeeds).
//
// Usage (matches every other P2-QA script/suite's env-var contract):
//   VITE_SUPABASE_URL=https://qfpxvumcrnzrjyvqkicq.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   QA_E2E_SUPERADMIN_PASSWORD=... QA_E2E_CLIENT_PASSWORD=... \
//   node scripts/qa-seed-e2e-personas.mjs
import { createClient } from "@supabase/supabase-js";

const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;

const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const superAdminPassword = process.env.QA_E2E_SUPERADMIN_PASSWORD ?? "";
const clientPassword = process.env.QA_E2E_CLIENT_PASSWORD ?? "";

if (supabaseUrl !== QA_PROJECT_URL) {
  console.error(`qa-seed-e2e-personas: refusing to run -- target must be ${QA_PROJECT_URL}, got "${supabaseUrl || "(unset)"}"`);
  process.exit(1);
}
if (!serviceRole || !superAdminPassword || !clientPassword) {
  console.error("qa-seed-e2e-personas: SUPABASE_SERVICE_ROLE_KEY, QA_E2E_SUPERADMIN_PASSWORD and QA_E2E_CLIENT_PASSWORD are all required");
  process.exit(1);
}

const svc = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_SLUG = "qa-e2e-demo-tenant";
const TENANT_NAME = "QA E2E Demo Tenant";

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function upsertPersona({ email, password, firstName, lastName, unicornRole, userType, tenantId }) {
  let authUser = await findAuthUserByEmail(email);
  if (authUser) {
    const { error } = await svc.auth.admin.updateUserById(authUser.id, { password });
    if (error) throw new Error(`updateUserById(${email}): ${error.message}`);
    console.log(`persona ${email}: existing auth user, password reset`);
  } else {
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_e2e_persona: true },
    });
    if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message}`);
    authUser = data.user;
    console.log(`persona ${email}: created auth user ${authUser.id}`);
  }

  const { error: profileErr } = await svc.from("users").upsert(
    {
      user_uuid: authUser.id,
      first_name: firstName,
      last_name: lastName,
      email,
      user_type: userType,
      unicorn_role: unicornRole,
      tenant_id: tenantId,
    },
    { onConflict: "user_uuid" },
  );
  if (profileErr) throw new Error(`users upsert (${email}): ${profileErr.message}`);
  console.log(`persona ${email}: profile upserted (unicorn_role=${unicornRole}, tenant_id=${tenantId ?? "null"})`);

  return authUser.id;
}

async function upsertTenant() {
  const { data: existing, error: findErr } = await svc
    .from("tenants")
    .select("id")
    .eq("slug", TENANT_SLUG)
    .maybeSingle();
  if (findErr) throw new Error(`tenants lookup: ${findErr.message}`);
  if (existing) {
    console.log(`tenant ${TENANT_SLUG}: already exists (id=${existing.id})`);
    return existing.id;
  }

  const { data: created, error: createErr } = await svc
    .from("tenants")
    .insert({ name: TENANT_NAME, slug: TENANT_SLUG, consultant_assignment_method: "manual" })
    .select("id")
    .single();
  if (createErr || !created) throw new Error(`tenants insert: ${createErr?.message}`);
  console.log(`tenant ${TENANT_SLUG}: created (id=${created.id})`);
  return created.id;
}

async function ensureTenantUser(tenantId, userId) {
  // tenant_users.relationship_role/access_scope (not tenant_members) is what
  // ClientTenantContext.tsx actually gates client-portal access on -- a
  // persona present only in tenant_members but absent from tenant_users
  // renders the app's own (correct) "Academy access only" fallback, since
  // ClientTenantContext treats a missing tenant_users row as no portal
  // access at all. relationship_role "user" (see
  // src/lib/roles/relationshipRole.ts) is a full-access standard member --
  // deliberately not "primary_contact", which the UI treats as unique per
  // organisation.
  const { data: existing, error: findErr } = await svc
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (findErr) throw new Error(`tenant_users lookup: ${findErr.message}`);
  if (existing) {
    console.log(`tenant_users: already links tenant ${tenantId} <-> user ${userId}`);
    return;
  }
  const { error: insertErr } = await svc.from("tenant_users").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "child",
    primary_contact: false,
    access_scope: "full",
    relationship_role: "user",
  });
  if (insertErr) throw new Error(`tenant_users insert: ${insertErr.message}`);
  console.log(`tenant_users: linked tenant ${tenantId} <-> user ${userId} (relationship_role=user, access_scope=full)`);
}

async function ensureTenantMember(tenantId, userId) {
  const { data: existing, error: findErr } = await svc
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (findErr) throw new Error(`tenant_members lookup: ${findErr.message}`);
  if (existing) {
    console.log(`tenant_members: already links tenant ${tenantId} <-> user ${userId}`);
    return;
  }
  const { error: insertErr } = await svc.from("tenant_members").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "General User",
    status: "active",
    joined_at: new Date().toISOString(),
  });
  if (insertErr) throw new Error(`tenant_members insert: ${insertErr.message}`);
  console.log(`tenant_members: linked tenant ${tenantId} <-> user ${userId}`);
}

async function main() {
  const tenantId = await upsertTenant();

  await upsertPersona({
    email: "qa-e2e-superadmin@example.qa",
    password: superAdminPassword,
    firstName: "QA-E2E",
    lastName: "SuperAdmin",
    unicornRole: "Super Admin",
    userType: "Vivacity",
    tenantId: null,
  });

  const clientUserId = await upsertPersona({
    email: "qa-e2e-client@example.qa",
    password: clientPassword,
    firstName: "QA-E2E",
    lastName: "Client",
    unicornRole: "User",
    userType: "Client",
    tenantId,
  });
  await ensureTenantMember(tenantId, clientUserId);
  await ensureTenantUser(tenantId, clientUserId);

  console.log("qa-seed-e2e-personas: done");
}

main().catch((err) => {
  console.error("qa-seed-e2e-personas failed:", err.message);
  process.exit(1);
});
