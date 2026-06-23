# Fix: Dynamic SharePoint Shared Folder URL Resolution

The "Open Shared Folder" button on the Client Files page sometimes 404s because the stored `shared_folder_url` goes stale when the SharePoint folder is renamed/moved. Fix: resolve the live URL from the stored item ID via Graph at click time, and self-heal the stored URL.

## Change 1 — New edge function

**File:** `supabase/functions/resolve-sharepoint-folder-url/index.ts`

- Accept `POST { tenant_id?: number }`.
- Inline `corsHeaders` (matching `browse-sharepoint-folder` style); handle OPTIONS preflight.
- Auth: validate JWT via `createClient` with `SUPABASE_SERVICE_ROLE_KEY` (pattern from `browse-sharepoint-folder` lines 125–161). Look up caller in `users` to read `tenant_id`, `unicorn_role`, `global_role`.
- SuperAdmins may pass an explicit `tenant_id`; regular users are forced to their own.
- Using the service-role client, `SELECT drive_id, shared_folder_item_id FROM tenant_sharepoint_settings WHERE tenant_id = :tenantId`.
- If either field missing → `{ error: "Shared folder not configured" }`, status 400.
- Call `graphGet` from `../_shared/graph-app-client.ts`: `/drives/{drive_id}/items/{shared_folder_item_id}?$select=webUrl`. Return Graph errors with appropriate status.
- Self-heal: `UPDATE tenant_sharepoint_settings SET shared_folder_url = :webUrl, updated_at = now() WHERE tenant_id = :tenantId`.
- Return `{ url: webUrl }`, status 200.
- Wrap in try/catch returning 500 on unexpected errors.

## Change 2 — `src/pages/client/ClientFilesPage.tsx`

- **fetchData select (~line 51):** add `shared_folder_item_id` to the `.select()`.
- **State (~line 36):** add
  - `sharedFolderItemId: string | null`
  - `openingFolder: boolean`
- **fetchData setters (~line 63):** `setSharedFolderItemId(s?.shared_folder_item_id ?? null)`.
- **New handler** `handleOpenFolder`:
  - If no `sharedFolderItemId`, fall back to opening the stored `sharedFolderUrl`.
  - Otherwise set `openingFolder=true`, invoke `resolve-sharepoint-folder-url` with `{ tenant_id: tenantId }`, open returned `data.url` in a new tab.
  - On error: open stored `sharedFolderUrl` if present and toast "Could not resolve the folder URL. Opening last known link instead."
  - Always clear `openingFolder` in `finally`.
- **Replace button (lines 109–114):** swap the anchor for a `<Button onClick={handleOpenFolder} disabled={openingFolder}>` showing `Loader2` (spinning) while loading, otherwise `ExternalLink`, label "Open Shared Folder". `Loader2` is already imported.

## Scope / non-goals

- No DB migrations; `shared_folder_item_id` is assumed to already exist on `tenant_sharepoint_settings`.
- No changes to other pages, components, or edge functions.
- RLS unchanged — function uses service role after validating the JWT, mirroring existing SharePoint functions.
