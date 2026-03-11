

# Governance Documents — Final Comprehensive Implementation Plan

## Deep Review Findings

### Confirmed Production Bugs (Must Fix)

**Bug 1: `v_completion_eligibility` — wrong join column**
```sql
-- CURRENT (broken): sd.id is the stage_documents PK, not the document ref
WHERE di.document_id = sd.id AND di.tenant_id = cpss.tenant_id
-- CORRECT:
WHERE di.document_id = sd.document_id AND di.tenant_id = cpss.tenant_id
```
Impact: Document completeness ratio is computed against wrong IDs. Compliance eligibility results are silently incorrect for all tenants.

**Bug 2: `v_progress_anchor_inputs` — same wrong join**
```sql
-- CURRENT (broken):
WHERE di.document_id = sd.id AND di.tenant_id = pi.tenant_id
-- CORRECT:
WHERE di.document_id = sd.document_id AND di.tenant_id = pi.tenant_id
```
Impact: `documents_pending_upload` count on progress dashboard is wrong.

Note: `v_score_required_docs` and `calculate_compliance_score` are CORRECT — they both use `sd.document_id`.

**Bug 3: `publish_stage_version` — 4 wrong column references**
The RPC does `SELECT * FROM documents_stages` into a RECORD, then accesses:
- `v_stage.name` — column is actually `title` → snapshot stores NULL
- `v_stage.type` — column is actually `stage_type` → snapshot stores NULL
- `v_stage.package_type` — column does NOT EXIST → snapshot stores NULL
- `d.name` (documents join) — column is actually `d.title` → snapshot stores NULL

Impact: All published stage version snapshots have null values for stage name, type, and document names.

### Schema Facts Confirmed From Database

**`stage_documents` (24 test rows)**
- Columns: `id, stage_id, document_id, sort_order, visibility, delivery_type, is_team_only, is_tenant_downloadable, is_auto_generated, created_at, created_by, is_tenant_visible, is_required, notes, pinned_version_id`
- Missing from blueprint: `is_core`, `is_active`, `updated_at`, `updated_by`, `added_source`
- No FK constraints from other tables (confirmed via `pg_constraint`)
- 4 views depend on it (column references, not row data)
- 6 RPCs reference it
- No triggers exist on it
- Cannot DROP (views would break) — must TRUNCATE + ALTER

**`document_instances` (24,163 rows)**
- Columns: `document_id, tenant_id, status, coments, created_at, updated_at, stageinstance_id, id, isgenerated, generationdate, generated_by, is_core`
- Missing: `generated_file_url`, `generated_item_id`, `generation_status`, `last_error`, `updated_by`, `is_manual_allocation`
- Already has `updated_at` trigger (`update_document_instances_updated_at`)
- PK on `id` via sequence `document_instances_id_seq`
- FK: `document_id → documents(id) ON DELETE CASCADE`
- No unique constraint on `(document_id, stageinstance_id, tenant_id)` — duplicates possible
- RLS: tenant member SELECT, admin/SuperAdmin write

**`documents` table**
- Column is `stage` (integer, nullable) — NOT `stage_id`
- Column is `title` — NOT `name`
- Has `is_core`, `is_team_only`, `is_auto_generated`
- 554 rows with non-null `stage`

**Confirmed safe to keep:**
- `pinned_version_id` — used by `get_document_stage_usage` RPC (returns it), `DocumentStageUsagePanel.tsx` (renders badge), `useDocumentVersions.tsx` (type), `StageDocumentsPanel.tsx` (interface)
- `is_team_only` — on both `documents` and `stage_documents`, used by `GovernanceDocuments.tsx` filter, `usePackageBuilder.tsx`, types file

**Confirmed does not exist yet:** `dd_document_status`, `dd_doc_generation_status`, `dd_governance_framework`, feature flags on `app_settings`

**Confirmed safe — 0 rows:** `package_stage_documents` — no FK to `stage_documents`

**Security confirmed:**
- All 4 views have `security_invoker = true`
- `is_vivacity_team_safe` includes Super Admin, Team Leader, Team Member
- `set_updated_at` function exists for trigger reuse
- `audit_events` allows INSERT for all authenticated
- `document_activity_log` RLS scoped to tenant members

### Two Separate Generation Flows (Both Preserved)

| Flow | Edge Function | Template Source | Output Dest | Format |
|---|---|---|---|---|
| Governance Delivery | `deliver-governance-document` | Supabase Storage (document-files) | SharePoint (tenant governance folder) | DOCX |
| Phase Bulk Gen | `bulk-generate-phase-documents` | Supabase Storage (package-documents) | Supabase Storage (package-documents) | XLSX |

Key: `deliver-governance-document` does NOT currently update `document_instances` at all. `bulk-generate-phase-documents` updates `isgenerated` and `status` on `document_instances` but not the new tracking columns.

### Frontend Insert Pattern
`StageDocumentsPanel.tsx` line 203 inserts to `stage_documents` with: `stage_id, document_id, sort_order, visibility, delivery_type, is_tenant_visible, is_required`. Does NOT include `is_core` or `is_active` — new columns must have defaults.

---

## Implementation Plan — 8 Phases

### Phase 1: Schema Changes Only (No Logic Changes)

**1a. TRUNCATE `stage_documents` + ADD columns**
```sql
TRUNCATE TABLE stage_documents;

ALTER TABLE stage_documents
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS added_source text DEFAULT 'manual';

CREATE TRIGGER set_stage_documents_updated_at
  BEFORE UPDATE ON stage_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```
All existing columns kept intact (`visibility`, `delivery_type`, `is_team_only`, `is_tenant_downloadable`, `is_auto_generated`, `is_tenant_visible`, `is_required`, `notes`, `pinned_version_id`, `sort_order`).

**1b. ALTER `document_instances` — add tracking columns**
```sql
ALTER TABLE document_instances
  ADD COLUMN IF NOT EXISTS generated_file_url text,
  ADD COLUMN IF NOT EXISTS generated_item_id text,
  ADD COLUMN IF NOT EXISTS generation_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS is_manual_allocation boolean NOT NULL DEFAULT false;
```
Existing `updated_at` trigger already handles timestamp updates.

**1c. CREATE `document_generation_errors`**
```text
id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
documentinstance_id bigint NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE
error_code text
error_message text NOT NULL
error_detail jsonb
created_at timestamptz NOT NULL DEFAULT now()
resolved_at timestamptz
resolved_by uuid
```
Indexes: `documentinstance_id`, partial index on `resolved_at IS NULL`.

**1d. CREATE lookup tables** (standard dd_ pattern)
- `dd_document_status` — seed: draft, released, superseded, archived
- `dd_doc_generation_status` — seed: pending, generating, generated, failed, skipped
- `dd_governance_framework` — seed: RTO2015, RTO2025, CRICOS, GTO

**1e. Feature flags in `app_settings`**
```sql
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS governance_use_stage_documents boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS governance_overwrite_enabled boolean DEFAULT false;
```
These auto-render in AppSettingsForm under `governance_` prefix group.

**1f. RLS policies**

`document_generation_errors`:
- SELECT: tenant member via join through `document_instances.tenant_id`, or SuperAdmin
- INSERT/UPDATE/DELETE: SuperAdmin only (errors created by edge functions via service role)

`stage_documents` — add VivacityTeam write:
```sql
CREATE POLICY "VivacityTeam can manage stage_documents"
  ON stage_documents FOR ALL TO authenticated
  USING (is_vivacity_team_safe(auth.uid()))
  WITH CHECK (is_vivacity_team_safe(auth.uid()));
```

`dd_*` tables: authenticated SELECT, SuperAdmin write.

**1g. FIX Bug 1+2: Recreate views**

Drop and recreate `v_completion_eligibility` and `v_progress_anchor_inputs` with `sd.document_id` replacing `sd.id`. Preserve `security_invoker = true`.

**1h. FIX Bug 3: Replace `publish_stage_version`**

Fix the snapshot query:
- `v_stage.name` → `v_stage.title`
- `v_stage.type` → `v_stage.stage_type`
- `v_stage.package_type` → remove (column doesn't exist)
- `d.name` → `d.title`
- Add `is_core`, `is_active`, `is_required` to document snapshot

**1i. Update `copy_stage_template_to_package` RPC**

The existing RPC copies `visibility, delivery_type, sort_order` from `stage_documents` to `package_stage_documents`. Add `is_core` to the copy if `package_stage_documents` has or gets that column. If not, skip — this is legacy and will be rebuilt.

**1j. Regenerate Supabase types** after all schema changes.

---

### Phase 2: Seed Data

```sql
INSERT INTO stage_documents (
  stage_id, document_id, is_core, is_active, added_source,
  visibility, delivery_type, is_auto_generated, is_tenant_visible, is_required
)
SELECT 
  d.stage, d.id,
  COALESCE(d.is_core, true), true, 'migration',
  CASE WHEN d.is_team_only THEN 'team_only' ELSE 'both' END,
  CASE WHEN d.is_auto_generated THEN 'auto_generate' ELSE 'manual' END,
  COALESCE(d.is_auto_generated, false),
  CASE WHEN d.is_team_only THEN false ELSE true END,
  false
FROM documents d
WHERE d.stage IS NOT NULL;
```

Backfill `generation_status` on existing `document_instances`:
```sql
UPDATE document_instances 
SET generation_status = CASE WHEN isgenerated THEN 'generated' ELSE 'pending' END
WHERE generation_status IS NULL;
```

Verification: row count = 554, zero duplicates (unique constraint), zero orphan FKs.

---

### Phase 3: RLS and Security Review

- All 4 views: `security_invoker = true` ✓ (confirmed)
- `document_instances` RLS: tenant-scoped read, admin write ✓ (confirmed)
- `tenant_sharepoint_settings` RLS: existing policies sufficient ✓
- `document_activity_log` RLS: tenant member INSERT/SELECT ✓ (confirmed)
- No changes needed — existing security model covers new columns

---

### Phase 4: Backend Logic — Feature-Flagged Cutover

**Update `start_client_package` RPC**

When `governance_use_stage_documents = true` in `app_settings`:
```sql
INSERT INTO document_instances (
  document_id, stageinstance_id, tenant_id, status, isgenerated, is_core, generation_status
)
SELECT sd.document_id, v_stage_instance_id, p_tenant_id, 'pending', false, sd.is_core, 'pending'
FROM stage_documents sd
WHERE sd.stage_id = v_stage.stage_id AND sd.is_active = true;
```
Old path (reading from `documents.stage`) fully preserved when flag is OFF.

---

### Phase 5: Generation Hardening

**5a. Update `deliver-governance-document` edge function**

After successful SharePoint upload (line ~464), add:
```typescript
// Update document_instances if matching row exists
await supabase.from('document_instances')
  .update({
    generation_status: 'generated',
    generated_file_url: driveItem.webUrl,
    generated_item_id: driveItem.id,
    isgenerated: true,
    generationdate: new Date().toISOString(),
    last_error: null
  })
  .eq('document_id', doc.id)
  .eq('tenant_id', tenant_id);

// Resolve active errors
await supabase.from('document_generation_errors')
  .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
  .eq('documentinstance_id', /* matching instance id */)
  .is('resolved_at', null);
```

On failure (catch block, line ~515), add:
```typescript
await supabase.from('document_instances')
  .update({ generation_status: 'failed', last_error: msg })
  .eq('document_id', doc.id)
  .eq('tenant_id', tenant_id);

await supabase.from('document_generation_errors')
  .insert({ documentinstance_id: /* id */, error_code: 'DELIVERY_FAILED', error_message: msg });
```

Existing delivery flow (DOCX merge, tailoring, `governance_document_deliveries` record, audit log) is completely untouched.

**5b. Update `bulk-generate-phase-documents` edge function**

At line 306, expand the `document_instances` update:
```typescript
await supabase.from('document_instances')
  .update({
    isgenerated: true,
    status: 'generated',
    generation_status: 'generated',
    generationdate: new Date().toISOString(),
    last_error: null
  })
  .eq('id', inst.id);
```

On failure (line 311-315), add error tracking:
```typescript
await supabase.from('document_instances')
  .update({ generation_status: 'failed', last_error: msg })
  .eq('id', inst.id);

await supabase.from('document_generation_errors')
  .insert({ documentinstance_id: inst.id, error_code: 'BULK_GEN_FAILED', error_message: msg });
```

Add `overwrite_all` mode: at line 163, when `mode === 'overwrite_all'`, don't skip already-generated docs.

Pre-check validation: fail fast if `tenant_sharepoint_settings.is_enabled = false` or governance folder missing (for governance-targeted generation only).

**5c. Preserve `document_fields` usage**
`deliver-governance-document` lines 321-324 use `document_fields` for tailoring validation. This is explicitly preserved — not touched.

---

### Phase 6: Frontend Updates

**6a. `StageDocumentsPanel.tsx`**

Update `StageDocumentItem` interface (line 42-54):
```typescript
interface StageDocumentItem {
  // ... existing fields ...
  is_core: boolean;      // ADD
  is_active: boolean;    // ADD
  // pinned_version_id, is_required, notes etc. KEPT
}
```

Add `is_core` and `is_active` toggle controls alongside existing `is_required` and `is_tenant_visible` toggles. Update the insert query (line 203) to include `is_core: true, is_active: true` as defaults.

**6b. `StageDocumentsSection.tsx`** (runtime client view)

Add to each document row:
- `generation_status` badge (pending / generated / failed)
- `generationdate` as "Last generated" date
- `generated_file_url` as clickable link (opens in new tab)
- `last_error` with self-service error categorisation:
  - Contains "merge" or "field" → "Missing merge data"
  - Contains "SharePoint" or "governance folder" or "drive" → "SharePoint configuration"
  - Contains "template" or "version" or "storage_path" → "Template issue"
  - Otherwise → "System error"
- Retry button for failed documents
- `is_manual_allocation` indicator badge

**6c. Update related files** (select queries need new columns in TypeScript)
- `usePackageStageOverrides.tsx` — add `is_core`, `is_active` to `stage_documents` select
- `useStageSimulation.tsx` — same
- `useDocumentAIConfidence.tsx` — same
- `ReleaseDocumentsDialog.tsx` — same
- `StageDeliveryPanel.tsx` — same
- `BulkUploadWithMetadataDialog.tsx` — same (insert already has defaults via DB)

Files referencing `package_stage_documents` are NOT touched.

**6d. Update `get_document_stage_usage` RPC** to include `is_core`, `is_active` in return set.

**6e. Update `copy_stage_template_to_package` and `sync_stage_template_to_packages`** RPCs to include new columns when copying/syncing.

---

### Phase 7: Audit Logging

Use existing `document_activity_log` (tenant-scoped) and `audit_events` (system-level):

| Event | Table | activity_type / action |
|---|---|---|
| Stage document attached | audit_events | `stage_document_linked` (already in `StageDocumentsPanel.tsx` line 228) |
| Stage document detached | audit_events | `stage_document_unlinked` (already in `StageDocumentsPanel.tsx` line 258) |
| Document instance created | client_audit_log | `document_instance_created` |
| Document generated (governance) | document_activity_log | `governance_document_delivered` (already exists line 496) |
| Document generated (bulk) | audit_events | `bulk_generate_phase_documents` (already exists line 320) |
| Generation failed | document_activity_log | `governance_generation_failed` |
| Generation retried | document_activity_log | `governance_generation_retried` |
| Manual allocation | client_audit_log | `document_manual_allocation` |

Existing audit logging in `deliver-governance-document` and `bulk-generate-phase-documents` is preserved and extended with new status fields in metadata.

---

### Phase 8: Testing and Rollout

- Schema verification: row counts, FK integrity, no duplicates after seed
- Bug fix verification: `v_completion_eligibility` and `v_progress_anchor_inputs` return correct document counts
- RLS tests: tenant isolation on `document_instances` and `document_generation_errors`
- Edge function tests: delivery with status tracking, bulk generation with error tracking
- Frontend tests: new toggle controls, status badges, error display, retry
- Feature flag rollout: enable `governance_use_stage_documents` per environment, default OFF
- No columns or tables removed

---

## Summary of All Changes

### Schema Changes
| Object | Change | Impact |
|---|---|---|
| `stage_documents` | TRUNCATE (24 test rows) + ADD 5 columns | Views unaffected (column refs). 7 TS files need interface additions. Inserts work via defaults. |
| `document_instances` | ADD 6 columns | All nullable/defaulted. Zero impact on 24,163 existing rows or existing queries. |
| `document_generation_errors` | NEW table | No dependencies. New hooks needed. |
| `dd_document_status` | NEW lookup | Auto-discovered by Code Tables Admin. |
| `dd_doc_generation_status` | NEW lookup | Auto-discovered by Code Tables Admin. |
| `dd_governance_framework` | NEW lookup | Auto-discovered by Code Tables Admin. |
| `app_settings` | ADD 2 boolean columns | Auto-rendered in AppSettingsForm under `governance_` group. |

### Bug Fixes
| Bug | Fix | Impact |
|---|---|---|
| `v_completion_eligibility` wrong join | `sd.id` → `sd.document_id` | Fixes incorrect compliance eligibility for ALL tenants |
| `v_progress_anchor_inputs` wrong join | `sd.id` → `sd.document_id` | Fixes incorrect pending upload counts on progress dashboard |
| `publish_stage_version` wrong columns | `v_stage.name` → `.title`, `v_stage.type` → `.stage_type`, remove `.package_type`, `d.name` → `d.title` | Fixes null values in ALL stage version snapshots |

### RLS Changes
| Object | Change |
|---|---|
| `stage_documents` | Add VivacityTeam write policy |
| `document_generation_errors` | New: tenant-scoped SELECT, SuperAdmin write |
| `dd_*` tables | New: authenticated SELECT, SuperAdmin write |

### Edge Function Changes
| Function | Change |
|---|---|
| `deliver-governance-document` | Add post-delivery `document_instances` status update + error tracking. Existing flow untouched. |
| `bulk-generate-phase-documents` | Add `generation_status`/`last_error` tracking + `overwrite_all` mode. Existing `pending_only` flow untouched. |

### Frontend Changes (~10 files)
| File | Change |
|---|---|
| `StageDocumentsPanel.tsx` | Add `is_core`, `is_active` to interface + toggle controls |
| `StageDocumentsSection.tsx` | Add generation status badges, error display, retry, self-service diagnostics |
| 5 hooks/components | Add new columns to TypeScript interfaces |

### What Does NOT Change
- `package_stage_documents` — untouched (0 rows, legacy)
- `document_fields` — untouched (used by tailoring validation)
- `documents.stage` — kept, not removed
- `governance_document_deliveries` — untouched
- `generated_documents` — untouched
- All existing UI rendering — backward compatible
- All existing generation flows — preserved
- `useStageTemplateContent.tsx` — queries `documents` directly, not `stage_documents`

---

## Benefits

1. **Fixes 3 production bugs** — compliance scoring, progress dashboard, version snapshots all returning incorrect data today
2. **Self-service diagnostics** — users see categorised failure reasons (merge data / SharePoint / template / system) without contacting Vivacity
3. **Full audit trail** — who/what/when/why for all document lifecycle events
4. **Governance control** — `is_core` + `is_active` flags enable proper template governance at the stage-document mapping level
5. **Overwrite capability** — governance update workflows can refresh existing client documents
6. **Error lifecycle** — failures tracked in `document_generation_errors`, retryable, auto-resolved on success
7. **Feature-flagged rollout** — zero risk to existing functionality; old seeding path preserved until `governance_use_stage_documents` enabled

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TRUNCATE clears data views need | None | N/A | Views reference columns not rows. Seed runs immediately after in same migration. |
| View recreation breaks during deploy | Very Low | Medium | `CREATE OR REPLACE VIEW` with `security_invoker = true` in same transaction. |
| New columns break existing INSERT queries | None | N/A | All new columns have defaults. Verified: `StageDocumentsPanel.tsx` insert (line 203) works without specifying `is_core`/`is_active`. |
| `start_client_package` regression | Low | High | Feature flag defaults OFF. Old path 100% preserved. Test both paths before enabling. |
| TypeScript type mismatch after schema change | Medium | Medium | Types auto-regenerate. Deploy schema before code. |
| `package_stage_documents.source_stage_document_id` orphaned | Low | None | No FK constraint exists. 0 rows. Package builder rebuild scope. |
| Edge function changes affect delivery | Low | High | Only adds post-delivery writes. Core flow (download → merge → upload → record) completely untouched. |
| `copy_stage_template_to_package` reads truncated table | Medium | Low | Table is immediately re-seeded. Any package operations between truncate and seed would get 0 documents — mitigated by running both in same migration. |

