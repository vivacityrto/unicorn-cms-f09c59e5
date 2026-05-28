# Fix ClientGovernanceDocumentsPage data source

Single file change: `src/components/client/ClientGovernanceDocumentsPage.tsx`

## Changes

1. **Replace `queryFn`** in the `useQuery` call to query `document_instances` (filtered by `tenant_id` + `status = 'generated'`) joined to `documents` (for description/category/framework_type) and `stage_instances → package_instances → packages` (for package name). Enrich rows with labels from `dd_document_categories` and `dd_governance_framework` lookup maps, then sort by category sort_order then title.

2. **Bump `queryKey`** to `["client-governance-documents-v2", activeTenantId]` to bust the old cache.

3. **Replace `handleDownload`** to open `row.file_path` (a direct URL from `generated_file_url`) in a new tab via `window.open(..., "_blank", "noopener,noreferrer")`.

4. **Remove** the `STORAGE_BUCKET` constant and any `supabase.storage` import/usage — no longer needed.

## Out of scope

UI, filters, empty states, access guard, `GovernanceDocRow` type shape, and all other code remain untouched.

## Risk

Very low. Read-only client query against existing tables with established RLS. No schema, RLS, or backend changes.
