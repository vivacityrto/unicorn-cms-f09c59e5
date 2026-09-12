#!/usr/bin/env node

/**
 * Read-only ghost-to-contact classification report.
 *
 * This script never inserts, updates, deletes, sends invitations, or invokes
 * a mutation RPC. It reads the auth-state view plus the two membership ledgers,
 * contacts, and invitations, then applies the rules in TOM P1.2-a.
 *
 * Default target: unicorn-qa. Production requires the explicit
 * --allow-production-read-only flag and is still read-only.
 *
 * Usage:
 *   VITE_SUPABASE_URL=https://qfpxvumcrnzrjyvqkicq.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/ghost-contact-dry-run.mjs [--json] [--out <file>]
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const QA_PROJECT_URL = "https://qfpxvumcrnzrjyvqkicq.supabase.co";
export const PRODUCTION_PROJECT_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PENDING_INVITATION_STATUSES = new Set(["pending", "sent"]);

export function normalizeEmail(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function isUsableEmail(value) {
  return Boolean(value && EMAIL_PATTERN.test(value));
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const tenant = String(a.tenant_id ?? "").localeCompare(String(b.tenant_id ?? ""));
    if (tenant !== 0) return tenant;
    const email = String(a.normalized_email ?? "").localeCompare(String(b.normalized_email ?? ""));
    if (email !== 0) return email;
    return String(a.source_user_uuid ?? "").localeCompare(String(b.source_user_uuid ?? ""));
  });
}

function sourceRowsFor(rows, userId, tenantId) {
  return rows.filter((row) => row.user_id === userId && row.tenant_id === tenantId);
}

function activeContactMatch(contacts, tenantId, email) {
  return contacts.find((contact) => (
    contact.tenant_id === tenantId &&
    String(contact.status).toLowerCase() === "active" &&
    normalizeEmail(contact.email) === email
  )) ?? null;
}

function pendingInvitationMatch(invitations, tenantId, email, snapshotAt) {
  return invitations.find((invitation) => {
    const expiresAt = invitation.expires_at ? new Date(invitation.expires_at) : null;
    return invitation.tenant_id === tenantId &&
      PENDING_INVITATION_STATUSES.has(String(invitation.status).toLowerCase()) &&
      normalizeEmail(invitation.email) === email &&
      !invitation.revoked_at &&
      !invitation.accepted_at &&
      !invitation.used_at &&
      expiresAt && !Number.isNaN(expiresAt.valueOf()) && expiresAt > snapshotAt;
  }) ?? null;
}

function hasConflictingIdentity(rows) {
  const identities = unique(rows.map((row) => `${row.first_name ?? ""}\u0000${row.last_name ?? ""}`));
  return identities.length > 1;
}

function buildRow({ ghostRows, tenantId, tenantUsers, tenantMembers, contacts, invitations, snapshotAt }) {
  const sourceIds = unique(ghostRows.map((ghost) => ghost.user_uuid));
  const sourceUser = ghostRows[0] ?? {};
  const normalizedEmail = normalizeEmail(sourceUser.email);
  const userRows = tenantUsers.flatMap((ghost) => sourceRowsFor(ghost.rows, ghost.user_uuid, tenantId));
  const memberRows = tenantMembers.flatMap((ghost) => sourceRowsFor(ghost.rows, ghost.user_uuid, tenantId));
  const existingContact = normalizedEmail ? activeContactMatch(contacts, tenantId, normalizedEmail) : null;
  const pendingInvitation = normalizedEmail
    ? pendingInvitationMatch(invitations, tenantId, normalizedEmail, snapshotAt)
    : null;

  let disposition = "candidate";
  let expectedFutureAction = "project_contact";
  let reason = null;

  if (!tenantId) {
    disposition = "quarantine_no_tenant";
    expectedFutureAction = "manual_review";
    reason = "No membership-derived tenant association";
  } else if (!normalizedEmail || !isUsableEmail(normalizedEmail)) {
    disposition = "quarantine_no_email";
    expectedFutureAction = "manual_review";
    reason = "Missing or malformed email; no inferred identity is permitted";
  } else if (sourceIds.length > 1 && hasConflictingIdentity(ghostRows)) {
    disposition = "quarantine_conflicting_source";
    expectedFutureAction = "manual_review";
    reason = "Multiple ghost profiles share a tenant/email but have conflicting identity fields";
  } else if (existingContact) {
    disposition = "already_contact";
    expectedFutureAction = "reconcile_existing_contact";
    reason = "An active contact already matches tenant and normalized email";
  } else if (pendingInvitation) {
    disposition = "pending_invite";
    expectedFutureAction = "retain_pending_state";
    reason = "A live pending invitation already matches tenant and normalized email";
  } else if (sourceIds.length > 1) {
    disposition = "collision";
    expectedFutureAction = "manual_review";
    reason = "Multiple ghost profiles share a tenant and normalized email";
  }

  return {
    disposition,
    expected_future_action: expectedFutureAction,
    collision_reason: disposition === "collision" ? reason : null,
    quarantine_reason: disposition.startsWith("quarantine_") ? reason : null,
    tenant_id: tenantId,
    source_user_uuid: sourceIds.length === 1 ? sourceIds[0] : null,
    source_user_uuids: sourceIds,
    normalized_email: normalizedEmail,
    first_name: sourceUser.first_name ?? null,
    last_name: sourceUser.last_name ?? null,
    phone: sourceUser.phone ?? sourceUser.mobile_phone ?? null,
    job_title: sourceUser.job_title ?? null,
    position_type: unique(userRows.map((row) => row.position_type))[0] ?? null,
    tenant_users_rows: userRows.map((row) => row.id).filter(Boolean),
    tenant_members_rows: memberRows.map((row) => row.id).filter(Boolean),
    source_roles: unique(userRows.map((row) => row.role)),
    source_relationship_roles: unique(userRows.map((row) => row.relationship_role)),
    source_statuses: unique(memberRows.map((row) => row.status)),
    source_access_scopes: unique(userRows.map((row) => row.access_scope)),
    existing_contact_id: existingContact?.id ?? null,
    existing_contact_status: existingContact?.status ?? null,
    existing_contact_promoted_to_user_id: existingContact?.promoted_to_user_id ?? null,
    pending_invitation_id: pendingInvitation?.id ?? null,
    pending_invitation_status: pendingInvitation?.status ?? null,
    pending_invitation_expires_at: pendingInvitation?.expires_at ?? null,
  };
}

export function classifyGhosts({ ghosts, tenantUsers, tenantMembers, contacts, invitations, snapshotAt = new Date() }) {
  const rows = [];
  const membershipByUser = new Map();

  for (const ghost of ghosts) {
    const userRows = tenantUsers.filter((row) => row.user_id === ghost.user_uuid);
    const memberRows = tenantMembers.filter((row) => row.user_id === ghost.user_uuid);
    const tenantIds = unique([...userRows, ...memberRows].map((row) => row.tenant_id));
    membershipByUser.set(ghost.user_uuid, tenantIds);

    if (tenantIds.length === 0) {
      rows.push(buildRow({
        ghostRows: [ghost],
        tenantId: null,
        tenantUsers: [{ user_uuid: ghost.user_uuid, rows: userRows }],
        tenantMembers: [{ user_uuid: ghost.user_uuid, rows: memberRows }],
        contacts,
        invitations,
        snapshotAt,
      }));
      continue;
    }

    for (const tenantId of tenantIds) {
      rows.push(buildRow({
        ghostRows: [ghost],
        tenantId,
        tenantUsers: [{ user_uuid: ghost.user_uuid, rows: userRows }],
        tenantMembers: [{ user_uuid: ghost.user_uuid, rows: memberRows }],
        contacts,
        invitations,
        snapshotAt,
      }));
    }
  }

  const grouped = new Map();
  for (const row of rows.filter((row) => row.tenant_id && row.normalized_email)) {
    const key = `${row.tenant_id}\u0000${row.normalized_email}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    const sourceIds = unique(group.flatMap((row) => row.source_user_uuids));
    for (const row of group) {
      row.source_user_uuids = sourceIds;
      row.source_user_uuid = sourceIds.length === 1 ? sourceIds[0] : null;
      if (sourceIds.length > 1 && row.disposition === "candidate") {
        row.disposition = "collision";
        row.expected_future_action = "manual_review";
        row.collision_reason = "Multiple ghost profiles share a tenant and normalized email";
      }
    }
  }

  const sorted = sortRows(rows);
  const candidateRows = sorted.filter((row) => row.tenant_id !== null);
  return {
    generated_at: new Date().toISOString(),
    snapshot_at: snapshotAt.toISOString(),
    scope: "TOM P1.2-a read-only ghost-to-contact classification",
    read_only: true,
    writes_performed: 0,
    rows: sorted,
    counts: {
      total_ghost_profiles: ghosts.length,
      membership_bearing_profiles: [...membershipByUser.values()].filter((ids) => ids.length > 0).length,
      membershipless_quarantine: [...membershipByUser.values()].filter((ids) => ids.length === 0).length,
      tenant_candidate_rows: candidateRows.length,
      eligible_candidates: candidateRows.filter((row) => row.disposition === "candidate").length,
      existing_contact_matches: candidateRows.filter((row) => row.disposition === "already_contact").length,
      pending_invite_matches: candidateRows.filter((row) => row.disposition === "pending_invite").length,
      collision_or_manual_rows: candidateRows.filter((row) => ["collision", "quarantine_conflicting_source"].includes(row.disposition)).length,
      projected_future_inserts: candidateRows.filter((row) => row.disposition === "candidate").length,
    },
    write_operations: [],
  };
}

function redactValue(value) {
  if (!value) return value;
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function redactReport(report) {
  return {
    ...report,
    rows: report.rows.map((row) => ({
      ...row,
      normalized_email: row.normalized_email ? `sha256:${redactValue(row.normalized_email)}` : null,
      first_name: row.first_name ? "[redacted]" : null,
      last_name: row.last_name ? "[redacted]" : null,
      phone: row.phone ? "[redacted]" : null,
      job_title: row.job_title ? "[redacted]" : null,
      source_user_uuid: row.source_user_uuid ? `sha256:${redactValue(row.source_user_uuid)}` : null,
      source_user_uuids: row.source_user_uuids.map((value) => `sha256:${redactValue(value)}`),
      existing_contact_id: row.existing_contact_id ? "[redacted]" : null,
      existing_contact_promoted_to_user_id: row.existing_contact_promoted_to_user_id ? "[redacted]" : null,
      pending_invitation_id: row.pending_invitation_id ? "[redacted]" : null,
    })),
  };
}

function parseArgs(argv) {
  const options = { json: false, out: null, includeIdentifiers: false, allowProductionReadOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--include-identifiers") options.includeIdentifiers = true;
    else if (arg === "--allow-production-read-only") options.allowProductionReadOnly = true;
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log("Read-only ghost-to-contact classification report");
  console.log("Usage: node scripts/ghost-contact-dry-run.mjs [--json] [--out <file>]");
  console.log("       [--include-identifiers] [--allow-production-read-only]");
}

function getConfiguration(options) {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL or SUPABASE_URL is required");
  if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required; the report does not accept browser credentials");
  if (supabaseUrl !== QA_PROJECT_URL && !(supabaseUrl === PRODUCTION_PROJECT_URL && options.allowProductionReadOnly)) {
    throw new Error(`Refusing target ${supabaseUrl}; use ${QA_PROJECT_URL}, or explicitly add --allow-production-read-only for the production read-only audit`);
  }
  return { supabaseUrl, serviceRole };
}

async function selectOrThrow(client, table, columns, query = () => {}) {
  let builder = client.from(table).select(columns);
  builder = query(builder) ?? builder;
  const { data, error } = await builder;
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return data ?? [];
}

async function loadSnapshot(client, snapshotAt) {
  const authStates = await selectOrThrow(
    client,
    "v_auth_user_state",
    "user_uuid, email, is_ghost",
    (query) => query.eq("is_ghost", true).not("user_uuid", "is", null),
  );
  const userIds = unique(authStates.map((row) => row.user_uuid));
  const userProfiles = userIds.length === 0 ? [] : await selectOrThrow(
    client,
    "users",
    "user_uuid, email, first_name, last_name, phone, mobile_phone, job_title",
    (query) => query.in("user_uuid", userIds),
  );
  const profilesById = new Map(userProfiles.map((profile) => [profile.user_uuid, profile]));
  const ghosts = authStates.filter((row) => row.user_uuid).map((row) => ({
    ...profilesById.get(row.user_uuid),
    user_uuid: row.user_uuid,
    email: profilesById.get(row.user_uuid)?.email ?? row.email,
  }));
  const tenantUsers = userIds.length === 0 ? [] : await selectOrThrow(
    client,
    "tenant_users",
    "id, tenant_id, user_id, role, relationship_role, primary_contact, secondary_contact, access_scope, position_type, created_at",
    (query) => query.in("user_id", userIds),
  );
  const tenantMembers = userIds.length === 0 ? [] : await selectOrThrow(
    client,
    "tenant_members",
    "id, tenant_id, user_id, role, status, invited_at, joined_at, created_at",
    (query) => query.in("user_id", userIds),
  );
  const tenantIds = unique([...tenantUsers, ...tenantMembers].map((row) => row.tenant_id));
  const contacts = tenantIds.length === 0 ? [] : await selectOrThrow(
    client,
    "tenant_contacts",
    "id, tenant_id, first_name, last_name, email, status, promoted_to_user_id, promoted_at, created_at",
    (query) => query.in("tenant_id", tenantIds),
  );
  const invitations = tenantIds.length === 0 ? [] : await selectOrThrow(
    client,
    "user_invitations",
    "id, tenant_id, email, status, expires_at, revoked_at, accepted_at, used_at, created_at",
    (query) => query.in("tenant_id", tenantIds),
  );

  const report = classifyGhosts({ ghosts, tenantUsers, tenantMembers, contacts, invitations, snapshotAt });
  report.target = client.supabaseUrl;
  report.source_commit = process.env.GHOST_CONTACT_SOURCE_COMMIT ?? null;
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  const config = getConfiguration(options);
  const client = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const report = await loadSnapshot(client, new Date());
  const renderedReport = options.includeIdentifiers ? report : redactReport(report);
  const rendered = options.json
    ? `${JSON.stringify(renderedReport, null, 2)}\n`
    : [
      "# Ghost-to-contact dry-run",
      "",
      `Generated: ${renderedReport.generated_at}`,
      `Target: ${renderedReport.target}`,
      `Read-only: ${renderedReport.read_only}`,
      "",
      "## Counts",
      "",
      ...Object.entries(renderedReport.counts).map(([key, value]) => `- ${key}: ${value}`),
      "",
      "No writes were performed.",
      "",
      "Use --json for the full row-level report and --include-identifiers only in a controlled, approved output location.",
      "",
    ].join("\n");
  if (options.out) writeFileSync(resolve(options.out), rendered);
  else process.stdout.write(rendered);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ghost-contact-dry-run: ${error.message}`);
    process.exitCode = 1;
  });
}
