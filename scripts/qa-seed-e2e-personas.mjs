#!/usr/bin/env node
// Idempotently provisions the persistent qa:e2e fixtures in unicorn-qa: one
// tenant and two personas (Super Admin, client), plus the short-lived TOM
// P0.2/P0.3 read personas. Unlike every other
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
// first; creates only what's missing, and always resets the personas' passwords
// to the current QA_*_PASSWORD env values (so a storage-state regeneration
// after a password rotation always succeeds). TOM personas are tied to the
// already-seeded, run-scoped tenant fixture and do not alter its profile rows.
//
// Usage (matches every other P2-QA script/suite's env-var contract):
//   VITE_SUPABASE_URL=https://qfpxvumcrnzrjyvqkicq.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   QA_E2E_SUPERADMIN_PASSWORD=... QA_E2E_CLIENT_PASSWORD=... \
//   QA_TOM_CLIENT_ADMIN_A_PASSWORD=... QA_TOM_CLIENT_USER_A_PASSWORD=... \
//   QA_TOM_CLIENT_ADMIN_B_PASSWORD=... QA_TOM_CSC_PASSWORD=... \
//   QA_TOM_INTEGRATOR_PASSWORD=... QA_TOM_TEAM_LEADER_PASSWORD=... \
//   QA_TOM_DISABLED_STAFF_PASSWORD=... QA_TOM_SERVICE_PRINCIPAL_PASSWORD=... \
//   node scripts/qa-seed-e2e-personas.mjs
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;

const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const superAdminPassword = process.env.QA_E2E_SUPERADMIN_PASSWORD ?? "";
const clientPassword = process.env.QA_E2E_CLIENT_PASSWORD ?? "";
const tomClientAdminAPassword = process.env.QA_TOM_CLIENT_ADMIN_A_PASSWORD ?? "";
const tomClientPrimaryInviterPassword = process.env.QA_TOM_CLIENT_PRIMARY_INVITER_PASSWORD ?? tomClientAdminAPassword;
const tomClientUserAPassword = process.env.QA_TOM_CLIENT_USER_A_PASSWORD ?? "";
const tomClientAdminBPassword = process.env.QA_TOM_CLIENT_ADMIN_B_PASSWORD ?? "";
const tomCscPassword = process.env.QA_TOM_CSC_PASSWORD ?? "";
const tomIntegratorPassword = process.env.QA_TOM_INTEGRATOR_PASSWORD ?? "";
const tomTeamLeaderPassword = process.env.QA_TOM_TEAM_LEADER_PASSWORD ?? "";
const tomDisabledStaffPassword = process.env.QA_TOM_DISABLED_STAFF_PASSWORD ?? "";
const tomServicePrincipalPassword = process.env.QA_TOM_SERVICE_PRINCIPAL_PASSWORD ?? "";
const TOM_FIXTURE_TAG = process.env.QA_TOM_FIXTURE_TAG ?? "tom_qa_20260913_seed_01";

if (supabaseUrl !== QA_PROJECT_URL) {
  console.error(`qa-seed-e2e-personas: refusing to run -- target must be ${QA_PROJECT_URL}, got "${supabaseUrl || "(unset)"}"`);
  process.exit(1);
}
if (!serviceRole || !superAdminPassword || !clientPassword || !tomClientAdminAPassword || !tomClientUserAPassword || !tomClientAdminBPassword || !tomCscPassword || !tomIntegratorPassword || !tomTeamLeaderPassword || !tomDisabledStaffPassword || !tomServicePrincipalPassword) {
  console.error("qa-seed-e2e-personas: service-role and all persistent/TOM persona passwords are required");
  process.exit(1);
}

const svc = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_SLUG = "qa-e2e-demo-tenant";
const TENANT_NAME = "QA E2E Demo Tenant";

function fixtureUuid(persona) {
  const hex = createHash("md5").update(`${TOM_FIXTURE_TAG}:persona:${persona}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fixtureEmail(persona) {
  return `${TOM_FIXTURE_TAG}_${persona}@example.qa`;
}

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

async function upsertPersona({ email, password, firstName, lastName, unicornRole, userType, tenantId, userId, disabled, isSystemAccount, isVivacityInternal }) {
  let authUser = await findAuthUserByEmail(email);
  if (authUser) {
    const { error } = await svc.auth.admin.updateUserById(authUser.id, { password });
    if (error) throw new Error(`updateUserById(${email}): ${error.message}`);
    console.log(`persona ${email}: existing auth user, password reset`);
  } else {
    const { data, error } = await svc.auth.admin.createUser({
      ...(userId ? { id: userId } : {}),
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_e2e_persona: true, qa_tom_fixture: TOM_FIXTURE_TAG },
    });
    if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message}`);
    authUser = data.user;
    console.log(`persona ${email}: created auth user ${authUser.id}`);
  }

  const profile = {
    user_uuid: authUser.id,
    first_name: firstName,
    last_name: lastName,
    email,
    user_type: userType,
    unicorn_role: unicornRole,
    tenant_id: tenantId,
    ...(disabled === undefined ? {} : { disabled }),
    ...(isSystemAccount === undefined ? {} : { is_system_account: isSystemAccount }),
  };
  const { error: profileErr } = await svc.from("users").upsert(profile, { onConflict: "user_uuid" });
  if (profileErr) throw new Error(`users upsert (${email}): ${profileErr.message}`);

  // The deployed legacy trigger only derives this flag for the original
  // three staff roles. Set it explicitly for QA's Integrator/service-principal
  // profiles so those identities exercise the intended staff RLS context;
  // this is fixture data, not a production policy change.
  if (isVivacityInternal !== undefined) {
    const { error: internalErr } = await svc
      .from("users")
      .update({ is_vivacity_internal: isVivacityInternal })
      .eq("user_uuid", authUser.id);
    if (internalErr) throw new Error(`users internal flag update (${email}): ${internalErr.message}`);
  }
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

async function findFixtureTenant(suffix) {
  const slug = `${TOM_FIXTURE_TAG}_tenant_${suffix}`;
  const { data, error } = await svc.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`fixture tenant lookup (${slug}): ${error.message}`);
  if (!data) throw new Error(`fixture tenant lookup (${slug}): seeded tenant not found`);
  return data.id;
}

async function ensureClientParentUserType() {
  const { data: existing, error: findErr } = await svc
    .from("dd_user_type")
    .select("value")
    .eq("value", "Client Parent")
    .maybeSingle();
  if (findErr) throw new Error(`dd_user_type lookup: ${findErr.message}`);
  if (existing) return;

  const { error: insertErr } = await svc.from("dd_user_type").insert({
    value: "Client Parent",
    label: "Client Parent",
    sort_order: 40,
    is_active: true,
  });
  if (insertErr) throw new Error(`dd_user_type insert: ${insertErr.message}`);
  console.log("dd_user_type: added QA-required Client Parent reference row");
}

async function ensureInternalRoleReferences() {
  const roles = [
    {
      value: "Team Leader",
      label: "Team Leader",
      description: "Vivacity team leadership role",
      sort_order: 2,
    },
    {
      value: "Integrator",
      label: "Vivacity Integrator",
      description: "Vivacity Integrator — internal staff role.",
      sort_order: 3,
    },
  ];

  for (const role of roles) {
    const { data: existing, error: findErr } = await svc
      .from("dd_unicorn_roles")
      .select("value")
      .eq("value", role.value)
      .maybeSingle();
    if (findErr) throw new Error(`dd_unicorn_roles lookup (${role.value}): ${findErr.message}`);
    if (existing) continue;

    const { error: insertErr } = await svc.from("dd_unicorn_roles").insert({
      ...role,
      is_active: true,
      is_internal: true,
    });
    if (insertErr) throw new Error(`dd_unicorn_roles insert (${role.value}): ${insertErr.message}`);
    console.log(`dd_unicorn_roles: added QA-required ${role.value} reference row`);
  }
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

async function ensureTenantPrimaryContact(tenantId, userId) {
  const { data: existing, error: findErr } = await svc
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (findErr) throw new Error(`tenant_users primary lookup: ${findErr.message}`);

  const payload = {
    role: "parent",
    primary_contact: true,
    secondary_contact: false,
    access_scope: "full",
    relationship_role: "primary_contact",
  };
  const query = existing
    ? svc.from("tenant_users").update(payload).eq("id", existing.id)
    : svc.from("tenant_users").insert({ tenant_id: tenantId, user_id: userId, ...payload });
  const { error } = await query;
  if (error) throw new Error(`tenant_users primary upsert: ${error.message}`);
  console.log(`tenant_users: linked dedicated TOM P1.1 inviter to tenant ${tenantId} (relationship_role=primary_contact, access_scope=full)`);
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
  await ensureClientParentUserType();
  await ensureInternalRoleReferences();

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

  const tenantAId = await findFixtureTenant(2);
  const tenantBId = await findFixtureTenant(3);

  const tomClientAdminAId = await upsertPersona({
    email: fixtureEmail("client_admin_a"),
    password: tomClientAdminAPassword,
    firstName: "TOM QA",
    lastName: "Client Admin A",
    unicornRole: "Admin",
    userType: "Client",
    tenantId: tenantAId,
    userId: fixtureUuid("client_admin_a"),
  });
  await ensureTenantMember(tenantAId, tomClientAdminAId);
  await ensureTenantUser(tenantAId, tomClientAdminAId);

  const tomClientPrimaryInviterId = await upsertPersona({
    email: fixtureEmail("client_primary_inviter"),
    password: tomClientPrimaryInviterPassword,
    firstName: "TOM QA",
    lastName: "P1.1 Primary Inviter",
    unicornRole: "Admin",
    userType: "Client Parent",
    tenantId: tenantAId,
    userId: fixtureUuid("client_primary_inviter"),
  });
  await ensureTenantMember(tenantAId, tomClientPrimaryInviterId);
  await ensureTenantPrimaryContact(tenantAId, tomClientPrimaryInviterId);

  const tomClientUserAId = await upsertPersona({
    email: fixtureEmail("client_user_a"),
    password: tomClientUserAPassword,
    firstName: "TOM QA",
    lastName: "Client User A",
    unicornRole: "User",
    userType: "Client",
    tenantId: tenantAId,
    userId: fixtureUuid("client_user_a"),
  });
  await ensureTenantMember(tenantAId, tomClientUserAId);
  await ensureTenantUser(tenantAId, tomClientUserAId);

  const tomClientAdminBId = await upsertPersona({
    email: fixtureEmail("client_admin_b"),
    password: tomClientAdminBPassword,
    firstName: "TOM QA",
    lastName: "Client Admin B",
    unicornRole: "Admin",
    userType: "Client",
    tenantId: tenantBId,
    userId: fixtureUuid("client_admin_b"),
  });
  await ensureTenantMember(tenantBId, tomClientAdminBId);
  await ensureTenantUser(tenantBId, tomClientAdminBId);

  await upsertPersona({
    email: fixtureEmail("csc"),
    password: tomCscPassword,
    firstName: "TOM QA",
    lastName: "CSC",
    unicornRole: "Team Member",
    userType: "Vivacity Team",
    tenantId: null,
    userId: fixtureUuid("csc"),
    isVivacityInternal: true,
  });

  await upsertPersona({
    email: fixtureEmail("integrator"),
    password: tomIntegratorPassword,
    firstName: "TOM QA",
    lastName: "Integrator",
    unicornRole: "Integrator",
    userType: "Vivacity Team",
    tenantId: null,
    userId: fixtureUuid("integrator"),
    isVivacityInternal: true,
  });

  await upsertPersona({
    email: fixtureEmail("team_leader"),
    password: tomTeamLeaderPassword,
    firstName: "TOM QA",
    lastName: "Team Leader",
    unicornRole: "Team Leader",
    userType: "Vivacity Team",
    tenantId: null,
    userId: fixtureUuid("team_leader"),
    isVivacityInternal: true,
  });

  await upsertPersona({
    email: fixtureEmail("disabled_staff"),
    password: tomDisabledStaffPassword,
    firstName: "TOM QA",
    lastName: "Disabled Staff",
    unicornRole: "Team Member",
    userType: "Vivacity Team",
    tenantId: null,
    userId: fixtureUuid("disabled_staff"),
    disabled: true,
    isVivacityInternal: true,
  });

  // This identity is intentionally not added to Playwright storage states.
  // It represents a machine principal for a later, explicitly allowlisted
  // non-browser read-contract check.
  await upsertPersona({
    email: fixtureEmail("service_principal"),
    password: tomServicePrincipalPassword,
    firstName: "TOM QA",
    lastName: "Service Principal",
    unicornRole: "Integrator",
    userType: "Vivacity Team",
    tenantId: null,
    userId: fixtureUuid("service_principal"),
    isSystemAccount: true,
    isVivacityInternal: true,
  });

  console.log("qa-seed-e2e-personas: done");
}

main().catch((err) => {
  console.error("qa-seed-e2e-personas failed:", err.message);
  process.exit(1);
});
