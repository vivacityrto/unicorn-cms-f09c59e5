

## Use `app_settings.sharepoint_client_folders` for Folder Path

### Problem
The provisioning edge function has the root folder path hardcoded as `const SP_BASE_PATH = "/Client Folder"`. The actual path should come from the `app_settings` table's `sharepoint_client_folders` column, which currently holds `Shared Documents/Client Folder` (URL-encoded as `Shared%20Documents%2FClient%20Folder`).

### Current State
- `app_settings.sharepoint_client_folders` = `Shared Documents/Client Folder`
- The Graph API drive path is relative to the drive root, which *is* "Shared Documents" — so the effective sub-path is just `Client Folder`
- The hardcoded `SP_BASE_PATH = "/Client Folder"` happens to be correct today but won't adapt if the setting changes

### Plan

**File: `supabase/functions/provision-tenant-sharepoint-folder/index.ts`**

1. Remove the hardcoded `const SP_BASE_PATH = "/Client Folder"` constant.
2. After creating the Supabase admin client, fetch the `sharepoint_client_folders` value from `app_settings`.
3. Parse the value: URL-decode it, then strip the leading `Shared Documents/` prefix (since Graph API drive paths are already relative to the drive root which *is* "Shared Documents"). The remainder becomes the base path (e.g., `Client Folder` → `/Client Folder`).
4. If the setting is missing or empty, fall back to `/Client Folder` with a console warning, so existing behaviour is preserved.
5. Use this dynamic path in place of every `SP_BASE_PATH` reference (folder creation and settings storage).

### Technical Detail
- The Graph API `/drives/{driveId}/root:/path:/children` is relative to the document library root ("Shared Documents"), so `Shared Documents/Client Folder` → strip `Shared Documents/` → use `/Client Folder` as the drive-relative path.
- URL-decode with `decodeURIComponent()` before stripping.
- Single query added: `SELECT sharepoint_client_folders FROM app_settings LIMIT 1`.

