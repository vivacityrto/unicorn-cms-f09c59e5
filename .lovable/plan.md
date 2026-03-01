

# Stage 3: Idempotent Upload to Client Folders -- Remaining Work

## Status Check
- **Done**: `governance_document_deliveries` tracking table (created with idempotency indexes, RLS, and audit columns)
- **Remaining**: Edge Function, UI triggers, and delivery history panel

---

## Sub-task 1: `deliver-governance-document` Edge Function

A new Edge Function at `supabase/functions/deliver-governance-document/index.ts` that performs the full delivery pipeline for a single tenant + document version.

### Flow

```text
Request (tenant_id, document_version_id)
  |
  v
Auth check (Vivacity staff only)
  |
  v
Idempotency check -- query governance_document_deliveries
for existing (tenant_id, document_version_id, snapshot_id)
  |-- Already delivered? Return existing record, skip re-upload
  |
  v
Load published version from document_versions (storage_path, file_name)
  |
  v
Download frozen template from Supabase Storage (document-files bucket)
  |
  v
Fetch merge fields from v_tenant_merge_fields for tenant_id
  |
  v
DOCX processing (reuse existing pattern from generate-release-documents):
  - Unzip DOCX archive using zip.js
  - Text replacement: replace {{Tag}} placeholders in XML files
  - Image injection: for image-type fields (e.g. Logo),
    download from client-logos bucket, inject into word/media/,
    add relationship entry, replace placeholder with w:drawing block
  - Re-zip into new DOCX bytes
  |
  v
Resolve tenant's governance folder in SharePoint:
  - Read tenant_sharepoint_settings.governance_drive_id + governance_folder_item_id
  - Resolve category subfolder if document has a document_category
  |
  v
Upload to SharePoint via graphUploadSmall (or graphUploadSession for large files)
  |
  v
Insert record into governance_document_deliveries:
  - status: 'success'
  - sharepoint_item_id, sharepoint_web_url, delivered_file_name
  - snapshot_id (from latest tga_rto_snapshots for this tenant, if available)
  |
  v
Audit log entry in document_activity_log
  |
  v
Return success response with delivery details
```

### Key Design Decisions
- Reuses the proven `processDocxTemplate` pattern from `generate-release-documents` (zip.js-based DOCX manipulation)
- Uses `graph-app-client.ts` shared helpers for SharePoint upload (app-level auth, not user-delegated)
- Snapshot linkage: automatically fetches the latest `tga_rto_snapshots` row for the tenant to populate `snapshot_id`, enabling idempotency
- File naming convention: `{DocumentTitle}_{TenantName}_v{VersionNumber}.docx`
- Category subfolder resolution: looks up `dd_document_categories.sharepoint_folder_name` for the document's category

### Config
- Add `[functions.deliver-governance-document] verify_jwt = false` to `supabase/config.toml`

---

## Sub-task 2: UI -- "Deliver to Client" Trigger

Update `GovernanceDocumentDetail.tsx` to add delivery capability when a published version exists.

### New Component: `GovernanceDeliveryDialog`
A dialog that allows SuperAdmins to:
1. Select one or more active tenants (with governance folders already provisioned)
2. Preview which tenants already have this version delivered (greyed out / skipped)
3. Click "Deliver" to invoke the edge function for each selected tenant
4. See real-time progress (pending / success / failed per tenant)

### UI Changes to GovernanceDocumentDetail
- Add a "Deliver to Clients" button (visible only when a published version exists)
- Button opens the `GovernanceDeliveryDialog`

---

## Sub-task 3: Delivery History Panel

### New Component: `GovernanceDeliveryHistory`
Displayed on the `GovernanceDocumentDetail` page below the version history. Shows:
- Table of all deliveries for this document across tenants
- Columns: Tenant Name, Version, Status, Delivered By, Delivered At, SharePoint Link
- Filter by status (success / failed / pending)
- Link to open the delivered file in SharePoint (via `sharepoint_web_url`)

### Data Query
```sql
SELECT gdd.*, t.name as tenant_name, dv.version_number,
       u.full_name as delivered_by_name
FROM governance_document_deliveries gdd
JOIN tenants t ON t.id = gdd.tenant_id
JOIN document_versions dv ON dv.id = gdd.document_version_id
LEFT JOIN users u ON u.user_uuid = gdd.delivered_by
WHERE gdd.document_id = :documentId
ORDER BY gdd.delivered_at DESC
```

---

## Implementation Sequence

| Step | What | Files |
|------|------|-------|
| 1 | Create Edge Function | `supabase/functions/deliver-governance-document/index.ts`, `supabase/config.toml` |
| 2 | Create DeliveryDialog component | `src/components/governance/GovernanceDeliveryDialog.tsx` |
| 3 | Create DeliveryHistory component | `src/components/governance/GovernanceDeliveryHistory.tsx` |
| 4 | Wire into GovernanceDocumentDetail | `src/components/governance/GovernanceDocumentDetail.tsx` |

No additional database migrations needed -- the `governance_document_deliveries` table is already in place.

