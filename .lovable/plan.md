

## Fix: Governance folder creation should respect `start_folder_name` and use existing client root folder name

### Problem
The `verify-compliance-folder` edge function has two issues:

1. **Wrong parent path**: It creates the governance folder at the drive root (`ensureFolder(driveId, '', tenantFolderName)`), but the governance site likely has a `start_folder_name` configured (e.g., "Client Folder") — same pattern the `resolve-tenant-folder` function already handles.

2. **Name mismatch**: It builds the folder name from scratch using `buildClientFolderName(rto_id, legal_name, name)`, but the user wants it to match the **existing client root folder name** stored in `tenant_sharepoint_settings.root_name`. This ensures the governance folder and client folder share the same name.

### Changes

**File: `supabase/functions/verify-compliance-folder/index.ts`**

1. **Fetch `start_folder_name`** from the `sharepoint_sites` table alongside `graph_site_id` and `drive_id` (line ~86).

2. **Use existing client root folder name** when available: query `tenant_sharepoint_settings.root_name` for the tenant. If it exists, use that as the governance folder name instead of `buildClientFolderName`. Fall back to `buildClientFolderName` if `root_name` is not set.

3. **Pass `start_folder_name` as the parent path** to `ensureFolder` (line ~141) instead of empty string, so the folder is created inside the correct subdirectory (e.g., `Client Folder/91020 - AHMRC of NSW`).

### Technical detail

```text
Before:  ensureFolder(driveId, '',               buildClientFolderName(...))
After:   ensureFolder(driveId, startFolderName,   rootName || buildClientFolderName(...))
```

| File | Change |
|------|--------|
| `supabase/functions/verify-compliance-folder/index.ts` | Fetch `start_folder_name` from site config; prefer `root_name` from tenant settings; create folder under start folder path |

