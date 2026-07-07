## PR-D addendum — `no_template` skip + confirmed acceptance test

### Problem
`bulk-generate-phase-documents` skips items with `reason='no_template'` when neither `document_versions.storage_path`, `document_versions.frozen_storage_path`, nor `documents.source_template_url` is populated. Neither `create_bulk_document_job` / `preview_bulk_document_job` eligibility nor the new worker replicate this check. Templateless docs would hit `deliver-governance-document` and return a confusing 400 instead of a clean skip. Verified: original test doc 5519 and its four alternatives all had zero template source.

### Change — worker only (no RPC/migration change)
File: `supabase/functions/bulk-generate-documents-worker/index.ts`

1. Extend `latestPublishedVersion(documentId)` to also select `storage_path, frozen_storage_path`. Return `{ id, storage_path, frozen_storage_path }` (or null).
2. Extend `documentFormat(documentId)` → `documentMeta(documentId)` returning `{ format, source_template_url }` (single read, no extra round-trip).
3. In the per-item loop, right after the version + format checks and before calling `deliver-governance-document`, add:
   ```
   const hasTemplate =
     !!version.storage_path ||
     !!version.frozen_storage_path ||
     !!meta.source_template_url;
   if (!hasTemplate) {
     await record(item.id, 'skipped', 'no_template', {
       document_id: item.document_id,
       document_version_id: version.id,
     }, null, null);
     continue;
   }
   ```
4. Order of pre-generation checks (unchanged apart from the new step):
   `bootstrap → repair → latestPublishedVersion (no_published_version) → format (unsupported_format) → template (no_template) → deliver`.

No changes to launcher, RPCs, migrations, or frontend. `types.ts` unaffected.

### Acceptance test — confirmed target
- Tenant: `7547` (Demo RTO)
- Document: `7360` ("Q4.D2 - Risk Management Policy")
- Document version: `b5e1557b-36d2-427c-ad60-be532e8df32b` (has real `source_template_url` and an active `document_instance` — verified)

Protocol:
1. `supabase--curl_edge_functions` POST `/bulk-generate-documents-launcher` with `{ action:'create', scope:'selected', tenant_ids:[7547], document_ids:[7360] }` under logged-in staff JWT.
2. Capture returned `job_id`.
3. Poll `bulk_document_jobs` and `bulk_document_job_items` every ~3s up to 60s.
4. Assert single item transitions `pending → leased → generated` with a non-null `worker_id`, `outcome` JSON populated, no `error_code`.
5. Query `governance_document_deliveries` for the produced SharePoint artifact (tenant 7547, doc 7360, this job/version).
6. Confirm job reaches `status='completed'`.
7. WORKER_ID discipline: `bulk_document_job_items` for this job — the single terminal row has non-null `worker_id`; no row is terminal without a `worker_id`.

Paste back: launcher response, job/item timeline (state, worker_id, timestamps, outcome, error_code), governance delivery row, and final job status. If anything is off, stop and report — don't declare done.

### Rollback
Trivial — revert the four small edits inside worker `index.ts`. No schema or RPC changes.
