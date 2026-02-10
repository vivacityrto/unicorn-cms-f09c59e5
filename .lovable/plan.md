

## Fix: Client Documents Page Not Showing Uploaded Documents

### Root Cause

Documents uploaded through the admin/Vivacity portal are stored in the `portal_documents` table (4 rows exist). The client Documents page was recently built to query a separate `tenant_documents` table (0 rows). The two tables are disconnected -- nothing populates `tenant_documents`.

### Solution

Rewire `ClientDocumentsPage.tsx` to query `portal_documents` instead of `tenant_documents`, using the existing hooks and data model. This avoids creating a parallel data silo and ensures documents shared by Vivacity appear immediately.

### Changes

#### 1. Update `src/components/client/ClientDocumentsPage.tsx`

**Tab: "Shared with you"**
- Query `portal_documents` where `tenant_id = activeTenantId`, `is_client_visible = true`, `direction = 'vivacity_to_client'`, and `deleted_at IS NULL`
- Map `file_name` to the Name column (instead of `title`)

**Tab: "Uploaded by you"**
- Query `portal_documents` where `tenant_id = activeTenantId`, `direction = 'client_to_vivacity'`, and `deleted_at IS NULL`

**Upload handler**
- Insert into `portal_documents` instead of `tenant_documents`
- Set `direction = 'client_to_vivacity'`, `source = 'manual_upload'`, `is_client_visible = true`
- Use the same `portal-documents` storage bucket (already used for downloads)

**Field mapping adjustments**
- `doc.title` becomes `doc.file_name`
- `doc.mime_type` becomes `doc.file_type`
- `doc.uploaded_by_role` badge logic uses `doc.direction` instead (`vivacity_to_client` = "Vivacity", `client_to_vivacity` = "Your team")
- `doc.category` becomes `doc.category_id` (join to `portal_document_categories` or show raw, depending on need)

**Invalidation keys**
- Switch query keys from `["tenant_documents", ...]` to use `portalDocumentsKeys` from `usePortalDocuments.tsx`

#### 2. Optionally reuse existing hooks

The file `src/hooks/usePortalDocuments.tsx` already has `usePortalDocuments(tenantId, direction)`, `useUploadPortalDocument()`, and `useDownloadPortalDocument()`. The client page can import and use these directly instead of inline queries, keeping the codebase DRY.

#### 3. No database migration needed

The `portal_documents` table and its RLS policies already exist and support tenant-scoped access. No schema changes required.

### Technical Detail

| Current (broken) | Fixed |
|---|---|
| Queries `tenant_documents` | Queries `portal_documents` |
| 0 rows returned | 4 rows already present |
| Separate upload path | Uses shared `portal-documents` bucket and `portal_documents` table |
| `title` field | `file_name` field |
| `source` enum (`shared_to_client` / `uploaded_by_client`) | `direction` enum (`vivacity_to_client` / `client_to_vivacity`) |

### Files Modified

| File | Change |
|---|---|
| `src/components/client/ClientDocumentsPage.tsx` | Rewire queries, upload, and field mappings to use `portal_documents` |

### No changes to

- Database schema
- RLS policies
- Storage bucket configuration
- Admin document management pages
- Existing `usePortalDocuments` hooks

