# Client Files Tab — Shared Folder Link + Inline Browser

**Date:** 28 May 2026
**Author:** Khian (Brian)
**Type:** Feature — Lovable deployment (1 migration, 3 frontend/edge function changes)
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable)

---

## What shipped

### Feature — Shared folder link and inline browser on client Files tab

Carl's task: surface the tenant's configured shared folder (the "Shared Folder for Insert Link" set by AJ/Ezel in the admin SharePoint config) directly on the client-facing Files tab.

**Four Lovable deploys, shipped iteratively:**

---

**Deploy 1 — Schema + admin save + initial client card**

Added `shared_folder_url TEXT NULL` to `tenant_sharepoint_settings`. The `SharedFolderSection` in `SharePointFolderConfig.tsx` previously saved only `shared_folder_item_id` and `shared_folder_name` when an admin selected a folder. It now also saves `shared_folder_url` (the folder's web address, already returned by the `browse-sharepoint-folder` edge function but previously dropped from state). Clear also nulls out the new column.

`ClientFilesPage.tsx` updated to fetch and display the new column as a "Shared Folder" card with an "Open Shared Folder" link button. Three states:
- URL set → folder name + link button
- URL null → "Your shared folder hasn't been configured yet."

No RLS changes — `shared_folder_url` inherits existing `tenant_sharepoint_settings` policies (tenant SELECT, Vivacity UPDATE, superadmin DELETE).

---

**Deploy 2 — Removed root folder card; fixed card condition**

Removed the legacy "Client SharePoint Folder" card (which linked to the tenant root folder URL and was gated on `client_access_enabled && provisioning_status === 'success'`). Design decision: the Files tab now shows only the shared folder, not the root folder.

Also fixed the shared folder card condition: previously showed the folder name with no button when `shared_folder_name` was set but `shared_folder_url` was null (legacy rows). Changed to gate entirely on `shared_folder_url` — if no URL, show "not configured" regardless of whether a name is stored. Avoids a dead-end half-state for clients.

---

**Deploy 3 — Inline folder browser (main feature)**

Added embedded SharePoint folder browser inside the shared folder card, below the "Open Shared Folder" button. Uses existing `useSharePointBrowser(tenantId, { useSharedFolder: true })` hook — the `use_shared_folder: true` path was already implemented in `browse-sharepoint-folder` and the hook, just never wired to the client portal.

Browser features: breadcrumb navigation, back button, folder list (click to navigate in), file list with per-file download button, loading/error/empty states. Only renders when `sharedFolderUrl` is set.

No new edge functions, no schema changes. Audit logging via `sharepoint_access_log` already in place.

---

**Deploy 4 — Boundary hardening (security fix)**

Identified that `browse-sharepoint-folder` verified folder/file access against `root_item_id` even when `use_shared_folder: true` was passed, meaning the starting folder was narrowed to the shared folder but the access boundary remained the full tenant root. A technically sophisticated user could craft a direct API call to access sibling folders within the tenant root.

Two fixes:
1. **Edge function** (`browse-sharepoint-folder/index.ts`): hoisted `useSharedRoot`/`effectiveRootId` computation to top level (outside action blocks). Both the `list` action `verifyWithinRoot` check and the `download` action `verifyWithinRoot` check now use `effectiveRootId` as the boundary. When `use_shared_folder: true`, `effectiveRootId = shared_folder_item_id`; otherwise `effectiveRootId = root_item_id`. Zero behaviour change for all existing callers that do not pass `use_shared_folder: true`.
2. **Hook** (`useSharePointBrowser.tsx`): `downloadFile` previously did not pass `use_shared_folder`. Added `use_shared_folder: useSharedFolder` to the download request body so the download boundary matches the browse boundary.

---

## Changes

### Migrations
- `20260528043747` — `ALTER TABLE public.tenant_sharepoint_settings ADD COLUMN IF NOT EXISTS shared_folder_url text NULL`

### Frontend / Edge functions
- `src/components/client/SharePointFolderConfig.tsx` — `SharedFolderSection` saves + clears `shared_folder_url`
- `src/pages/client/ClientFilesPage.tsx` — shared folder card, root folder card removed, inline browser added
- `supabase/functions/browse-sharepoint-folder/index.ts` — `effectiveRootId` hoisted; list + download boundaries tightened
- `src/hooks/useSharePointBrowser.tsx` — `downloadFile` passes `use_shared_folder`

**Codebase at close:** `unicorn-cms-f09c59e5 @ a30052a0`

---

## Key decisions made this session

- **Client Files tab shows shared folder only, not root folder.** The legacy "Client SharePoint Folder" card (root folder link) was removed. The shared folder is the curated access point for clients.
- **Shared folder card not gated on `client_access_enabled`** — that flag was for the root folder provisioning flow. The shared folder is independent.
- **Inline browser scoped to shared folder subtree only.** Clients cannot navigate above or outside the shared folder. The "Open Shared Folder" button still opens SharePoint directly (no boundary enforcement in SharePoint's own UI).
- **`shared_folder_url` null for 14 existing tenants.** AJ and Ezel to re-select the shared folder for each via the admin SharePoint config — this populates the URL and activates the link button and browser. List of 14 tenants provided to AJ/Ezel.

---

## Verification

- `shared_folder_url` column confirmed in live DB: `text`, `is_nullable: YES`, no default ✅
- RLS unchanged: `rowsecurity = true`; all 6 policies on `tenant_sharepoint_settings` confirmed identical to pre-session state ✅
- No triggers added or modified ✅
- `effectiveRootId` hoisted: confirmed in edge function source — `const effectiveRootId` at top level, `root_item_id` no longer used directly in either `verifyWithinRoot` call ✅
- `use_shared_folder` in download: confirmed in hook source at line 142 ✅
- `ClientFilesPage.tsx`: root folder card absent, shared folder card gates on `sharedFolderUrl`, browser renders only when `sharedFolderUrl` set ✅
- Smoke tested: client view for Adelaide Aviation showed "not configured" message (no URL yet — expected). Test RTO B confirmed working post admin re-selection. ✅

---

## Open questions parked

- **Deactivated client users**: `browse-sharepoint-folder` checks `users.tenant_id` but does not verify `tenant_members` active status. A deactivated client whose `users.tenant_id` is still set can browse their own tenant's shared folder. Risk is low (own tenant only, browse-only), but worth hardening. Flag to Carl as a follow-up edge function check (`has_tenant_access_safe()` or equivalent).
- **14 tenants with null `shared_folder_url`**: AJ/Ezel re-selection required. Until done, those clients see "not configured" message. No data loss or broken state.

## Tag
audit-2026-05-28-client-files-shared-folder-browser
