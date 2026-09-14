#!/usr/bin/env node
// Bounded TOM P1.1 contact-promotion canary for the protected unicorn-qa
// environment. This intentionally uses the real UI -> invite-user ->
// accept_invitation_v2 path, but keeps every mutable row run-scoped and
// removes only the exact rows it created. Audit rows are retained as evidence.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;
const APP_URL = process.env.QA_APP_URL ?? "http://localhost:8080";
const RUN_TAG = process.env.QA_TOM_P11_RUN_TAG ?? `tom_p11_${process.env.GITHUB_RUN_ID ?? Date.now()}`;
const RECIPIENT_EMAIL = process.env.QA_TOM_P11_RECIPIENT_EMAIL ?? "carl+tom-p11-qa-20260914@complyhub.ai";
const STORAGE_STATE = process.env.QA_TOM_P11_STORAGE_STATE ?? "playwright/.auth/tom-p11-client-admin-a.json";
const RESULT_PATH = process.env.QA_TOM_P11_RESULT_PATH ?? "qa-artifacts/tom-p11-result.json";
const TOM_FIXTURE_TAG = process.env.QA_TOM_FIXTURE_TAG ?? "tom_qa_20260913_seed_01";
const INVITER_EMAIL = `${TOM_FIXTURE_TAG}_client_admin_a@example.qa`;

const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const inviterPassword = process.env.QA_TOM_CLIENT_ADMIN_A_PASSWORD ?? "";

function requireValue(name, value) {
  if (!value) throw new Error(`Missing required protected value: ${name}`);
}

function redactId(value) {
  return typeof value === "string" && value.length > 8 ? `…${value.slice(-8)}` : value ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replaceAll(RECIPIENT_EMAIL, "[recipient-email]")
    .replaceAll(INVITER_EMAIL, "[inviter-email]")
    .replace(/https?:\/\/[^\s]+[?&]token=[^\s&]+/gi, "[redacted-invite-url]");
}

async function findAuthUserByEmail(serviceClient, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  throw new Error("listUsers exceeded the bounded page limit");
}

async function requireSingle(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: no row returned`);
  return data;
}

async function writeResult(result) {
  mkdirSync(dirname(RESULT_PATH), { recursive: true });
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function main() {
  requireValue("VITE_SUPABASE_URL", supabaseUrl);
  requireValue("VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey);
  requireValue("SUPABASE_SERVICE_ROLE_KEY", serviceRole);
  requireValue("QA_TOM_CLIENT_ADMIN_A_PASSWORD", inviterPassword);

  if (supabaseUrl !== QA_PROJECT_URL) {
    throw new Error(`Refusing to run: target must be ${QA_PROJECT_URL}`);
  }
  if (!RECIPIENT_EMAIL.toLowerCase().startsWith("carl+tom-p11-qa-")) {
    throw new Error("Refusing to run: recipient email is outside the approved controlled alias");
  }

  const serviceClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = {
    run_tag: RUN_TAG,
    project_ref: QA_PROJECT_REF,
    scope: "contact -> invite-user -> accept_invitation_v2",
    recipient_email: "redacted-controlled-qa-alias",
    delivery_status: "not_observed",
    invitation: null,
    acceptance: null,
    materialization: null,
    cleanup: { attempted: false, complete: false, audit_rows_retained: true },
  };

  let recipientId = null;
  let contactId = null;
  let invitationId = null;
  let inviteUrl = null;
  let recipientPassword = null;
  let tenantId = null;
  const cleanupErrors = [];

  try {
    const tenant = await requireSingle(
      serviceClient.from("tenants").select("id").eq("slug", `${TOM_FIXTURE_TAG}_tenant_2`).maybeSingle(),
      "fixture tenant 2 lookup",
    );
    tenantId = tenant.id;

    const inviter = await findAuthUserByEmail(serviceClient, INVITER_EMAIL);
    if (!inviter) throw new Error("Approved Client Admin A persona was not found");

    const existingRecipient = await findAuthUserByEmail(serviceClient, RECIPIENT_EMAIL);
    if (existingRecipient) {
      throw new Error("Recipient alias already exists; refuse to reuse a prior run-scoped identity");
    }

    recipientPassword = `TOM-P11-${randomBytes(18).toString("base64url")}a1!`;
    const { data: recipientAuth, error: recipientError } = await serviceClient.auth.admin.createUser({
      email: RECIPIENT_EMAIL,
      password: recipientPassword,
      email_confirm: true,
      user_metadata: { qa_tom_p11_run_tag: RUN_TAG },
    });
    if (recipientError || !recipientAuth.user) {
      throw new Error(`recipient auth create: ${recipientError?.message ?? "no user returned"}`);
    }
    recipientId = recipientAuth.user.id;

    const { data: seededContact, error: contactError } = await serviceClient
      .from("tenant_contacts")
      .insert({
        tenant_id: tenantId,
        first_name: "TOM P1.1",
        last_name: RUN_TAG,
        email: RECIPIENT_EMAIL,
        status: "active",
        created_by: inviter.id,
      })
      .select("id")
      .single();
    if (contactError || !seededContact) {
      throw new Error(`contact seed: ${contactError?.message ?? "no contact returned"}`);
    }
    contactId = seededContact.id;

    const browser = await chromium.launch({ headless: true });
    try {
      const inviterContext = await browser.newContext({ storageState: STORAGE_STATE });
      const inviterPage = await inviterContext.newPage();
      const inviteResponsePromise = inviterPage.waitForResponse(
        (response) => response.url().includes("/functions/v1/invite-user") && response.request().method() === "POST",
        { timeout: 45_000 },
      );

      await inviterPage.goto(`${APP_URL}/client/users`, { waitUntil: "domcontentloaded" });
      await expect(inviterPage).not.toHaveURL(/\/login/);
      await expect(inviterPage.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();

      const contactEmail = inviterPage.getByText(RECIPIENT_EMAIL, { exact: true });
      await expect(contactEmail).toBeVisible();
      const contactRow = contactEmail.locator("xpath=../..");
      await contactRow.getByRole("button").click();
      await inviterPage.getByRole("menuitem", { name: "Promote to User", exact: true }).click();
      const promoteDialog = inviterPage.getByRole("dialog", { name: "Promote to User" });
      await expect(promoteDialog).toBeVisible();
      await promoteDialog.getByRole("button", { name: "Promote", exact: true }).click();

      const inviteResponse = await inviteResponsePromise;
      const inviteBody = await inviteResponse.json();
      if (!inviteResponse.ok() || !inviteBody?.ok || typeof inviteBody.inviteUrl !== "string") {
        throw new Error(`invite-user returned ${inviteResponse.status()} without a usable invitation URL`);
      }
      invitationId = inviteBody.invitation_id;
      inviteUrl = inviteBody.inviteUrl;
      if (!invitationId || !inviteUrl) throw new Error("invite-user response omitted invitation identity");
      result.invitation = { id: redactId(invitationId), writer_ok: true };

      await expect(inviterPage.getByText("Pending invitation", { exact: true })).toBeVisible();
      await inviterContext.close();

      const recipientContext = await browser.newContext();
      const recipientPage = await recipientContext.newPage();
      await recipientPage.goto(inviteUrl, { waitUntil: "domcontentloaded" });
      await expect(recipientPage.getByRole("heading", { name: "Complete Your Signup", level: 2 })).toBeVisible();
      await recipientPage.getByLabel("First Name").fill("TOM P1.1");
      await recipientPage.getByLabel("Last Name").fill("Recipient");
      await recipientPage.getByLabel("Password", { exact: true }).fill(recipientPassword);
      await recipientPage.getByLabel("Confirm Password", { exact: true }).fill(recipientPassword);
      await recipientPage.getByRole("button", { name: "Complete Signup", exact: true }).click();
      await recipientPage.waitForURL((url) => url.pathname === "/post-sign-in", { timeout: 45_000 });
      result.acceptance = { browser_flow: true, url_token_used: true };
      await recipientContext.close();
    } finally {
      await browser.close();
    }

    const invitation = await requireSingle(
      serviceClient
        .from("user_invitations")
        .select("id,status,accepted_at,used_at,mailgun_message_id,delivery_status")
        .eq("id", invitationId)
        .maybeSingle(),
      "accepted invitation lookup",
    );
    result.delivery_status = invitation.delivery_status ?? (invitation.mailgun_message_id ? "message_id_observed" : "not_observed");

    const [profile, tenantUser, tenantMember, contactState] = await Promise.all([
      requireSingle(serviceClient.from("users").select("user_uuid,email,unicorn_role,user_type").eq("user_uuid", recipientId).maybeSingle(), "materialized profile"),
      requireSingle(serviceClient.from("tenant_users").select("tenant_id,user_id,role,relationship_role,access_scope").eq("tenant_id", tenantId).eq("user_id", recipientId).maybeSingle(), "materialized tenant_users"),
      requireSingle(serviceClient.from("tenant_members").select("tenant_id,user_id,role,status").eq("tenant_id", tenantId).eq("user_id", recipientId).maybeSingle(), "materialized tenant_members"),
      requireSingle(serviceClient.from("tenant_contacts").select("id,status,promoted_to_user_id,promoted_at").eq("id", contactId).maybeSingle(), "promoted contact"),
    ]);

    if (invitation.status !== "accepted" || !invitation.accepted_at || !invitation.used_at) {
      throw new Error("Invitation did not reach the accepted/used state");
    }
    if (profile.user_uuid !== recipientId || tenantUser.relationship_role !== "user" || tenantMember.status !== "active") {
      throw new Error("Acceptance materialization did not match the approved user contract");
    }
    if (contactState.status !== "archived" || contactState.promoted_to_user_id !== recipientId || !contactState.promoted_at) {
      throw new Error("Matching contact was not archived and linked by acceptance");
    }
    result.materialization = {
      invitation_accepted: true,
      profile_created: true,
      tenant_user_created: true,
      tenant_member_created: true,
      contact_archived_and_linked: true,
      role: tenantUser.relationship_role,
      access_scope: tenantUser.access_scope,
    };

    const recipientClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await recipientClient.auth.signInWithPassword({
      email: RECIPIENT_EMAIL,
      password: recipientPassword,
    });
    if (signInError) throw new Error(`recipient retry sign-in: ${signInError.message}`);
    const { data: retryResult, error: retryError } = await recipientClient.rpc("accept_invitation_v2", {
      p_token_hash: await sha256(new URL(inviteUrl).searchParams.get("token") ?? ""),
      p_user_id: recipientId,
    });
    if (retryError || retryResult?.code !== "ALREADY_ACCEPTED") {
      throw new Error(`acceptance retry was not idempotent (${retryError?.message ?? retryResult?.code ?? "no result"})`);
    }
    result.acceptance.retry_code = retryResult.code;
  } finally {
    result.cleanup.attempted = true;
    if (tenantId && recipientId) {
      const { error } = await serviceClient.from("tenant_members").delete().eq("tenant_id", tenantId).eq("user_id", recipientId);
      if (error) cleanupErrors.push(`tenant_members: ${error.message}`);
      const { error: tenantUsersError } = await serviceClient.from("tenant_users").delete().eq("tenant_id", tenantId).eq("user_id", recipientId);
      if (tenantUsersError) cleanupErrors.push(`tenant_users: ${tenantUsersError.message}`);
    }
    if (recipientId) {
      const { error } = await serviceClient.from("users").delete().eq("user_uuid", recipientId);
      if (error) cleanupErrors.push(`users: ${error.message}`);
      const { error: authError } = await serviceClient.auth.admin.deleteUser(recipientId);
      if (authError) cleanupErrors.push(`auth.users: ${authError.message}`);
    }
    if (contactId) {
      const { error } = await serviceClient.from("tenant_contacts").delete().eq("id", contactId);
      if (error) cleanupErrors.push(`tenant_contacts: ${error.message}`);
    }
    if (invitationId) {
      const { error } = await serviceClient.from("user_invitations").delete().eq("id", invitationId);
      if (error) cleanupErrors.push(`user_invitations: ${error.message}`);
    }
    result.cleanup.complete = cleanupErrors.length === 0;
    result.cleanup.errors = cleanupErrors;
    await writeResult(result);
  }

  if (cleanupErrors.length > 0) throw new Error(`QA cleanup incomplete: ${cleanupErrors.join("; ")}`);
  console.log(JSON.stringify({ ...result, recipient_email: "redacted-controlled-qa-alias" }));
}

main().catch(async (error) => {
  const failure = { ok: false, error: safeError(error) };
  try {
    mkdirSync(dirname(RESULT_PATH), { recursive: true });
    writeFileSync(RESULT_PATH, `${JSON.stringify(failure, null, 2)}\n`, "utf8");
  } catch {
    // Preserve the original failure if artifact writing is unavailable.
  }
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
});
