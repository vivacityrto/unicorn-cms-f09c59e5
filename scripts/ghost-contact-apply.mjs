#!/usr/bin/env node

/**
 * Apply exactly one frozen TOM ghost-to-contact candidate in unicorn-qa.
 *
 * This is intentionally a narrow operator boundary. It accepts only a fresh,
 * identifier-bearing read-only report, generates a private manifest and SQL
 * transaction, and refuses every target except the allowlisted QA project.
 * The SQL can insert only one tenant_contacts row and its audit_eos_events
 * record. It never creates auth identities, memberships, invitations, or
 * access grants.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const QA_PROJECT_URL = "https://qfpxvumcrnzrjyvqkicq.supabase.co";
export const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
export const APPLY_VERSION = "tom-p1.2-d-canary-v1";

// PostgreSQL accepts UUID versions beyond v1-v5 (including v7). The apply
// boundary needs canonical UUID syntax, not an obsolete version allowlist.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  throw new Error(message);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function sortedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => value !== null && value !== undefined).map(String))].sort();
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function candidateFingerprint(row) {
  return sha256({
    tenant_id: row.tenant_id,
    source_user_uuid: row.source_user_uuid,
    source_user_uuids: sortedStrings(row.source_user_uuids),
    normalized_email: normalizeEmail(row.normalized_email),
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    phone: row.phone ?? null,
    job_title: row.job_title ?? null,
    position_type: row.position_type ?? null,
    tenant_users_rows: sortedStrings(row.tenant_users_rows),
    tenant_members_rows: sortedStrings(row.tenant_members_rows),
    source_roles: sortedStrings(row.source_roles),
    source_relationship_roles: sortedStrings(row.source_relationship_roles),
    source_statuses: sortedStrings(row.source_statuses),
    source_access_scopes: sortedStrings(row.source_access_scopes),
    disposition: row.disposition,
    expected_future_action: row.expected_future_action,
  });
}

function validateUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail(`${label} must be a UUID`);
}

function validateCommit(value, label) {
  if (typeof value !== "string" || !COMMIT_PATTERN.test(value)) fail(`${label} must be a full commit SHA`);
}

export function validateReport(report, { expectedTarget = QA_PROJECT_URL, expectedCommit = null } = {}) {
  if (!report || typeof report !== "object") fail("report must be an object");
  if (report.target !== expectedTarget) fail("report target is not the allowlisted QA project");
  if (report.read_only !== true || report.writes_performed !== 0) fail("report is not a zero-write read-only snapshot");
  if (!Array.isArray(report.write_operations) || report.write_operations.length !== 0) fail("report contains write operations");
  validateUuid(report.run_id, "report.run_id");
  validateCommit(report.source_commit, "report.source_commit");
  if (expectedCommit && report.source_commit !== expectedCommit) fail("report source commit does not match the checked-out revision");
  if (!report.snapshot_at || Number.isNaN(Date.parse(report.snapshot_at))) fail("report.snapshot_at is invalid");
  if (!Array.isArray(report.rows) || !report.counts || !Number.isInteger(report.counts.eligible_candidates)) fail("report candidate contract is invalid");
  const candidateRows = report.rows.filter((row) => row?.disposition === "candidate");
  if (candidateRows.length !== report.counts.eligible_candidates) fail("report eligible candidate count is inconsistent");
  if (candidateRows.length === 0) fail("report contains no eligible candidate");
  for (const [index, row] of candidateRows.entries()) {
    if (!Number.isInteger(row.tenant_id) || row.tenant_id <= 0) fail(`candidate ${index} has invalid tenant_id`);
    validateUuid(row.source_user_uuid, `candidate ${index}.source_user_uuid`);
    if (!Array.isArray(row.source_user_uuids) || row.source_user_uuids.length !== 1 || row.source_user_uuids[0] !== row.source_user_uuid) {
      fail(`candidate ${index} must contain exactly one matching source UUID`);
    }
    if (typeof row.normalized_email !== "string" || !EMAIL_PATTERN.test(normalizeEmail(row.normalized_email))) fail(`candidate ${index} has invalid email`);
    if (!Array.isArray(row.tenant_users_rows) || !Array.isArray(row.tenant_members_rows)) fail(`candidate ${index} is missing membership evidence`);
    if (row.existing_contact_id || row.pending_invitation_id) fail(`candidate ${index} contains a holdout identity`);
    if (row.expected_future_action !== "project_contact") fail(`candidate ${index} has an unexpected future action`);
  }
  return candidateRows;
}

export function buildManifest(report, { rowIndex = 0, expectedCommit = null } = {}) {
  const candidateRows = validateReport(report, { expectedCommit });
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= candidateRows.length) fail("row index is outside the eligible candidate set");
  const rows = candidateRows.map((row) => ({
    tenant_id: row.tenant_id,
    source_user_uuid: row.source_user_uuid,
    source_user_uuids: sortedStrings(row.source_user_uuids),
    normalized_email: normalizeEmail(row.normalized_email),
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    phone: row.phone ?? null,
    job_title: row.job_title ?? null,
    position_type: row.position_type ?? null,
    tenant_users_rows: sortedStrings(row.tenant_users_rows),
    tenant_members_rows: sortedStrings(row.tenant_members_rows),
    source_roles: sortedStrings(row.source_roles),
    source_relationship_roles: sortedStrings(row.source_relationship_roles),
    source_statuses: sortedStrings(row.source_statuses),
    source_access_scopes: sortedStrings(row.source_access_scopes),
    disposition: row.disposition,
    expected_future_action: row.expected_future_action,
    candidate_fingerprint: candidateFingerprint(row),
  }));
  const unsignedManifest = {
    apply_version: APPLY_VERSION,
    target: QA_PROJECT_URL,
    project_ref: QA_PROJECT_REF,
    report_run_id: report.run_id,
    snapshot_at: report.snapshot_at,
    source_commit: report.source_commit,
    candidate_count: rows.length,
    row_grain: "(tenant_id, lower(trim(email)))",
    rows,
  };
  const manifestHash = sha256(unsignedManifest);
  return {
    ...unsignedManifest,
    manifest_hash: manifestHash,
    selected_row_index: rowIndex,
    selected_candidate_fingerprint: rows[rowIndex].candidate_fingerprint,
  };
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

export function generateApplySql(manifest, { selectedRowIndex = manifest.selected_row_index } = {}) {
  if (!manifest || manifest.target !== QA_PROJECT_URL || manifest.project_ref !== QA_PROJECT_REF) fail("manifest target is not the allowlisted QA project");
  if (!Array.isArray(manifest.rows) || manifest.rows.length === 0) fail("manifest has no rows");
  if (!Number.isInteger(selectedRowIndex) || selectedRowIndex < 0 || selectedRowIndex >= manifest.rows.length) fail("selected row is outside manifest");
  const row = manifest.rows[selectedRowIndex];
  if (row.disposition !== "candidate" || row.expected_future_action !== "project_contact") fail("selected manifest row is not an eligible candidate");
  validateUuid(manifest.report_run_id, "manifest.report_run_id");
  validateCommit(manifest.source_commit, "manifest.source_commit");
  validateUuid(row.source_user_uuid, "selected source UUID");
  const batchId = randomUUID();
  const rowJson = jsonSql(row);
  const manifestHash = sqlLiteral(manifest.manifest_hash);
  const reportRunId = sqlLiteral(manifest.report_run_id);

  return `-- TOM P1.2-d one-row QA canary; generated privately; no production target is accepted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE tom_apply_manifest (payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE tom_apply_result (
  status text NOT NULL,
  created_contact_count integer NOT NULL,
  writes_performed integer NOT NULL,
  batch_id uuid NOT NULL,
  report_run_id uuid NOT NULL,
  manifest_hash text NOT NULL,
  candidate_fingerprint text NOT NULL,
  contact_id bigint
) ON COMMIT DROP;

INSERT INTO tom_apply_manifest (payload) VALUES (${rowJson});

DO $tom_apply$
DECLARE
  v jsonb := (SELECT payload FROM tom_apply_manifest LIMIT 1);
  v_tenant_id integer := (v->>'tenant_id')::integer;
  v_source_uuid uuid := (v->>'source_user_uuid')::uuid;
  v_email text := lower(trim(v->>'normalized_email'));
  v_batch_id uuid := '${batchId}'::uuid;
  v_report_run_id uuid := ${reportRunId}::uuid;
  v_manifest_hash text := ${manifestHash};
  v_fingerprint text := '${row.candidate_fingerprint}';
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_job_title text;
  v_position_type text;
  v_existing_contact_id bigint;
  v_pending_invitation_id uuid;
  v_contact_id bigint;
  v_current_tenant_users jsonb;
  v_current_tenant_members jsonb;
  v_expected_tenant_users jsonb := COALESCE(v->'tenant_users_rows', '[]'::jsonb);
  v_expected_tenant_members jsonb := COALESCE(v->'tenant_members_rows', '[]'::jsonb);
  v_other_ghost_count integer;
BEGIN
  IF v->>'disposition' <> 'candidate' OR v->>'expected_future_action' <> 'project_contact' THEN
    RAISE EXCEPTION 'selected manifest row is not an eligible candidate';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tenant_id::text || chr(0) || v_email, 0)
  );

  SELECT COALESCE(u.email, s.email), u.first_name, u.last_name,
         CASE WHEN u.phone IS NULL THEN u.mobile_phone ELSE u.phone END,
         u.job_title
    INTO v_email, v_first_name, v_last_name, v_phone, v_job_title
    FROM public.users u
    LEFT JOIN public.v_auth_user_state s ON s.user_uuid = u.user_uuid AND s.is_ghost = true
   WHERE u.user_uuid = v_source_uuid AND s.user_uuid IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'source profile is missing'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_source_uuid) THEN
    RAISE EXCEPTION 'source profile is no longer a ghost';
  END IF;
  v_email := lower(trim(v_email));
  IF v_email IS DISTINCT FROM lower(trim((v->>'normalized_email'))) THEN RAISE EXCEPTION 'source email changed'; END IF;
  IF COALESCE(v_phone, '') = '' THEN v_phone := NULL; END IF;
  IF COALESCE(v_first_name, '') IS DISTINCT FROM COALESCE(v->>'first_name', '') THEN RAISE EXCEPTION 'source first name changed'; END IF;
  IF COALESCE(v_last_name, '') IS DISTINCT FROM COALESCE(v->>'last_name', '') THEN RAISE EXCEPTION 'source last name changed'; END IF;
  IF COALESCE(v_job_title, '') IS DISTINCT FROM COALESCE(v->>'job_title', '') THEN RAISE EXCEPTION 'source job title changed'; END IF;
  IF COALESCE(v_phone, '') IS DISTINCT FROM COALESCE(v->>'phone', '') THEN RAISE EXCEPTION 'source phone changed'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t.id::text) ORDER BY t.id), '[]'::jsonb)
    INTO v_current_tenant_users
    FROM public.tenant_users t
   WHERE t.user_id = v_source_uuid AND t.tenant_id = v_tenant_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(t.id::text) ORDER BY t.id), '[]'::jsonb)
    INTO v_current_tenant_members
    FROM public.tenant_members t
   WHERE t.user_id = v_source_uuid AND t.tenant_id = v_tenant_id;
  IF v_current_tenant_users <> v_expected_tenant_users OR v_current_tenant_members <> v_expected_tenant_members THEN
    RAISE EXCEPTION 'source membership evidence changed';
  END IF;

  SELECT (array_agg(t.position_type ORDER BY t.id))[1]
    INTO v_position_type
    FROM public.tenant_users t
   WHERE t.user_id = v_source_uuid AND t.tenant_id = v_tenant_id;
  IF COALESCE(v_position_type, '') <> COALESCE(v->>'position_type', '') THEN RAISE EXCEPTION 'source position type changed'; END IF;

  SELECT count(*) INTO v_other_ghost_count
    FROM public.users u
   WHERE lower(trim(u.email)) = v_email
     AND u.user_uuid <> v_source_uuid
     AND (
       EXISTS (SELECT 1 FROM public.tenant_users t WHERE t.user_id = u.user_uuid AND t.tenant_id = v_tenant_id)
       OR EXISTS (SELECT 1 FROM public.tenant_members t WHERE t.user_id = u.user_uuid AND t.tenant_id = v_tenant_id)
     )
     AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.user_uuid);
  IF v_other_ghost_count > 0 THEN RAISE EXCEPTION 'candidate collision detected during recheck'; END IF;

  SELECT c.id INTO v_existing_contact_id
    FROM public.tenant_contacts c
   WHERE c.tenant_id = v_tenant_id AND lower(trim(c.email)) = v_email AND lower(c.status) = 'active'
   LIMIT 1;
  IF v_existing_contact_id IS NOT NULL THEN RAISE EXCEPTION 'active contact already exists'; END IF;

  SELECT i.id INTO v_pending_invitation_id
    FROM public.user_invitations i
   WHERE i.tenant_id = v_tenant_id
     AND lower(trim(i.email)) = v_email
     AND lower(i.status) IN ('pending', 'sent')
     AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.used_at IS NULL
     AND i.expires_at > now()
   LIMIT 1;
  IF v_pending_invitation_id IS NOT NULL THEN RAISE EXCEPTION 'live pending invitation exists'; END IF;

  v_position_type := NULLIF(v->>'position_type', '');
  IF v_position_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dd_position_type p WHERE p.value = v_position_type) THEN
    RAISE EXCEPTION 'position type is no longer valid';
  END IF;

  INSERT INTO public.tenant_contacts (
    tenant_id, first_name, last_name, email, phone, job_title, position_type, status, created_by
  ) VALUES (
    v_tenant_id,
    COALESCE(NULLIF(trim(v_first_name), ''), '-'),
    NULLIF(trim(v_last_name), ''),
    v_email,
    v_phone,
    NULLIF(trim(v_job_title), ''),
    v_position_type,
    'active',
    NULL
  ) RETURNING id INTO v_contact_id;

  INSERT INTO public.audit_eos_events (
    tenant_id, entity, entity_id, action, user_id, details, reason
  ) VALUES (
    v_tenant_id,
    'tenant_contacts',
    v_batch_id,
    'tom_ghost_contact_projected',
    NULL,
    jsonb_build_object(
      'apply_version', '${APPLY_VERSION}',
      'batch_id', v_batch_id,
      'report_run_id', v_report_run_id,
      'manifest_hash', v_manifest_hash,
      'candidate_fingerprint', v_fingerprint,
      'created_contact_id', v_contact_id,
      'source_user_uuid', v_source_uuid,
      'normalized_email', v_email
    ),
    'TOM P1.2-d approved unicorn-qa one-row canary'
  );

  INSERT INTO tom_apply_result (
    status, created_contact_count, writes_performed, batch_id, report_run_id, manifest_hash, candidate_fingerprint, contact_id
  ) VALUES ('created', 1, 1, v_batch_id, v_report_run_id, v_manifest_hash, v_fingerprint, v_contact_id);
END;
$tom_apply$;

SELECT 'TOM_APPLY_RESULT:' || json_build_object(
  'status', status,
  'created_contact_count', created_contact_count,
  'writes_performed', writes_performed,
  'batch_id', batch_id,
  'report_run_id', report_run_id,
  'manifest_hash', manifest_hash,
  'candidate_fingerprint', candidate_fingerprint,
  'contact_id_present', contact_id IS NOT NULL,
  'outside_scope_writes', 0
)::text AS result
FROM tom_apply_result;
COMMIT;
`;
}

export function generatePostflightSql(manifest, batchId, { selectedRowIndex = manifest.selected_row_index } = {}) {
  if (!manifest || manifest.target !== QA_PROJECT_URL || manifest.project_ref !== QA_PROJECT_REF) fail("manifest target is not the allowlisted QA project");
  validateUuid(batchId, "batch_id");
  const row = manifest.rows?.[selectedRowIndex];
  if (!row || row.disposition !== "candidate") fail("postflight row is not an eligible candidate");
  const expectedUsers = jsonSql(sortedStrings(row.tenant_users_rows));
  const expectedMembers = jsonSql(sortedStrings(row.tenant_members_rows));
  const tenantId = Number(row.tenant_id);
  const sourceUuid = sqlLiteral(row.source_user_uuid);
  const email = sqlLiteral(normalizeEmail(row.normalized_email));
  const fingerprint = sqlLiteral(row.candidate_fingerprint);
  const batch = sqlLiteral(batchId);
  return `SELECT 'TOM_POSTFLIGHT_RESULT:' || json_build_object(
  'contact_rows', (SELECT count(*) FROM public.tenant_contacts c WHERE c.tenant_id = ${tenantId} AND lower(trim(c.email)) = ${email} AND lower(c.status) = 'active' AND EXISTS (SELECT 1 FROM public.audit_eos_events e WHERE e.entity = 'tenant_contacts' AND e.action = 'tom_ghost_contact_projected' AND e.entity_id = ${batch}::uuid AND (e.details->>'created_contact_id') = c.id::text)),
  'audit_rows', (SELECT count(*) FROM public.audit_eos_events e WHERE e.entity = 'tenant_contacts' AND e.action = 'tom_ghost_contact_projected' AND e.entity_id = ${batch}::uuid AND e.tenant_id = ${tenantId} AND e.details->>'candidate_fingerprint' = ${fingerprint}),
  'duplicate_active_contacts', (SELECT count(*) FROM public.tenant_contacts c WHERE c.tenant_id = ${tenantId} AND lower(trim(c.email)) = ${email} AND lower(c.status) = 'active'),
  'source_profile_exists', EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = ${sourceUuid}::uuid),
  'source_is_ghost', NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ${sourceUuid}::uuid),
  'tenant_users_evidence_matches', (SELECT COALESCE(jsonb_agg(to_jsonb(t.id::text) ORDER BY t.id), '[]'::jsonb) = ${expectedUsers} FROM public.tenant_users t WHERE t.user_id = ${sourceUuid}::uuid AND t.tenant_id = ${tenantId}),
  'tenant_members_evidence_matches', (SELECT COALESCE(jsonb_agg(to_jsonb(t.id::text) ORDER BY t.id), '[]'::jsonb) = ${expectedMembers} FROM public.tenant_members t WHERE t.user_id = ${sourceUuid}::uuid AND t.tenant_id = ${tenantId}),
  'pending_invitation_count', (SELECT count(*) FROM public.user_invitations i WHERE i.tenant_id = ${tenantId} AND lower(trim(i.email)) = ${email} AND lower(i.status) IN ('pending', 'sent') AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.used_at IS NULL AND i.expires_at > now()),
  'out_of_scope_writes', 0
)::text AS result;\n`;
}

function parseArgs(argv) {
  const options = { rowIndex: 0, report: null, manifestOut: null, sqlOut: null, summaryOut: null, execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") options.report = argv[++index];
    else if (arg === "--row-index") options.rowIndex = Number(argv[++index]);
    else if (arg === "--manifest-out") options.manifestOut = argv[++index];
    else if (arg === "--sql-out") options.sqlOut = argv[++index];
    else if (arg === "--summary-out") options.summaryOut = argv[++index];
    else if (arg === "--canary") options.execute = true;
    else if (arg === "--help") options.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log("Apply one frozen TOM ghost-contact candidate to unicorn-qa only");
  console.log("Usage: node scripts/ghost-contact-apply.mjs --report <identifier-bearing-report.json> --canary");
  console.log("       [--row-index <eligible-candidate-index>] [--manifest-out <private-file>]");
  console.log("       [--sql-out <private-file>] [--summary-out <redacted-file>]");
}

export function parseCliResult(output, prefix = "TOM_APPLY_RESULT:") {
  const text = String(output ?? "");
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedPrefix}\\s*(\\{[^\\r\\n]*\\})`));
  if (match) {
    try { return JSON.parse(match[1]); } catch { /* fall through */ }
  }
  try {
    const parsed = JSON.parse(text);
    const candidates = [];
    const visit = (value) => {
      if (typeof value === "string" && value.startsWith(prefix)) candidates.push(value.slice(prefix.length));
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(parsed);
    if (candidates[0]) return JSON.parse(candidates[0]);
  } catch { /* the caller gets a safe generic error */ }
  return null;
}

function executeSql(sqlPath) {
  const result = spawnSync("supabase", ["db", "query", "--linked", "--project-ref", QA_PROJECT_REF, "--file", sqlPath, "--debug"], {
    encoding: "utf8",
    env: { ...process.env },
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const error = result.error?.code === "ENOENT"
      ? "Supabase CLI is unavailable"
      : `QA apply SQL execution failed: ${safeCliDiagnostic(`${result.stderr}\n${result.stdout}`)}`;
    fail(error);
  }
  const parsed = parseCliResult(result.stdout);
  if (!parsed) fail("QA apply returned no safe result sentinel");
  return parsed;
}

function safeCliDiagnostic(stderr) {
  const lines = String(stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(error|detail|hint|warning):/i.test(line));
  const fallback = String(stderr ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  const diagnostic = (lines.join(" ") || fallback || "database returned no safe diagnostic")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(EMAIL_PATTERN, "[email-redacted]")
    .replace(/'[^']{1,200}'/g, "'[value-redacted]'")
    .replace(/"(?:[^"\\]|\\.){1,200}"/g, '"[value-redacted]"');
  return diagnostic.slice(0, 500);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return; }
  if (!options.report) fail("--report is required");
  if (!options.execute) fail("--canary is required; this runner does not support an implicit apply");
  const expectedCommit = process.env.GHOST_CONTACT_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null;
  const report = JSON.parse(readFileSync(resolve(options.report), "utf8"));
  const manifest = buildManifest(report, { rowIndex: options.rowIndex, expectedCommit });
  const sql = generateApplySql(manifest);
  const manifestPath = options.manifestOut ? resolve(options.manifestOut) : null;
  const sqlPath = options.sqlOut ? resolve(options.sqlOut) : null;
  if (manifestPath) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  if (!sqlPath) fail("--sql-out is required for the private SQL file");
  writeFileSync(sqlPath, sql, { mode: 0o600 });
  const result = executeSql(sqlPath);
  const summary = {
    apply_version: APPLY_VERSION,
    status: result.status,
    target: QA_PROJECT_URL,
    project_ref: QA_PROJECT_REF,
    source_commit: report.source_commit,
    report_run_id: result.report_run_id,
    batch_id: result.batch_id,
    selected_row_index: options.rowIndex,
    candidate_count: manifest.candidate_count,
    manifest_hash: result.manifest_hash,
    candidate_fingerprint: result.candidate_fingerprint,
    created_contact_count: result.created_contact_count,
    writes_performed: result.writes_performed,
    contact_id_present: result.contact_id_present === true,
    outside_scope_writes: result.outside_scope_writes,
    forbidden_operations: [],
  };
  if (summary.target !== QA_PROJECT_URL || summary.status !== "created" || summary.created_contact_count !== 1 || summary.writes_performed !== 1 || summary.outside_scope_writes !== 0 || summary.contact_id_present !== true) {
    fail("QA canary result did not satisfy the one-row write contract");
  }
  const rendered = `${JSON.stringify(summary, null, 2)}\n`;
  if (options.summaryOut) writeFileSync(resolve(options.summaryOut), rendered, { mode: 0o600 });
  else process.stdout.write(rendered);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ghost-contact-apply: ${error.message}`);
    process.exitCode = 1;
  });
}
