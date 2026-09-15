import test from "node:test";
import assert from "node:assert/strict";
import {
  QA_PROJECT_URL,
  buildManifest,
  generateBatchApplySql,
  generateBatchPostflightSql,
  generateApplySql,
  validateBatchContract,
  validateReport,
} from "./ghost-contact-apply.mjs";

const sourceUuid = "11111111-1111-7111-8111-111111111111";
const reportRunId = "22222222-2222-4222-8222-222222222222";
const sourceCommit = "a".repeat(40);

function report(overrides = {}) {
  return {
    run_id: reportRunId,
    generated_at: "2026-09-15T00:00:00.000Z",
    snapshot_at: "2026-09-15T00:00:00.000Z",
    target: QA_PROJECT_URL,
    source_commit: sourceCommit,
    read_only: true,
    writes_performed: 0,
    write_operations: [],
    counts: { eligible_candidates: 1 },
    rows: [{
      disposition: "candidate",
      expected_future_action: "project_contact",
      tenant_id: 42,
      source_user_uuid: sourceUuid,
      source_user_uuids: [sourceUuid],
      normalized_email: "person@example.com",
      first_name: "Person",
      last_name: "Example",
      phone: null,
      job_title: "Director",
      position_type: null,
      tenant_users_rows: [101],
      tenant_members_rows: [202],
      source_roles: ["parent"],
      source_relationship_roles: ["primary_contact"],
      source_statuses: ["active"],
      source_access_scopes: ["full"],
      existing_contact_id: null,
      pending_invitation_id: null,
    }],
    ...overrides,
  };
}

test("builds a deterministic private manifest and selected fingerprint", () => {
  const first = buildManifest(report());
  const second = buildManifest(report());
  assert.equal(first.manifest_hash, second.manifest_hash);
  assert.equal(first.selected_row_index, 0);
  assert.equal(first.candidate_count, 1);
  assert.match(first.selected_candidate_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(first.rows[0].normalized_email, "person@example.com");
});

test("rejects the redacted report shape before any SQL can be generated", () => {
  const redacted = report({
    rows: [{ ...report().rows[0], tenant_id: "sha256:abc", source_user_uuid: "sha256:def", source_user_uuids: ["sha256:def"] }],
  });
  assert.throws(() => validateReport(redacted), /tenant_id/);
});

test("rejects a non-QA target, a changed commit, and a holdout row", () => {
  assert.throws(() => validateReport(report({ target: "https://yxkgdalkbrriasiyyrwk.supabase.co" })), /allowlisted QA/);
  assert.throws(() => validateReport(report(), { expectedCommit: "b".repeat(40) }), /source commit/);
  assert.throws(() => validateReport(report({ rows: [{ ...report().rows[0], disposition: "collision" }] })), /eligible candidate/);
});

test("generates only the approved contact and audit inserts", () => {
  const manifest = buildManifest(report());
  const sql = generateApplySql(manifest);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /INSERT INTO public\.tenant_contacts/);
  assert.match(sql, /INSERT INTO public\.audit_eos_events/);
  assert.match(sql, /TOM_APPLY_RESULT:/);
  assert.doesNotMatch(sql, /INSERT INTO (?:public\.)?(?:auth\.users|users|tenant_users|tenant_members|user_invitations)/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:public\.)?(?:users|tenant_users|tenant_members|user_invitations)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+(?:public\.)?(?:users|tenant_users|tenant_members|user_invitations)/i);
  assert.match(sql, /outside_scope_writes', 0/);
});

test("enforces the approved 5/5/4 batch sequence", () => {
  const baseRow = report().rows[0];
  const rows = Array.from({ length: 14 }, (_, index) => {
    const uuid = `00000000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      ...baseRow,
      tenant_id: 100 + index,
      source_user_uuid: uuid,
      source_user_uuids: [uuid],
      normalized_email: `person${index}@example.com`,
      tenant_users_rows: [101 + index],
      tenant_members_rows: [201 + index],
    };
  });
  const batchReport = report({ rows, counts: { eligible_candidates: 14 } });
  assert.doesNotThrow(() => validateBatchContract(batchReport, { batchNumber: 1, batchSize: 5 }));
  assert.throws(() => validateBatchContract(batchReport, { batchNumber: 2, batchSize: 5 }), /expected 9/);
  assert.throws(() => validateBatchContract(batchReport, { batchNumber: 1, batchSize: 4 }), /exactly 5/);
});

test("generates one atomic bounded batch and matching redacted postflight", () => {
  const baseRow = report().rows[0];
  const rows = [0, 1, 2, 3, 4].map((index) => {
    const uuid = `00000000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`;
    return { ...baseRow, tenant_id: 100 + index, source_user_uuid: uuid, source_user_uuids: [uuid], normalized_email: `person${index}@example.com`, tenant_users_rows: [101 + index], tenant_members_rows: [201 + index] };
  });
  const manifest = buildManifest(report({ rows, counts: { eligible_candidates: 5 } }));
  const batchId = "33333333-3333-4333-8333-333333333333";
  const sql = generateBatchApplySql(manifest, { selectedRowIndices: [0, 1, 2, 3, 4], batchId });
  assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
  assert.equal((sql.match(/INSERT INTO public\.tenant_contacts/g) ?? []).length, 5);
  assert.match(sql, /TOM_APPLY_BATCH_RESULT:/);
  assert.doesNotMatch(sql, /TOM_APPLY_RESULT:/);
  assert.match(sql, /tom_apply_manifest_0/);
  assert.match(sql, /tom_apply_result_4/);
  const postflight = generateBatchPostflightSql(manifest, batchId, { selectedRowIndices: [0, 1, 2, 3, 4] });
  assert.match(postflight, /TOM_POSTFLIGHT_BATCH_RESULT:/);
  assert.match(postflight, /'expected_rows'/);
  assert.doesNotMatch(postflight, /source_user_uuid.*person@example/);
});

test("requires explicit canary mode and a private SQL destination", async () => {
  const { main } = await import("./ghost-contact-apply.mjs");
  await assert.rejects(() => main(["--report", "missing.json"]), /--canary is required/);
});
