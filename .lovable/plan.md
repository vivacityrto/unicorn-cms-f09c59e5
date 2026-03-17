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

### Phase 4: Backend Logic (Feature-Flagged Cutover) ✅ COMPLETE
- Updated `start_client_package` RPC with `governance_use_stage_documents` feature flag
- When flag ON: seeds `document_instances` from `stage_documents` (respects `is_active`, carries `is_core`, sets `generation_status`)
- When flag OFF: legacy path unchanged (seeds from `documents.stage`)
- Audit log now records `document_source` in metadata

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

### Phase 7: Testing and Rollout ✅ COMPLETE
- Verified bug fixes: `v_completion_eligibility` and `v_progress_anchor_inputs` both use `sd.document_id` ✓
- Verified schema: `stage_documents` has 76 rows (all core, all active) ✓
- Verified backfill: 106,792 `document_instances` rows have `generation_status = 'pending'` ✓
- Verified feature flags: `governance_use_stage_documents = false`, `governance_overwrite_enabled = false` ✓
- Feature flag rollout: enable `governance_use_stage_documents` via App Settings when ready

### Phase 8: Replace CHECK Constraints with dd_ Lookup Validation ✅ COMPLETE
- Created `dd_ai_analysis_status` table (pending, analyzing, completed, failed, skipped) with RLS
- Created `dd_ai_status` table (pending, auto_approved, needs_review, rejected) with RLS
- Added `RTO` fallback value to `dd_governance_framework` for AI-assigned framework types
- Dropped 4 CHECK constraints: `chk_document_status`, `documents_framework_type_check`, `documents_ai_analysis_status_check`, `documents_ai_status_check`
- Created `trg_validate_documents_lookup_fields` SECURITY DEFINER trigger validating all 4 columns against their respective dd_ tables
- Zero data migration required — all existing values are valid in the lookup tables
- Both new tables auto-appear in Code Tables Admin for self-service management

### Key Discovery: Orphaned Stage References
478 of 554 documents have `stage` values pointing to IDs that don't exist in `documents_stages`. Only 76 have valid FK refs. This data quality issue should be investigated separately.

---

## Work Sub Type Implementation ✅ COMPLETE

### Phase 1: Schema ✅
- Created `dd_work_sub_type` table with `category` column (`consultation` / `document`)
- RLS: authenticated read, Vivacity staff manage
- Added `work_sub_type` (text, nullable) to `time_entries`, `active_timers`, `calendar_time_drafts`

### Phase 2: Seed Data ✅
- 10 consultation sub types (compliance_health_check → general_consulting)
- 8 document sub types (tas → other_document)
- Document sub types shared across both `document_review` and `document_development`

### Phase 3: Frontend ✅
- `AddTimeDialog.tsx` — Work Sub Type selector filters by category based on selected work type
- `TimeLogDrawer.tsx` — Displays work sub type badge next to work type, added `document_development` to labels
- `useTimeTracking.tsx` — Added `work_sub_type` to `TimeEntry` interface
- `useSuggestDropdowns.ts` — Added `workSubTypes` query for `dd_work_sub_type`

### Admin
- `dd_work_sub_type` auto-appears in Code Tables Admin for label editing, active/inactive toggle, sort order

---

## Lifecycle Checklists — Client & Staff Onboarding/Offboarding ✅ Phase 1 COMPLETE

### Phase 1: Schema + Admin Template Manager ✅
- Created `dd_lifecycle_type` (client_onboarding, client_offboarding, staff_onboarding, staff_offboarding)
- Created `dd_lifecycle_responsible_role` (super_admin, operations, csc, team_leader)
- Created `dd_lifecycle_category` (staff_details, m365_groups, m365_licenses, software_logins, calendar_invitations, crm, training_portal, external_comms)
- Created `lifecycle_checklist_templates` with `is_default` flag for selective step generation
- Created `lifecycle_checklist_instances` for per-client/per-user execution tracking
- RLS: Vivacity staff only (read + manage) on all tables; authenticated read on dd_ tables
- Built admin template manager at `/admin/lifecycle-checklists` with tabbed UI, category grouping, CRUD
- Added sidebar entry under SuperAdmin menu
- All dd_ tables auto-appear in Code Tables Admin for self-service management

### Phase 2: Pending
- Step picker dialog for selective checklist generation
- Checklist execution component (tick-off UI with progress bar)
- Integration with Cancel Package flow (auto-generate client offboarding)
- Integration with Manage Users (generate staff onboarding/offboarding)
- Seed staff onboarding template steps from recruitment spreadsheet
