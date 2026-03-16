

# Update UNICORN drive_id via existing edge function

## Problem
UNICORN moved from a subfolder inside "Shared Documents" to its own document library. This means it has a new `drive_id`. The current `drive_id` in `sharepoint_sites` points to the old "Shared Documents" library.

## Approach — No new function

Add a temporary `list_drives` action to the **existing** `browse-sharepoint-folder` function. This is a ~10-line addition that calls `GET /sites/{siteId}/drives` using the existing `graphGet` helper.

### Steps

1. **Add `list_drives` action** to `browse-sharepoint-folder/index.ts`
   - When `action === 'list_drives'` and `site_purpose` is provided, fetch the `graph_site_id` from `sharepoint_sites` and call `GET /sites/{siteId}/drives`
   - Return a clean list: `{ name, id, webUrl }` for each drive
   - Restricted to SuperAdmin only

2. **Deploy and call it** via curl to get the new UNICORN drive_id

3. **Update `sharepoint_sites`** table:
   - Set `drive_id` to the new UNICORN library drive_id
   - Set `start_folder_name` to `NULL` (UNICORN is now the library root, not a subfolder)

4. **Remove the `list_drives` action** from the function (clean up)

### Why this works
- Reuses existing auth, CORS, and Graph token infrastructure
- No new function to deploy/manage
- The `graphGet` helper and `graph_site_id` are already available
- Minimal code change, easy to revert

