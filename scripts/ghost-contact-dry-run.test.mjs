import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGhosts,
  isUsableEmail,
  normalizeEmail,
  redactReport,
} from "./ghost-contact-dry-run.mjs";

const snapshotAt = new Date("2026-09-12T00:00:00.000Z");

function ghost(user_uuid, email = "person@example.com", first_name = "Person", last_name = "Example") {
  return { user_uuid, email, first_name, last_name, phone: null, mobile_phone: null, job_title: null };
}

function membership(user_id, tenant_id) {
  return { id: `${user_id}-${tenant_id}`, user_id, tenant_id, role: "parent", relationship_role: "primary_contact", access_scope: "full", position_type: null };
}

test("normalizes email and rejects unusable values", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normalizeEmail(""), null);
  assert.equal(isUsableEmail("person@example.com"), true);
  assert.equal(isUsableEmail("person@example"), false);
});

test("classifies a membership-bearing ghost as a candidate", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [{ ...membership("ghost-1", 42), role: "Admin", status: "active", invited_at: null, joined_at: null }],
    contacts: [],
    invitations: [],
    snapshotAt,
  });
  assert.equal(report.counts.eligible_candidates, 1);
  assert.equal(report.rows[0].disposition, "candidate");
  assert.equal(report.rows[0].tenant_id, 42);
  assert.equal(report.writes_performed, 0);
  assert.match(report.run_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("emits one candidate row per tenant for a multi-tenant ghost", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42), membership("ghost-1", 43)],
    tenantMembers: [],
    contacts: [],
    invitations: [],
    snapshotAt,
  });
  assert.deepEqual(report.rows.map((row) => row.tenant_id), [42, 43]);
});

test("quarantines a membershipless ghost", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [],
    tenantMembers: [],
    contacts: [],
    invitations: [],
    snapshotAt,
  });
  assert.equal(report.rows[0].disposition, "quarantine_no_tenant");
  assert.equal(report.counts.membershipless_quarantine, 1);
  assert.equal(report.counts.projected_future_inserts, 0);
});

test("quarantines a membership-bearing ghost with a malformed email", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1", "not-an-email")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [],
    contacts: [],
    invitations: [],
    snapshotAt,
  });
  assert.equal(report.rows[0].disposition, "quarantine_no_email");
  assert.equal(report.rows[0].expected_future_action, "manual_review");
  assert.equal(report.counts.eligible_candidates, 0);
  assert.equal(report.counts.projected_future_inserts, 0);
  assert.equal(report.writes_performed, 0);
  assert.deepEqual(report.write_operations, []);
});

test("holds an existing active contact instead of projecting a duplicate", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [],
    contacts: [{ id: 7, tenant_id: 42, email: "PERSON@example.com", status: "active", promoted_to_user_id: null }],
    invitations: [],
    snapshotAt,
  });
  assert.equal(report.rows[0].disposition, "already_contact");
  assert.equal(report.counts.projected_future_inserts, 0);
});

test("does not treat an archived contact as an active match", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [],
    contacts: [{ id: 7, tenant_id: 42, email: "PERSON@example.com", status: "archived", promoted_to_user_id: null }],
    invitations: [],
    snapshotAt,
  });
  assert.equal(report.rows[0].disposition, "candidate");
  assert.equal(report.counts.eligible_candidates, 1);
  assert.equal(report.counts.existing_contact_matches, 0);
  assert.equal(report.writes_performed, 0);
});

test("preserves a live pending invitation without creating a duplicate", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [],
    contacts: [],
    invitations: [{ id: "invite-1", tenant_id: 42, email: "person@example.com", status: "pending", expires_at: "2026-09-13T00:00:00.000Z", revoked_at: null, accepted_at: null, used_at: null }],
    snapshotAt,
  });
  assert.equal(report.rows[0].disposition, "pending_invite");
  assert.equal(report.counts.pending_invite_matches, 1);
  assert.equal(report.counts.projected_future_inserts, 0);
});

test("does not preserve an expired invitation as pending", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [],
    contacts: [],
    invitations: [{ id: "invite-1", tenant_id: 42, email: "person@example.com", status: "pending", expires_at: "2026-09-11T00:00:00.000Z", revoked_at: null, accepted_at: null, used_at: null }],
    snapshotAt,
  });
  assert.equal(report.rows[0].disposition, "candidate");
  assert.equal(report.counts.pending_invite_matches, 0);
  assert.equal(report.counts.eligible_candidates, 1);
  assert.equal(report.writes_performed, 0);
});

test("holds duplicate ghost profiles sharing a tenant/email", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1"), ghost("ghost-2")],
    tenantUsers: [membership("ghost-1", 42), membership("ghost-2", 42)],
    tenantMembers: [],
    contacts: [],
    invitations: [],
    snapshotAt,
  });
  assert.deepEqual(report.rows.map((row) => row.disposition), ["collision", "collision"]);
  assert.equal(report.counts.collision_or_manual_rows, 2);
  assert.equal(report.counts.projected_future_inserts, 0);
  assert.equal(report.writes_performed, 0);
  assert.deepEqual(report.write_operations, []);
});

test("redacts identity and contact values without changing the zero-write contract", () => {
  const report = classifyGhosts({
    ghosts: [ghost("ghost-1")],
    tenantUsers: [membership("ghost-1", 42)],
    tenantMembers: [],
    contacts: [{ id: 7, tenant_id: 42, email: "PERSON@example.com", status: "active", promoted_to_user_id: "user-7" }],
    invitations: [],
    snapshotAt,
  });
  const redacted = redactReport(report);
  const row = redacted.rows[0];
  assert.match(row.tenant_id, /^sha256:[0-9a-f]{12}$/);
  assert.notEqual(row.tenant_id, 42);
  assert.match(row.normalized_email, /^sha256:[0-9a-f]{12}$/);
  assert.notEqual(row.normalized_email, "person@example.com");
  assert.equal(row.first_name, "[redacted]");
  assert.equal(row.last_name, "[redacted]");
  assert.match(row.source_user_uuid, /^sha256:[0-9a-f]{12}$/);
  assert.notEqual(row.source_user_uuid, "ghost-1");
  assert.equal(row.tenant_users_rows.length, 1);
  assert.match(row.tenant_users_rows[0], /^sha256:[0-9a-f]{12}$/);
  assert.notEqual(row.tenant_users_rows[0], "ghost-1-42");
  assert.deepEqual(row.tenant_members_rows, []);
  assert.equal(row.existing_contact_id, "[redacted]");
  assert.equal(row.existing_contact_promoted_to_user_id, "[redacted]");
  assert.doesNotMatch(JSON.stringify(redacted), /PERSON@example\.com|ghost-1|ghost-1-42|user-7|\"tenant_id\":42/);
  assert.equal(redacted.writes_performed, 0);
  assert.deepEqual(redacted.write_operations, []);
});
