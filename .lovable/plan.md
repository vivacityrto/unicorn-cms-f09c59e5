
# Stage 2: Governance Template Integrity, Version Control, and Folder Naming Alignment

## Overview

Stage 2 delivers three interconnected capabilities:
1. **Unified folder naming convention** across both SharePoint sites (Client Success Team and Governance/Clients938)
2. **Template governance** -- import, version, freeze, and publish master document templates with integrity checksums
3. **Governance Documents UI** -- admin interface for managing templates and publishing workflows

All SharePoint operations are **strictly user-initiated** (no automatic provisioning).

---

## Part 1: Unified Folder Naming Convention

### Current State
`provision-tenant-sharepoint-folder` (line 376) builds folder names as:
```
{name} ({id})     e.g. "Precise Training pty Ltd (7509)"
```

### New Convention (applies to both sites)

**With valid RTO ID** (not null, not empty, not "TBA", not "Replacing:"):
```
{rtoId} - {DisplayName}     e.g. "21090 - Precise Training pty Ltd"
```

**Without valid RTO ID** (KickStart clients):
```
KS-{Name}     e.g. "KS-Adelaide Aviation"
```

DisplayName = `legal_name` if present, otherwise `name`.

### Smart Name Truncation (only when display name exceeds 60 characters)

Strip in this order:
1. Trading-as clauses: everything from `T/as`, `t/a`, `Trading as` onwards (including parenthetical forms)
2. Entity suffixes: `Pty Ltd`, `Pty. Ltd.`, `P/L`, `Ltd`, `Limited`, `Inc`, `Incorporated`
3. Trailing punctuation (commas, hyphens, parentheses, whitespace)
4. If still over 60 characters, hard truncate to 60

Examples:
- `Law Enforcement and Security Training Australia Pty Ltd T/as Security Training Academy` becomes `Law Enforcement and Security Training Australia` (47 chars)
- `Australian Further Vocational Training Institute Pty Ltd` becomes `Australian Further Vocational Training Institute` (49 chars)

### Active Tenant Guard

All folder creation operations (provisioning and governance) will only proceed for tenants with `status = 'active'`. Inactive, cancelled, archived, or terminated tenants are blocked with a clear message.

### Add Tenant Dialog: Opt-in Folder Creation

Replace the current auto-provisioning (lines 237-244 in `AddTenantDialog.tsx`) with an opt-in checkbox:
- Checkbox label: "Create SharePoint client folders"
- Default: checked
- If checked and tenant creation succeeds: call `provision-tenant-sharepoint-folder` (Client Success) and `verify-compliance-folder` (Governance)
- If unchecked: no folders created; user can provision later from the mapping dashboard
- Reset to checked on form reset

---

## Part 2: Database Migration

### Add to `public.documents`
| Column | Type | Notes |
|--------|------|-------|
| `source_template_url` | text, nullable | Direct SharePoint link to source template file |

### Add to `public.document_versions`
| Column | Type | Notes |
|--------|------|-------|
| `checksum_sha256` | text, nullable | SHA256 hash at import time |
| `frozen_storage_path` | text, nullable | Supabase Storage path in `document-files` bucket |
| `source_site_id` | text, nullable | Graph site ID of source |
| `source_drive_item_id` | text, nullable | Graph driveItemId of source file |
| `source_path_display` | text, nullable | Human-readable SharePoint path |
| `published_by` | uuid, nullable | Who published this version |
| `published_at` | timestamptz, nullable | When published |

### Add to `public.tenant_sharepoint_settings`
| Column | Type | Notes |
|--------|------|-------|
| `governance_site_id` | text, nullable | Clients938 Graph site ID |
| `governance_drive_id` | text, nullable | Clients938 drive ID |
| `governance_folder_item_id` | text, nullable | Tenant folder item ID on governance site |
| `governance_folder_url` | text, nullable | Web URL of governance folder |
| `governance_folder_name` | text, nullable | Snapshot of created folder name |

### New table: `public.document_template_mappings`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `template_version_id` | uuid, FK document_versions | |
| `mapping_json` | jsonb | Merge field mapping configuration |
| `checksum_sha256` | text | Hash of the mapping config |
| `created_at` | timestamptz | |
| `created_by` | uuid | |

### Data tasks in same migration
1. Normalise `documents.format` to lowercase (25 records with uppercase values)
2. Seed v1 `document_versions` rows for ~730 existing documents that have no version records
3. Seed `sharepoint_sites` row for the Governance site (Clients938)

---

## Part 3: Shared Helpers in `graph-app-client.ts`

Add three exported functions:

**`sanitiseFolderName(name: string): string`**
- Strip SharePoint-illegal characters: `~ " # % & * : < > ? / \ { | }`
- Collapse whitespace, trim, cap at 120 characters

**`stripBusinessSuffixes(name: string): string`**
- Remove trading-as patterns via regex (including parenthetical variants)
- Remove entity type suffixes via regex
- Clean trailing punctuation

**`buildClientFolderName(rtoId: string | null, legalName: string | null, name: string): string`**
- Valid RTO ID: `"{rtoId} - {displayName}"` where displayName = legalName or name
- No valid RTO ID: `"KS-{name}"`
- Apply `stripBusinessSuffixes` only if display name portion exceeds 60 chars
- Final pass through `sanitiseFolderName`

---

## Part 4: Edge Function Updates

### `provision-tenant-sharepoint-folder/index.ts`
1. Update tenant query (line 331) to select `id, name, slug, legal_name, rto_id, status`
2. Add active-tenant guard: return error if `tenant.status !== 'active'`
3. Replace line 376 (`${tenant.name} (${tenant.id})`) with `buildClientFolderName(tenant.rto_id, tenant.legal_name, tenant.name)`
4. Remove the local `sanitiseFolderName` function (lines 26-32) -- use the shared version

### `resolve-tenant-folder/index.ts`
1. Add `site_purpose` parameter: `'client_files'` (default) or `'governance_client_files'`
2. Import and use `buildClientFolderName` for expected folder name matching during search
3. When `site_purpose = 'governance_client_files'`, look up drive from `sharepoint_sites` where `purpose = 'governance_client_files'` and store results in `governance_*` columns
4. Add active-tenant check

### `verify-compliance-folder/index.ts`
1. Target the Governance site (Clients938) instead of Client Success Team site
2. Look up site/drive from `sharepoint_sites` where `purpose = 'governance_client_files'`
3. Use `buildClientFolderName` for tenant folder naming under `Shared Documents/Governance/`
4. Create category subfolders (one per active `dd_document_categories` with `sharepoint_folder_name`)
5. Store results in `governance_*` columns on `tenant_sharepoint_settings`
6. Add active-tenant guard

### New: `import-sharepoint-template/index.ts`

**Action: `import`**
- Download template file from Master Documents SharePoint site via `graphDownload()`
- Calculate SHA256 checksum
- Upload frozen copy to `document-files` bucket at `governance-templates/{document_id}/v{n}/{filename}`
- Create `document_versions` row (status: draft) with checksum, frozen path, source metadata
- Populate `documents.source_template_url` with the file's `webUrl`
- Audit log: `governance_template_imported`

**Action: `publish`**
- Re-download source file from SharePoint, re-calculate SHA256
- If checksum mismatch from draft: return drift error (source file has changed since import)
- If match: set version status to published, set `published_by`/`published_at`, archive previous published version
- Audit log: `governance_template_published`

---

## Part 5: UI Changes

### `AddTenantDialog.tsx`
- Add `createSharePointFolders` state (default: `true`)
- Add checkbox in form near "Auto-assign Consultant"
- Replace lines 237-244 with conditional: only invoke provisioning functions if checkbox is checked
- Add `createSharePointFolders` reset to `resetForm()`

### SharePoint Folder Mapping Dashboard
- Add "Create All Active Client Folders" bulk action button
- Confirmation dialog lists affected tenants before executing
- Progress indicator during bulk operation
- Per-tenant "Create Governance Folder" button for individual provisioning

### New page: `/admin/governance-documents`

**Main table**: Title, Category, Format, Current Version, Status, Source Template link, Last Updated
**Filters**: Category, status, format, search

**Components to create:**
- `GovernanceDocumentDetail.tsx` -- document info card
- `GovernanceVersionHistory.tsx` -- version list with status badges
- `GovernanceImportDialog.tsx` -- SharePoint file picker for importing templates
- `GovernanceMappingEditor.tsx` -- merge field mapping UI
- `GovernancePublishDialog.tsx` -- publish with drift check confirmation

**Navigation**: Add "Governance Documents" to admin sidebar

---

## Part 6: Guardrails

- All operations are user-initiated (no auto-provisioning, no background jobs)
- Active tenants only for all folder creation
- Published template versions are immutable -- cannot be edited, only superseded
- Cannot publish without merge field mappings defined
- Cannot publish if source file has drifted (checksum mismatch)
- Every action audit logged to `document_activity_log`
- Existing provisioned folders (status = 'success') are not renamed

---

## Build Order

1. Database migration (schema changes, data normalisation, v1 seeding, sharepoint_sites seed)
2. Add shared naming helpers to `graph-app-client.ts`
3. Update `provision-tenant-sharepoint-folder` with new naming and active guard
4. Update `resolve-tenant-folder` with `site_purpose` and naming helper
5. Update `verify-compliance-folder` to target Governance site
6. Update `AddTenantDialog.tsx` with opt-in checkbox
7. Build `import-sharepoint-template` edge function
8. Build Governance Documents UI page and components
9. Wire navigation and route

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `supabase/functions/import-sharepoint-template/index.ts` | Template import and publish |
| `src/pages/admin/GovernanceDocuments.tsx` | Main governance page |
| `src/components/governance/GovernanceDocumentDetail.tsx` | Detail panel |
| `src/components/governance/GovernanceVersionHistory.tsx` | Version history |
| `src/components/governance/GovernanceImportDialog.tsx` | Import dialog |
| `src/components/governance/GovernanceMappingEditor.tsx` | Mapping editor |
| `src/components/governance/GovernancePublishDialog.tsx` | Publish dialog |

### Files to Modify
| File | Change |
|------|--------|
| `supabase/functions/_shared/graph-app-client.ts` | Add `sanitiseFolderName`, `stripBusinessSuffixes`, `buildClientFolderName` |
| `supabase/functions/provision-tenant-sharepoint-folder/index.ts` | New naming, active guard, fetch legal_name/rto_id |
| `supabase/functions/resolve-tenant-folder/index.ts` | Add site_purpose, use naming helper |
| `supabase/functions/verify-compliance-folder/index.ts` | Target Governance site, use naming helper |
| `src/components/AddTenantDialog.tsx` | Replace auto-provision with opt-in checkbox |
| `src/App.tsx` | Add `/admin/governance-documents` route |
