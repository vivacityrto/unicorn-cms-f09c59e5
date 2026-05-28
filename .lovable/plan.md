# Shared Folder URL — Capture & Expose to Client Portal

## Goal
Persist the SharePoint `web_url` of the shared folder when a SuperAdmin picks it, then surface it in the client portal Files page as an "Open Shared Folder" button.

---

## 1. Database migration (additive only)

`public.tenant_sharepoint_settings`:
- Add column `shared_folder_url text NULL` (nullable, no default, no constraint).
- No changes to other columns, indexes, RLS policies, grants, triggers, or FKs.
- Existing rows remain valid (NULL = legacy row, handled gracefully by UI).
- The existing `updated_at` trigger continues to fire unchanged.

After migration, `src/integrations/supabase/types.ts` will be regenerated automatically — no manual edits.

## 2. Admin — `src/components/client/SharePointFolderConfig.tsx`

Scope: **`SharedFolderSection` only.** `GovernanceFolderSection`, root config, validation, provisioning, status badges — all untouched.

Changes:
- `SharePointSettings` interface (line 42–62): add `shared_folder_url: string | null;`.
- Prop type for `sharedFolderBrowseItems` / setter: widen item shape from `{ id; name; is_folder }` to `{ id; name; is_folder; web_url }`.
- Prop type for `sharedFolderBrowseStack` / setter: widen from `{ id; name }` to `{ id; name; web_url }`. The parent component's `useState` initializers will need the same widening — caller-side type only, no behavior change.
- `loadFolder`: in the `.filter((i) => i.is_folder)` map, preserve `web_url` from the edge function response (already returned by `browse-sharepoint-folder`, currently dropped).
- `navigateInto(folderId, folderName, webUrl)`: accept and push `web_url` onto the stack; update the click handler in the folder list to pass `item.web_url`.
- `selectAsSharedFolder(folderId, folderName, webUrl)`: accept third arg, include `shared_folder_url: webUrl` in the update payload. Keep `updated_at: new Date().toISOString()` (DB trigger relies on it being present in payload per the request).
- The "Use ... as Shared Folder" button (line 1063–1071) pulls the current stack entry's `web_url` and passes it through.
- `clearSharedFolder`: include `shared_folder_url: null` in the update payload. Keep `updated_at` field as-is.

No changes to: governance section, root folder browsing, validation buttons, provisioning flow, or anything outside `SharedFolderSection` and its caller-provided state types.

## 3. Client — `src/pages/client/ClientFilesPage.tsx`

- Extend the `tenant_sharepoint_settings` select to include `shared_folder_name, shared_folder_url`.
- Add local state `sharedFolderName: string | null` and `sharedFolderUrl: string | null` populated from the same query (unconditional — not gated by `client_access_enabled` or `provisioning_status`).
- Insert a new `<Card>` between the existing "Client SharePoint Folder" card and the "Reference Library" card:
  - Title: `Shared Folder` with `FolderOpen` icon (already imported).
  - Description: `Your organisation's shared document folder.`
  - Body:
    - If `sharedFolderName` is set and `sharedFolderUrl` is set → folder name + `Open Shared Folder` button (`<a target="_blank" rel="noopener noreferrer">`).
    - If `sharedFolderName` is set but `sharedFolderUrl` is null → folder name only, no button (legacy row support).
    - If `sharedFolderName` is null → muted text: `Your shared folder hasn't been configured yet. Contact your Vivacity consultant.`
- Skeleton/loading branch unaffected.

No new RLS, no new hooks, no AI logic, no business rules.

---

## Technical Details

### Edge function alignment
`supabase/functions/browse-sharepoint-folder` already returns `web_url` for every item (confirmed via `SharePointItem` interface in `useSharePointBrowser.tsx`). No edge function change required.

### RLS / Grants
`tenant_sharepoint_settings` RLS continues to govern read access for clients via existing tenant-membership policies. Adding a nullable column requires no policy or grant changes. The client `select` runs under `authenticated` role and only adds two columns to the existing column list — same access path as `root_folder_url` today.

### Backward compatibility
- Existing rows: `shared_folder_url` defaults to NULL. Admin UI's "Change" button re-saves with the URL, eliminating legacy NULLs over time. Client UI renders the legacy case (name only, no button) gracefully.
- Existing callers of `tenant_sharepoint_settings` (e.g., `SharePointFileBrowser`, `useSharePointBrowser`, governance flows) do not reference `shared_folder_url` and are unaffected.

### Audit
Schema change is additive; no destructive migration. Admin update path continues to flow through the same `tenant_sharepoint_settings` row, so any existing `updated_at` trigger / audit hook continues to fire.

---

## Files Touched

```text
supabase/migrations/<new>.sql                          (additive column)
src/components/client/SharePointFolderConfig.tsx       (SharedFolderSection + state types only)
src/pages/client/ClientFilesPage.tsx                   (query + new card)
src/integrations/supabase/types.ts                     (auto-regenerated)
```

## Out of Scope (Explicit)
- GovernanceFolderSection or root folder config in `SharePointFolderConfig.tsx`
- RLS policies, grants, or new tables
- Edge function changes
- Gating the new client card on `client_access_enabled` or `provisioning_status`
- Removing `updated_at` from any update payload
- Frontend AI suggestions

---

## Summary, Benefits, Risks

**Summary.** One additive `text NULL` column, one localized edit inside `SharedFolderSection` to thread `web_url` through browse → stack → save, and a new always-rendered card on the client Files page.

**Benefits.**
- Clients gain one-click access to their shared SharePoint folder without consultant intervention.
- Eliminates a manual support touchpoint while preserving the existing admin picker UX.
- Fully backward-compatible: legacy rows continue to render; re-saving auto-populates the URL.

**Risk assessment.**
- *Schema risk:* Negligible. Nullable additive column, no constraints, no policy changes, types auto-regenerate.
- *Admin UI risk:* Low. Changes are scoped to one section; widened tuple types are caller-local. No behavior change for governance/root flows.
- *Client UI risk:* Very low. New card is purely read-only; uses `target="_blank" rel="noopener noreferrer"` for safe external navigation.
- *RLS / tenancy:* Unchanged. New column inherits existing row-level policies. Cross-tenant exposure not possible.
- *FK constraints:* None added or affected.
- *Audit trail:* Preserved — `updated_at` retained, single-row update path unchanged.
- *Backfill:* None required. Admins repopulating via UI is sufficient.
