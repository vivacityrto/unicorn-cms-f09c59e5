## Governance Documents — Implementation Status

### Phase 1: Schema Migration ✅ COMPLETE
- TRUNCATED `stage_documents` (24 test rows) + added `is_core`, `is_active`, `updated_at`, `updated_by`, `added_source`
- Added 6 tracking columns to `document_instances`: `generated_file_url`, `generated_item_id`, `generation_status`, `last_error`, `updated_by`, `is_manual_allocation`
- Created `document_generation_errors` table with FK to `document_instances`
- Created 3 lookup tables: `dd_document_status`, `dd_doc_generation_status`, `dd_governance_framework`
- Added feature flags to `app_settings`: `governance_use_stage_documents`, `governance_overwrite_enabled`
- RLS policies for all new tables + VivacityTeam write on `stage_documents`
- **Bug Fix 1**: `v_completion_eligibility` — `sd.id` → `sd.document_id`
- **Bug Fix 2**: `v_progress_anchor_inputs` — `sd.id` → `sd.document_id`
- **Bug Fix 3**: `publish_stage_version` — `v_stage.name` → `.title`, `v_stage.type` → `.stage_type`, removed `.package_type`, `d.name` → `d.title`
- **Bug Fix 4**: `get_document_stage_usage` — `ds.name` → `ds.title`

### Phase 2: Seed Data ✅ COMPLETE
- Seeded 76 rows into `stage_documents` from `documents.stage` (FK-safe filter — 478 docs had orphaned stage refs to non-existent stages)
- Backfilled `generation_status` on all `document_instances` (106,792 rows)

### Phase 3: Frontend Updates ✅ COMPLETE
- `StageDocumentsPanel.tsx` — added `is_core` and `is_active` to interface + toggle controls
- `StageDocumentsSection.tsx` — generation status badges, self-service error diagnostics, retry button, file links, manual allocation indicator
- `useStageDocuments.ts` — expanded query to include generation tracking columns

### Phase 4: Backend Logic (Feature-Flagged Cutover) — PENDING
- Update `start_client_package` RPC with `governance_use_stage_documents` flag
- Note: This requires a database migration to modify the RPC, which should be done via Supabase SQL editor

### Phase 5: Generation Hardening ✅ COMPLETE
- Updated `deliver-governance-document` edge function:
  - Post-delivery: updates `document_instances` with `generation_status=generated`, `generated_file_url`, `generated_item_id`
  - Resolves active `document_generation_errors` on success
  - On failure: sets `generation_status=failed`, `last_error`, inserts error to `document_generation_errors`
  - Logs `governance_generation_failed` to `document_activity_log`
- Updated `bulk-generate-phase-documents` edge function:
  - Added `overwrite_all` mode (does not skip already-generated docs)
  - Success: updates `generation_status=generated`, `generationdate`, clears `last_error`, resolves errors
  - Failure: sets `generation_status=failed`, `last_error`, inserts `BULK_GEN_FAILED` error
  - All existing flows (pending_only, audit log, rate limit) preserved

### Phase 6: Audit Logging ✅ COMPLETE
- Existing audit logging in both edge functions preserved and extended:
  - `deliver-governance-document`: already logs `governance_document_delivered` + now logs `governance_generation_failed`
  - `bulk-generate-phase-documents`: already logs `bulk_generate_phase_documents` audit event

### Phase 7: Testing and Rollout — PENDING
- Verify bug fixes, RLS, edge function changes
- Feature flag rollout: enable `governance_use_stage_documents` per environment

### Key Discovery: Orphaned Stage References
478 of 554 documents have `stage` values pointing to IDs that don't exist in `documents_stages`. Only 76 have valid FK refs. This data quality issue should be investigated separately.
