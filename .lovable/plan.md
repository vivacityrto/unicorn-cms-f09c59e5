

# Compliance Documents: Full Build Plan
## SharePoint Template Management with Centralised App-Level Auth

---

## Current State Summary

**What exists and can be leveraged:**

| Asset | Status | Notes |
|-------|--------|-------|
| `documents` table | 730 records, all "draft" | Master template records with AI analysis fields, merge field detection, category, format |
| `document_versions` table | Schema exists, 0 rows | Has version_number, status, storage_path, file_name -- but no checksum or publish fields |
| `document_instances` table | Per-tenant instances | Links documents to tenants/stages with generation tracking |
| `generated_documents` table | Output records | Has merge_data, retry_count, version_group_id, direction, client visibility |
| `dd_document_categories` | 20 categories mapped | Q1-Q4, CRICOS, GTO, etc. -- but missing `sharepoint_folder_name` |
| `tenant_sharepoint_settings` | 24 tenants configured, 0 provisioned | Has drive_id, site_id, root_item_id, setup_mode, template_id |
| `sharepoint_shared_sources` | Schema exists, 0 rows | Central source registry (label, site_id, drive_id, item_id, content_mode) |
| `sharepoint_folder_templates` | Schema exists | Folder structure templates with seed rules and base_subfolders |
| `document_activity_log` | Full audit trail | Captures tenant_id, actor, role, activity_type, metadata |
| `merge_field_definitions` | Active | Code-to-source_column mapping for merge tags |
| `tenant_merge_data` | Per-tenant JSONB | Supplementary data for merge field resolution |
| `document_data_sources` | Per-document sources | External data sources for dropdown/merge fields |
| TGA tables | 30+ tables | Full TGA infrastructure including `tga_rto_snapshots` (with `raw_sha256`, `payload` JSONB) and `client_tga_snapshot` |
| `provision-tenant-sharepoint-folder` | Working edge function | App-level auth (`client_credentials`), folder creation, seed rules, copy logic |
| `browse-sharepoint-folder` | Working edge function | Uses delegated user tokens |
| `generate-document` / `generate-excel-document` | Working edge functions | Merge field substitution, file generation |
| `bulk-generate-phase-documents` | Working edge function | Batch generation per stage instance |
| Storage buckets | 15 buckets | `document-files` (private) available for frozen template copies |
| Microsoft secrets | All configured | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |
| Tenants | 401 total | Have `rto_id`, `abn`, `legal_name` for folder matching |

**Gaps identified:**

1. No centralised Graph app-client module -- `getAppToken()` is duplicated inline in `provision-tenant-sharepoint-folder`
2. No `sharepoint_sites` registry distinguishing Master Documents site from Client Files site
3. No checksum integrity tracking on template versions
4. No frozen/immutable storage copy of published templates
5. No `sharepoint_folder_name` on `dd_document_categories` to map categories to SharePoint subfolder names
6. No compliance_docs subfolder tracking on `tenant_sharepoint_settings`
7. No tailoring validation rules
8. No idempotent upload tracking (no `sharepoint_drive_item_id` on outputs)
9. No job queue for throttled bulk generation
10. `document_versions` has 0 rows -- the version pipeline is built but never activated
11. All 730 documents have `is_auto_generated = false` and no `merge_fields` or `detected_merge_fields` populated yet
12. Format data is inconsistent (mix of `docx`/`DOCX`, `xlsx`/`XLSX`) -- needs normalisation
13. No link between `tga_rto_snapshots` and `generated_documents` -- snapshot referencing not wired

---

## Architecture Decision: Centralised App-Level Auth

All document management SharePoint operations will use a **single app-level Microsoft 365 credential** via the `client_credentials` OAuth grant. This is already proven in `provision-tenant-sharepoint-folder` and eliminates:

- Token expiry issues from individual user sessions
- Permission inconsistencies between user accounts
- Failures during long-running bulk jobs (200+ clients)
- Dependency on any specific user being logged in

**Implementation:** A shared module `supabase/functions/_shared/graph-app-client.ts` will extract and centralise the token acquisition logic currently duplicated in `provision-tenant-sharepoint-folder`. All new and refactored edge functions will import from this module.

**The audit trail still captures the initiating Unicorn user** (who clicked the button), not the service account. The app credential is the transport, not the identity.

**Azure AD requirement:** The app registration must have `Sites.ReadWrite.All` and `Files.ReadWrite.All` **application permissions** (not delegated) with admin consent granted. These are needed for the app to read from Master Documents and write to client folders without a signed-in user.

---

## Build Stages (Revised Order)

### Stage 0: Shared Graph App Client (Foundation)

**Purpose:** Eliminate duplicated auth logic and provide a reliable base for all subsequent stages.

**New file:** `supabase/functions/_shared/graph-app-client.ts`
- `getAppToken()` -- fetches app-level access token using `client_credentials` grant
- `graphGet(path)` / `graphPost(path, body)` -- convenience wrappers with auto token
- `graphUploadSmall(driveId, parentItemId, fileName, content)` -- PUT for files under 4MB
- `graphUploadSession(driveId, parentItemId, fileName, content)` -- upload session for large files
- `graphDownload(driveId, itemId)` -- GET file content

**Refactor:** Update `provision-tenant-sharepoint-folder/index.ts` to import `getAppToken` from the shared module instead of defining it locally.

**Done criteria:** All existing SharePoint provisioning still works. New module tested via the provision function.

---

### Stage 1: SharePoint Site Registry and Folder Resolution

**Purpose:** Guarantee safe, reliable folder mapping before any document operations.

**Database changes:**

1. **Create `sharepoint_sites` table:**
   - `id` (uuid, PK)
   - `site_name` (text) -- e.g. "Master Documents", "Client Files"
   - `site_url` (text)
   - `graph_site_id` (text)
   - `drive_id` (text)
   - `purpose` (text) -- 'master_documents' | 'client_files'
   - `is_active` (boolean, default true)
   - `created_at`, `updated_at` (timestamptz)
   - RLS: Vivacity staff read/write only

2. **Add columns to `dd_document_categories`:**
   - `sharepoint_folder_name` (text, nullable) -- maps category to SharePoint subfolder
   - `sort_order` (integer, nullable)
   - `is_active` (boolean, default true)

3. **Add columns to `tenant_sharepoint_settings`:**
   - `compliance_docs_folder_item_id` (text, nullable) -- Graph driveItemId for the compliance docs subfolder
   - `compliance_docs_folder_name` (text, nullable) -- snapshot of folder name
   - `match_method` (text, default 'manual') -- 'manual' | 'auto_rtoid' | 'auto_name'
   - `verified_by` (uuid, nullable, FK users)
   - `verified_at` (timestamptz, nullable)

**New edge function: `resolve-tenant-folder`**
- Uses app-level auth (from shared module)
- Resolution priority: (1) stored `root_item_id`, (2) search by `rto_id` substring, (3) search by `legal_name` tokens
- Returns candidate matches for manual confirmation -- never auto-maps
- On confirmation: stores `driveItemId`, records `match_method`, `verified_by`, `verified_at`
- Audit logged to `document_activity_log`

**New edge function: `verify-compliance-folder`**
- Given a tenant's root folder, checks for or creates a "Compliance Documents" subfolder
- Stores `compliance_docs_folder_item_id` on `tenant_sharepoint_settings`
- Optionally creates category subfolders within (based on `dd_document_categories.sharepoint_folder_name`)

**UI: SuperAdmin Folder Mapping panel**
- Table of all 401 tenants showing mapping status (mapped/unverified/missing)
- Search and confirm workflow
- Block downstream operations if unmapped

**Guardrails:**
- Block upload if no mapped folder
- Block mapping if tenant mismatch suspected (folder name does not contain tenant ID)
- Audit every mapping change
- Soft-delete mappings (update `is_active`, never hard delete)

---

### Stage 2: Template Governance and Version Integrity

**Purpose:** Prevent silent template drift and ensure published templates are immutable.

**Database changes:**

1. **Add columns to `document_versions`:**
   - `checksum_sha256` (text, nullable) -- file hash at import time
   - `frozen_storage_path` (text, nullable) -- Supabase Storage path in `document-files` bucket
   - `source_site_id` (text, nullable) -- Graph site ID of source
   - `source_drive_item_id` (text, nullable) -- Graph driveItemId of source file
   - `source_path_display` (text, nullable) -- human-readable SharePoint path
   - `published_by` (uuid, nullable)
   - `published_at` (timestamptz, nullable)

2. **Create `document_template_mappings` table:**
   - `id` (uuid, PK)
   - `template_version_id` (uuid, FK document_versions)
   - `mapping_json` (jsonb) -- merge field mapping configuration
   - `checksum_sha256` (text) -- hash of the mapping configuration
   - `created_at` (timestamptz)
   - `created_by` (uuid)

**Data normalisation task:**
- Normalise `documents.format` to lowercase (672 `docx` + 22 `DOCX` should all be `docx`, etc.)

**New edge function: `import-sharepoint-template`**
- Uses app-level auth
- Fetches file from Master Documents SharePoint site
- Calculates SHA256 checksum of file content
- Stores frozen copy in `document-files` Supabase Storage bucket
- Creates `document_versions` record in 'draft' status
- Extracts and records detected merge fields

**Publish workflow (in same or separate edge function):**
- Re-fetches file from SharePoint source
- Re-calculates SHA256 checksum
- If checksum mismatch from draft: **blocks publish** with alert "Source file has changed since import"
- On match: updates `document_versions.status` to 'published', sets `published_by`, `published_at`
- Updates `documents.current_published_version_id`
- **Published versions are immutable** -- cannot be edited, only superseded by a new version

**UI: Template management dashboard**
- Import from SharePoint button (browse Master Documents site)
- Version history with checksum display and source path
- Publish / archive controls
- Merge field mapping editor
- Visual indicator for draft vs published vs archived

**Guardrails:**
- Cannot publish without merge field mappings defined
- Cannot publish if required merge tags are missing from the template
- Cannot modify mappings after publish -- must create a new version
- Version rollback supported (re-publish a prior version)

---

### Stage 3: Idempotent Upload to Client Folders

**Purpose:** Prevent duplicate files and make re-runs safe.

**Database changes -- add columns to `generated_documents`:**
- `sharepoint_drive_item_id` (text, nullable) -- Graph driveItemId of uploaded file
- `sharepoint_web_url` (text, nullable) -- direct link to file in SharePoint
- `upload_mode` (text, default 'versioned') -- 'overwrite' | 'versioned' | 'skip'
- `mapping_checksum` (text, nullable) -- hash of merge data used
- `template_checksum` (text, nullable) -- hash of template version used
- `tga_snapshot_id` (uuid, nullable, FK tga_rto_snapshots) -- moved here from Stage 6 for cleaner design

**Upload logic (embedded in generation edge functions):**
1. Build deterministic filename: `{CategorySlug}/{DocTitle}-{TenantName}-v{VersionLabel}.{ext}`
2. Check if file exists in client's compliance docs folder via Graph API (`search` or `GET by path`)
3. Apply mode:
   - `overwrite` -- PUT replaces existing file
   - `versioned` -- create new SharePoint version (upload to same path, Graph auto-versions)
   - `skip` -- skip if file with same checksums already exists
4. Store `sharepoint_drive_item_id` and `sharepoint_web_url` on the output record
5. If upload fails, set `status = 'failed'` and store `error_message`

**Guardrails:**
- Block upload if tenant has no mapped compliance docs folder (from Stage 1)
- Log every upload to `document_activity_log`
- Re-running generation with identical inputs produces no duplicate files

---

### Stage 4: Tailoring Validation and Risk Flags

**Purpose:** Prevent incomplete compliance documents from being generated or released.

**Database changes:**

1. **Create `document_tailoring_rules` table:**
   - `id` (uuid, PK)
   - `document_id` (bigint, FK documents)
   - `required_fields` (jsonb) -- array of required field codes e.g. `["delivery_mode", "sites", "learner_cohort", "scope"]`
   - `severity` (text) -- 'block' | 'warn'
   - `description` (text, nullable) -- human-readable rule explanation
   - `is_active` (boolean, default true)
   - `created_at` (timestamptz)
   - `created_by` (uuid)

**Pre-generation validation logic:**
- Before generating, check each required field against tenant merge data (`tenant_merge_data.data` + `clients_legacy` fields)
- If severity = 'block' and any field missing: **stop generation**, return error listing missing fields
- If severity = 'warn' and any field missing: proceed but add a watermark/flag and log a risk entry
- Risk flags stored as metadata on `generated_documents.merge_data` (add a `_risk_flags` key)

**UI additions:**
- Risk flags visible on document cards (amber warning icon)
- Tailoring rules editor on document management page (SuperAdmin only)
- Pre-generation validation summary before bulk runs

---

### Stage 5: Bulk Generation Engine with Throttling

**Purpose:** Handle 200+ client runs safely without SharePoint throttling.

**Database changes:**

1. **Create `document_jobs` table:**
   - `id` (uuid, PK)
   - `initiated_by` (uuid, FK users)
   - `job_type` (text) -- 'generate' | 'upload' | 'generate_and_upload'
   - `tenant_scope` (jsonb) -- which tenants are included (all, list, or filter criteria)
   - `template_scope` (jsonb) -- which templates (all, category, specific IDs)
   - `total_items` (integer)
   - `completed` (integer, default 0)
   - `failed` (integer, default 0)
   - `skipped` (integer, default 0)
   - `status` (text) -- 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
   - `error_summary` (text, nullable)
   - `started_at` (timestamptz, nullable)
   - `completed_at` (timestamptz, nullable)
   - `created_at` (timestamptz)

2. **Create `document_job_items` table:**
   - `id` (uuid, PK)
   - `job_id` (uuid, FK document_jobs)
   - `tenant_id` (bigint, FK tenants)
   - `document_id` (bigint, FK documents)
   - `template_version_id` (uuid, FK document_versions, nullable)
   - `status` (text) -- 'queued' | 'validating' | 'rendering' | 'uploading' | 'complete' | 'failed' | 'skipped'
   - `error_message` (text, nullable)
   - `retry_count` (integer, default 0)
   - `generated_document_id` (uuid, FK generated_documents, nullable)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

**New edge function: `run-document-job` (replaces/extends `bulk-generate-phase-documents`)**
- Reads queued items from `document_job_items`
- Processes in batches (max 5 concurrent per tenant, global cap configurable)
- Each item: validate tailoring (Stage 4), generate, upload (Stage 3)
- On Graph API 429: exponential backoff (1s, 2s, 4s, 8s, 16s)
- Dead-letter after 5 retries per item
- Updates job progress in real-time
- Supports pause/resume via `document_jobs.status`

**UI controls:**
- "Generate for one tenant" / "Generate for selected" / "Generate for all"
- Job progress dashboard with real-time counts
- "Retry failed only" button
- "Pause" / "Resume" / "Cancel" controls
- Per-item error visibility

---

### Stage 6: TGA Snapshot Linkage

**Purpose:** Ensure audit defensibility -- every generated document references a specific point-in-time TGA dataset.

**Note:** `tga_rto_snapshots` already exists with `raw_sha256` and `payload` JSONB. The `tga_snapshot_id` column was already added to `generated_documents` in Stage 3.

**Generation rule changes:**
- Before generating for a tenant, check for a recent `tga_rto_snapshots` record (within configurable freshness window, e.g. 7 days)
- If none exists or stale: fetch a new snapshot via existing `tga-fetch-scope` / `tga-sync` functions
- Store `tga_snapshot_id` on the `generated_documents` record
- **Never fetch live TGA data mid-batch** -- all items in a job use the same snapshot per tenant

**No new tables needed** -- the infrastructure already exists.

---

### Stage 7: Client Document Register

**Purpose:** Audit-ready transparency for both Vivacity staff and client admins.

**UI component: Document Register page (tenant-scoped)**
- Filters: category, package, generation date range, status (generated/released/superseded)
- Columns: document title, version, category, generated date, status, TGA snapshot reference, SharePoint link
- Export to CSV
- Accessible to Vivacity staff (full view) and client admins (read-only, their tenant only)
- Clicking a row opens the SharePoint file via `sharepoint_web_url`

---

## Additional Items Identified (Not in Original Prompt)

### A. Format Normalisation
The `documents.format` column has mixed case values (`docx` vs `DOCX`, `xlsx` vs `XLSX`). This should be normalised to lowercase as a data migration before template import begins, to avoid format-matching bugs.

### B. Merge Field Population
All 730 documents currently have empty `merge_fields` and `detected_merge_fields`. The AI analysis pipeline (`ai_analysis_status`) is set to 'pending' for all. Before Stage 2 can work effectively, the `scan-document` / `analyze-document` functions should be run across the document library to populate detected merge fields. This could be a pre-requisite batch job.

### C. sharepoint_shared_sources Seeding
The `sharepoint_shared_sources` table exists but has 0 rows. For the Master Documents site to be usable as a template source, at least one row must be seeded with the Master Documents site's `site_id`, `drive_id`, and root `item_id`. This is a prerequisite for Stage 2's import function.

### D. Provisioning Gap
24 tenants have SharePoint settings but 0 have `provisioning_status = 'success'`. This means the folder provisioning pipeline has not been run yet. Stage 1's folder resolution should account for tenants that may already have manually-created folders in SharePoint that pre-date the Unicorn system.

### E. Document Category Alignment
The `documents.category` column contains raw values (e.g. "Q1-Training & Assessment") while `dd_document_categories` contains label/value pairs. Some documents have numeric categories ("1017", "20") that do not match any category label. A cleanup/reconciliation pass is needed.

### F. `document_versions` Activation
The version tracking table exists but has never been used (0 rows). Stage 2 will activate it, but existing 730 documents should have an initial v1 version record created (pointing to their current `uploaded_files` storage path) so there is a complete audit trail from day one.

### G. Existing Bulk Generation Refactor
The current `bulk-generate-phase-documents` function operates per-stage-instance. Stage 5's job queue should wrap and extend this pattern rather than replace it, maintaining backward compatibility for phase-based generation while adding the new cross-tenant bulk capability.

---

## Recommended Build Sequence

```text
Stage 0  Shared Graph App Client          [Foundation -- unblocks everything]
Stage 1  Site Registry + Folder Resolution [Safety -- must map folders before any writes]
Stage 2  Template Governance + Versions    [Core value -- immutable published templates]
Stage 3  Idempotent Upload Logic           [Safety -- prevent duplicates before bulk runs]
Stage 5  Bulk Generation Engine            [Operational -- handles scale]
Stage 4  Tailoring Validation              [Compliance -- can layer on after engine works]
Stage 6  TGA Snapshot Linkage              [Audit -- leverages existing infrastructure]
Stage 7  Client Document Register          [Visibility -- UI for everything above]
```

Pre-requisite data tasks (can run in parallel with Stage 0/1):
- Normalise `documents.format` to lowercase
- Run merge field detection across 730 documents
- Seed `sharepoint_shared_sources` with Master Documents site
- Reconcile `documents.category` values against `dd_document_categories`
- Create v1 `document_versions` records for existing documents

---

## Files Summary

**New files to create:**
- `supabase/functions/_shared/graph-app-client.ts`
- `supabase/functions/resolve-tenant-folder/index.ts`
- `supabase/functions/verify-compliance-folder/index.ts`
- `supabase/functions/import-sharepoint-template/index.ts`
- `supabase/functions/run-document-job/index.ts`
- UI components for folder mapping, template management, job dashboard, document register

**Files to modify:**
- `supabase/functions/provision-tenant-sharepoint-folder/index.ts` (import shared auth)
- `supabase/functions/generate-document/index.ts` (add idempotent upload, TGA snapshot)
- `supabase/functions/generate-excel-document/index.ts` (same)
- `supabase/functions/bulk-generate-phase-documents/index.ts` (integrate with job queue)
- `supabase/config.toml` (new function entries)

**Database migrations:** 7 migrations across stages (tables, columns, RLS policies, data normalisation)
