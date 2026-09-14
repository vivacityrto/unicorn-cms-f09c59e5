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
const RECOVERY_RUN_TAG = process.env.QA_TOM_P11_RECOVERY_RUN_TAG ?? "";
const RECIPIENT_EMAIL =
  process.env.QA_TOM_P11_RECIPIENT_EMAIL ||
  `carl+tom-p11-qa-${process.env.GITHUB_RUN_ID ?? Date.now()}@complyhub.ai`;
const STORAGE_STATE = process.env.QA_TOM_P11_STORAGE_STATE ?? "playwright/.auth/tom-p11-client-primary-inviter.json";
const RESULT_PATH = process.env.QA_TOM_P11_RESULT_PATH ?? "qa-artifacts/tom-p11-result.json";
const TOM_FIXTURE_TAG = process.env.QA_TOM_FIXTURE_TAG ?? "tom_qa_20260913_seed_01";
const INVITER_EMAIL = `${TOM_FIXTURE_TAG}_client_primary_inviter@example.qa`;

const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const inviterPassword = process.env.QA_TOM_CLIENT_PRIMARY_INVITER_PASSWORD ?? process.env.QA_TOM_CLIENT_ADMIN_A_PASSWORD ?? "";

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

async function reportBrowserState(page, label) {
  const bodyText = await page.locator("body").innerText().catch(() => "[body unavailable]");
  console.error(
    JSON.stringify({
      browser_diagnostic: {
        label,
        url: page.url(),
        title: await page.title().catch(() => "[title unavailable]"),
        body: safeError(bodyText).slice(0, 4000),
      },
    }),
  );
}

async function recoverFailedRun(serviceClient, tenantId, inviterId, recipient) {
  if (!RECOVERY_RUN_TAG) {
    throw new Error("Recipient alias already exists; refuse to reuse a prior run-scoped identity");
  }
  const { data: contacts, error: contactsError } = await serviceClient
    .from("tenant_contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("created_by", inviterId)
    .eq("email", RECIPIENT_EMAIL)
    .eq("first_name", "TOM P1.1")
    .eq("last_name", RECOVERY_RUN_TAG);
  if (contactsError) throw new Error(`recovery contact lookup: ${contactsError.message}`);

  const { data: invitations, error: invitationsError } = await serviceClient
    .from("user_invitations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("invited_by", inviterId)
    .eq("email", RECIPIENT_EMAIL)
    .eq("first_name", "TOM P1.1")
    .eq("last_name", RECOVERY_RUN_TAG);
  if (invitationsError) throw new Error(`recovery invitation lookup: ${invitationsError.message}`);

  const hasScopedRows = (contacts?.length ?? 0) > 0 || (invitations?.length ?? 0) > 0;
  let hasOrphanAuthOnly = false;
  if (recipient && !hasScopedRows) {
    const [profileResult, tenantUsersResult, tenantMembersResult] = await Promise.all([
      serviceClient.from("users").select("user_uuid").eq("user_uuid", recipient.id).limit(1),
      serviceClient.from("tenant_users").select("user_id").eq("user_id", recipient.id).limit(1),
      serviceClient.from("tenant_members").select("user_id").eq("user_id", recipient.id).limit(1),
    ]);
    if (profileResult.error) throw new Error(`recovery profile lookup: ${profileResult.error.message}`);
    if (tenantUsersResult.error) throw new Error(`recovery tenant_users lookup: ${tenantUsersResult.error.message}`);
    if (tenantMembersResult.error) throw new Error(`recovery tenant_members lookup: ${tenantMembersResult.error.message}`);
    hasOrphanAuthOnly =
      (profileResult.data?.length ?? 0) === 0 &&
      (tenantUsersResult.data?.length ?? 0) === 0 &&
      (tenantMembersResult.data?.length ?? 0) === 0;
  }
  if (recipient && recipient.user_metadata?.qa_tom_p11_run_tag !== RECOVERY_RUN_TAG && !hasScopedRows && !hasOrphanAuthOnly) {
    throw new Error("Recipient alias already exists; refuse to reuse a prior run-scoped identity");
  }

  const errors = [];
  if (recipient) {
    const { error: memberError } = await serviceClient
      .from("tenant_members")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", recipient.id);
    if (memberError) errors.push(`tenant_members: ${memberError.message}`);
    const { error: tenantUserError } = await serviceClient
      .from("tenant_users")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", recipient.id);
    if (tenantUserError) errors.push(`tenant_users: ${tenantUserError.message}`);
    const { error: profileError } = await serviceClient.from("users").delete().eq("user_uuid", recipient.id);
    if (profileError) errors.push(`users: ${profileError.message}`);
    const { error: authError } = await serviceClient.auth.admin.deleteUser(recipient.id);
    if (authError) errors.push(`auth.users: ${authError.message}`);
  }
  for (const contact of contacts ?? []) {
    const { error } = await serviceClient.from("tenant_contacts").delete().eq("id", contact.id);
    if (error) errors.push(`tenant_contacts: ${error.message}`);
  }
  for (const invitation of invitations ?? []) {
    const { error } = await serviceClient.from("user_invitations").delete().eq("id", invitation.id);
    if (error) errors.push(`user_invitations: ${error.message}`);
  }
  if (errors.length > 0) throw new Error(`failed-run recovery incomplete: ${errors.join("; ")}`);
}

async function main() {
  requireValue("VITE_SUPABASE_URL", supabaseUrl);
  requireValue("VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey);
  requireValue("SUPABASE_SERVICE_ROLE_KEY", serviceRole);
  requireValue("QA_TOM_CLIENT_PRIMARY_INVITER_PASSWORD", inviterPassword);

  if (supabaseUrl !== QA_PROJECT_URL) {
    throw new Error(`Refusing to run: target must be ${QA_PROJECT_URL}`);
  }
  if (!RECIPIENT_EMAIL.toLowerCase().startsWith("carl+tom-p11-qa-")) {
    throw new Error("Refusing to run: recipient email is outside the approved controlled alias");
  }

  const serviceClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const uiExpect = expect.configure({ timeout: 45_000 });

  const result = {
    run_tag: RUN_TAG,
    project_ref: QA_PROJECT_REF,
    scope: "contact -> invite-user -> accept_invitation_v2",
    recipient_email: "redacted-controlled-qa-alias",
    delivery_status: "not_observed",
    invitation: null,
    acceptance: null,
    materialization: null,
    cleanup: {
      attempted: false,
      complete: false,
      audit_rows_retained: true,
      auth_user_retained_for_audit: false,
    },
  };

  let recipientId = null;
  let contactId = null;
  let invitationId = null;
  let inviteUrl = null;
  let recipientPassword = null;
  let tenantId = null;
  let inviterId = null;
  const cleanupErrors = [];

  try {
    const tenant = await requireSingle(
      serviceClient.from("tenants").select("id").eq("slug", `${TOM_FIXTURE_TAG}_tenant_2`).maybeSingle(),
      "fixture tenant 2 lookup",
    );
    tenantId = tenant.id;

    const inviter = await findAuthUserByEmail(serviceClient, INVITER_EMAIL);
    if (!inviter) throw new Error("Approved Client Admin A persona was not found");
    inviterId = inviter.id;

    const existingRecipient = await findAuthUserByEmail(serviceClient, RECIPIENT_EMAIL);
    if (existingRecipient || RECOVERY_RUN_TAG) {
      await recoverFailedRun(serviceClient, tenantId, inviter.id, existingRecipient);
    }

    recipientPassword = `TOM-P11-${randomBytes(18).toString("base64url")}a1!`;

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
      const browserEvents = [];
      inviterPage.on("request", (request) => {
        if (request.url().includes("/functions/v1/invite-user")) {
          browserEvents.push({ event: "request", method: request.method(), url: request.url() });
        }
      });
      inviterPage.on("response", (response) => {
        if (response.url().includes("/functions/v1/invite-user")) {
          browserEvents.push({ event: "response", status: response.status(), url: response.url() });
        }
      });
      inviterPage.on("requestfailed", (request) => {
        if (request.url().includes("/functions/v1/invite-user")) {
          browserEvents.push({ event: "requestfailed", failure: request.failure()?.errorText ?? "unknown" });
        }
      });
      inviterPage.on("pageerror", (error) => {
        browserEvents.push({ event: "pageerror", message: error.message.slice(0, 1000) });
      });

      await inviterPage.goto(`${APP_URL}/client/users`, { waitUntil: "domcontentloaded" });
      await uiExpect(inviterPage).not.toHaveURL(/\/login/);
      try {
        await uiExpect(inviterPage.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
      } catch (error) {
        await reportBrowserState(inviterPage, "inviter-users-page");
        throw error;
      }

      const contactEmail = inviterPage.getByText(RECIPIENT_EMAIL, { exact: true });
      await uiExpect(contactEmail).toBeVisible();
      const contactRow = contactEmail.locator("xpath=../..");
      await contactRow.getByRole("button").click();
      await inviterPage.getByRole("menuitem", { name: "Promote to User", exact: true }).click();
      const promoteDialog = inviterPage.getByRole("dialog", { name: "Promote to User" });
      await uiExpect(promoteDialog).toBeVisible();
      const inviteResponsePromise = inviterPage.waitForResponse(
        (response) => response.url().includes("/functions/v1/invite-user") && response.request().method() === "POST",
        { timeout: 45_000 },
      );
      let inviteResponse;
      try {
        await promoteDialog.getByRole("button", { name: "Promote", exact: true }).click();
        inviteResponse = await inviteResponsePromise;
      } catch (error) {
        await inviteResponsePromise.catch(() => undefined);
        await reportBrowserState(inviterPage, "invite-user-timeout");
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${detail}; browser_events=${JSON.stringify(browserEvents).slice(0, 4000)}`);
      }
      const inviteBody = await inviteResponse.json();
      if (!inviteResponse.ok() || !inviteBody?.ok || typeof inviteBody.inviteUrl !== "string") {
        throw new Error(`invite-user returned ${inviteResponse.status()} without a usable invitation URL`);
      }
      invitationId = inviteBody.invitation_id;
      inviteUrl = inviteBody.inviteUrl;
      if (!invitationId || !inviteUrl) throw new Error("invite-user response omitted invitation identity");
      result.invitation = { id: redactId(invitationId), writer_ok: true };

      await uiExpect(inviterPage.getByText("Pending invitation", { exact: true })).toBeVisible();
      await inviterContext.close();

      const recipientContext = await browser.newContext();
      const recipientPage = await recipientContext.newPage();
      await recipientPage.goto(inviteUrl, { waitUntil: "domcontentloaded" });
      await uiExpect(recipientPage.getByRole("heading", { name: "Complete Your Signup", level: 2 })).toBeVisible();
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

    const recipient = await findAuthUserByEmail(serviceClient, RECIPIENT_EMAIL);
    if (!recipient) throw new Error("accepted recipient auth user was not created");
    recipientId = recipient.id;

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

    if (invitation.status !== "accepted" || !invitation.accepted_at) {
      throw new Error("Invitation did not reach the accepted state");
    }
    if (profile.user_uuid !== recipientId || tenantUser.relationship_role !== "user" || tenantMember.status !== "active") {
      throw new Error("Acceptance materialization did not match the approved user contract");
    }
    if (contactState.status !== "archived" || contactState.promoted_to_user_id !== recipientId || !contactState.promoted_at) {
      throw new Error("Matching contact was not archived and linked by acceptance");
    }
    result.materialization = {
      invitation_accepted: true,
      invitation_used_at_observed: Boolean(invitation.used_at),
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
    if (!recipientId && tenantId && inviterId) {
      try {
        const orphanRecipient = await findAuthUserByEmail(serviceClient, RECIPIENT_EMAIL);
        const { data: scopedContacts, error: scopedContactError } = await serviceClient
          .from("tenant_contacts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("created_by", inviterId)
          .eq("email", RECIPIENT_EMAIL)
          .eq("first_name", "TOM P1.1")
          .in("last_name", [RUN_TAG, RECOVERY_RUN_TAG].filter(Boolean));
        if (scopedContactError) throw new Error(scopedContactError.message);
        if (orphanRecipient && (scopedContacts?.length ?? 0) > 0) recipientId = orphanRecipient.id;
      } catch (error) {
        cleanupErrors.push(`orphan recipient lookup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (tenantId && recipientId) {
      const { error } = await serviceClient.from("tenant_members").delete().eq("tenant_id", tenantId).eq("user_id", recipientId);
      if (error) cleanupErrors.push(`tenant_members: ${error.message}`);
      const { error: tenantUsersError } = await serviceClient.from("tenant_users").delete().eq("tenant_id", tenantId).eq("user_id", recipientId);
      if (tenantUsersError) cleanupErrors.push(`tenant_users: ${tenantUsersError.message}`);
    }
    if (recipientId) {
      const { error } = await serviceClient.from("users").delete().eq("user_uuid", recipientId);
      if (error) cleanupErrors.push(`users: ${error.message}`);
      const { data: auditRows, error: auditLookupError } = await serviceClient
        .from("audit_eos_events")
        .select("id")
        .eq("user_id", recipientId)
        .limit(1);
      if (auditLookupError) {
        cleanupErrors.push(`audit_eos_events lookup: ${auditLookupError.message}`);
      } else if (auditRows?.length) {
        result.cleanup.auth_user_retained_for_audit = true;
      } else {
        const { error: authError } = await serviceClient.auth.admin.deleteUser(recipientId);
        if (authError) cleanupErrors.push(`auth.users: ${authError.message}`);
      }
    }
    if (contactId) {
      const { error } = await serviceClient.from("tenant_contacts").delete().eq("id", contactId);
      if (error) cleanupErrors.push(`tenant_contacts: ${error.message}`);
    }
    const cleanupInvitationLastNames = [...new Set([RUN_TAG, RECOVERY_RUN_TAG].filter(Boolean))];
    if (tenantId && inviterId && cleanupInvitationLastNames.length > 0) {
      const { data: runScopedInvitations, error: invitationLookupError } = await serviceClient
        .from("user_invitations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("invited_by", inviterId)
        .eq("email", RECIPIENT_EMAIL)
        .eq("first_name", "TOM P1.1")
        .in("last_name", cleanupInvitationLastNames);
      if (invitationLookupError) {
        cleanupErrors.push(`user_invitations lookup: ${invitationLookupError.message}`);
      } else {
        for (const invitation of runScopedInvitations ?? []) {
          const { error } = await serviceClient.from("user_invitations").delete().eq("id", invitation.id);
          if (error) cleanupErrors.push(`user_invitations: ${error.message}`);
        }
      }
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
