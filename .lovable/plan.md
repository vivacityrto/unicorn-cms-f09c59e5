# Shared Folder Boundary Fix + Inline Browser on Client Files

Three surgical changes across three files. No DB, RLS, FK, or schema changes. No new tables, columns, or policies.

---

## Change 1 — `supabase/functions/browse-sharepoint-folder/index.ts`

**Problem**: `useSharedRoot` / `effectiveRootId` are computed only inside the `list` action block. Both the list-action subfolder check (line 272-273) and the download-action verification (line 348-349) hardcode `root_item_id` as the boundary. When a caller passes `use_shared_folder: true`, the start folder is correctly narrowed but the access boundary still allows traversal up to the configured tenant root — meaning a user could craft `folder_id` / `item_id` requests targeting siblings of the shared folder.

**Fix**: Hoist boundary resolution to a single top-level computation immediately after `spSettings = settings` (right after line 221, inside the `else` branch but before the token block at line 224):

```ts
spSettings = settings as Record<string, unknown>;
drive_id = settings.drive_id;
root_item_id = settings.root_item_id;
root_name = settings.root_name || "SharePoint";
```

Then, after the `if (sitePurpose) { ... } else { ... }` block closes (after line 222), add at top level:

```ts
const useSharedRoot =
  !sitePurpose &&
  body.use_shared_folder === true &&
  !!spSettings?.shared_folder_item_id;
const effectiveRootId: string | null = useSharedRoot
  ? (spSettings!.shared_folder_item_id as string)
  : root_item_id;
```

Then update the two action blocks:

**List action (lines 257-281)** — remove the duplicate local declarations:
```ts
const useSharedRoot = body.use_shared_folder === true && spSettings?.shared_folder_item_id;
effectiveRootId = useSharedRoot ? (spSettings!.shared_folder_item_id as string) : root_item_id;
```
Keep the `folderId` resolution (`(body.folder_id as string) || effectiveRootId!`) and replace the boundary check:
```ts
// Before:
if (folderId !== root_item_id && root_item_id) {
  const withinRoot = await verifyWithinRoot(accessToken, drive_id, folderId, root_item_id);
// After:
if (folderId !== effectiveRootId && effectiveRootId) {
  const withinRoot = await verifyWithinRoot(accessToken, drive_id, folderId, effectiveRootId);
```
For `sitePurpose` mode, `effectiveRootId` stays `null` (set in the `if (sitePurpose)` branch at line 264 — that branch's local `effectiveRootId = null` is removed since the top-level binding covers it; we re-resolve `folderId = (body.folder_id as string) || "root"` only when `sitePurpose`).

To keep the sitePurpose branch behaviour bit-for-bit identical, the structure becomes:
```ts
let folderId: string;
if (sitePurpose) {
  folderId = (body.folder_id as string) || "root";
} else {
  folderId = (body.folder_id as string) || effectiveRootId!;
  if (folderId !== effectiveRootId && effectiveRootId) {
    const withinRoot = await verifyWithinRoot(accessToken, drive_id, folderId, effectiveRootId);
    if (!withinRoot) { /* 403 */ }
  }
}
```

The `is_root` calculation at line 329 changes from `folderId === effectiveRootId` to the same (already correct under new binding); the local `displayRootName` block (lines 319-323) can reuse the hoisted `useSharedRoot` instead of recomputing.

**Download action (lines 347-356)** — replace boundary:
```ts
// Before:
if (!sitePurpose && root_item_id) {
  const withinRoot = await verifyWithinRoot(accessToken, drive_id, itemId, root_item_id);
// After:
if (!sitePurpose && effectiveRootId) {
  const withinRoot = await verifyWithinRoot(accessToken, drive_id, itemId, effectiveRootId);
```

Nothing else changes: auth, token refresh, app-token fallback, SuperAdmin tenant override, audit log inserts, `list_drives` diagnostic, CORS, and the `sitePurpose` global-site branch are untouched.

**Backward compatibility**: All current callers either omit `use_shared_folder` or pass `false`. For those callers `useSharedRoot` evaluates to `false` and `effectiveRootId === root_item_id` — identical bytes through the verification path. Only `use_shared_folder: true` callers (the new client Files browser) see tightened behaviour, which is the explicit goal.

---

## Change 2 — `src/hooks/useSharePointBrowser.tsx`

**Problem**: `downloadFile` (lines ~135-167) posts `action: 'download'`, `tenant_id`, `item_id` but omits `use_shared_folder`. After Change 1 the edge function derives `effectiveRootId` from `use_shared_folder`, so a hook initialised with `{ useSharedFolder: true }` would browse inside the shared folder but downloads would be verified against the wider tenant root — inconsistent boundary.

**Fix**: In the `supabase.functions.invoke('browse-sharepoint-folder', { body: { ... } })` call inside `downloadFile`, add one field:
```ts
body: {
  action: 'download',
  tenant_id: tenantId,
  item_id: itemId,
  use_shared_folder: useSharedFolder,
}
```
`useSharedFolder` is already resolved at the top of the hook (`const useSharedFolder = options?.useSharedFolder ?? false;`). When `false` (every existing caller — Governance picker, admin picker, etc., which all use the default), this sends `use_shared_folder: false`, matching today's behaviour exactly.

Nothing else in the hook changes: the browse `useQuery`, navigation stack, auto-navigate effect, `navigateToFolder`/`Back`/`Root`, and exported shape are untouched.

---

## Change 3 — `src/pages/client/ClientFilesPage.tsx`

**Add inline folder browser** inside the existing "Shared Folder" card, only when `sharedFolderUrl` is set. The "not configured" branch and the Reference Library card remain unchanged.

### Imports
Add to the existing imports:
```tsx
import { Folder, FileText, ChevronLeft, Download, Loader2 } from 'lucide-react';
import { useSharePointBrowser } from '@/hooks/useSharePointBrowser';
```
(Keep the existing `FolderOpen, ExternalLink, BookOpen` imports.)

### Hook
At the top of the component, after the existing state declarations:
```tsx
const browser = useSharePointBrowser(tenantId, { useSharedFolder: true });
```
The hook is safe with `tenantId === null` — its internal `useQuery` is gated by `enabled: !!user && (!!tenantId || !!sitePurpose)`.

### UI
Inside the existing `sharedFolderUrl ? (...)` branch of the Shared Folder card, **below** the existing `sharedFolderName` paragraph and the "Open Shared Folder" `<Button asChild>` (do not move or modify them), append a browser block:

```tsx
<div className="mt-6 border-t pt-4 space-y-3">
  {/* Breadcrumb */}
  <div className="flex items-center gap-2 text-sm">
    {browser.folderStack.length > 0 && (
      <Button variant="ghost" size="sm" onClick={browser.navigateBack}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>
    )}
    <nav className="flex items-center gap-1 text-muted-foreground flex-wrap">
      <button
        className="hover:text-foreground"
        onClick={browser.navigateToRoot}
      >
        {sharedFolderName ?? 'Shared Folder'}
      </button>
      {browser.folderStack.slice(1).map((seg, i) => (
        <span key={`${seg.id}-${i}`} className="flex items-center gap-1">
          <span>/</span>
          <span>{seg.name}</span>
        </span>
      ))}
    </nav>
  </div>

  {/* Body */}
  {browser.isLoading ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  ) : browser.error ? (
    <p className="text-sm text-destructive">
      {(browser.error as Error).message || 'Failed to load folder contents.'}
    </p>
  ) : browser.items.length === 0 ? (
    <p className="text-sm text-muted-foreground py-4">This folder is empty.</p>
  ) : (
    <ul className="divide-y rounded-md border">
      {browser.items.map(item => (
        <li key={item.id} className="flex items-center gap-3 p-2.5">
          {item.is_folder ? (
            <>
              <Folder className="h-4 w-4 text-primary shrink-0" />
              <button
                className="text-sm font-medium text-left flex-1 hover:underline"
                onClick={() => browser.navigateToFolder(item.id, item.name)}
              >
                {item.name}
              </button>
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{item.name}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={browser.downloading === item.id}
                onClick={() => browser.downloadFile(item.id, item.name)}
              >
                {browser.downloading === item.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
              </Button>
            </>
          )}
        </li>
      ))}
    </ul>
  )}
</div>
```

### What stays untouched
- Page heading, description, loading skeleton
- The whole `sharedFolderUrl == null` branch ("Your shared folder hasn't been configured yet…")
- Reference Library card and its query
- Existing `fetchData` effect; `sharedFolderName` / `sharedFolderUrl` state

---

## Deep-dive findings & risk assessment

**Edge function audit**: `sharepoint_access_log` inserts already use `folderId` / `itemId` as supplied — no change needed; audit captures the same verifiable subtree boundary. SuperAdmin tenant override happens before the spSettings load, so the hoisted `effectiveRootId` correctly reflects the *target* tenant's shared folder.

**Hook callers verified safe**: `useSharePointBrowser` is used in: Governance folder picker (admin), admin shared-folder picker, site-config browsers, master documents — none of them pass `useSharedFolder: true`. The new client Files browser is the only `true` caller; the existing client Governance Documents flow does not use this hook (it uses `document_instances` + signed URLs).

**RLS / FKs / DB**: No DB touched. `tenant_sharepoint_settings.shared_folder_item_id` already exists and is read at line 220-area; if a tenant has no shared folder configured, `useSharedRoot` falls back to `false` and `effectiveRootId === root_item_id`, so the boundary is never *looser* than before.

**Edge cases**:
- `shared_folder_item_id IS NULL` with `use_shared_folder: true` → `useSharedRoot = false`, falls back to root_item_id. List-action `folderId` would default to `root_item_id`, the start folder name display falls back to `root_name`. Safe.
- Client `tenantId === null` → hook query disabled, no requests. UI renders empty breadcrumb (the `sharedFolderUrl` gate already prevents the browser block from rendering since `fetchData` populates both together).
- `verifyWithinRoot` boundary tightening can never grant *more* access — it only narrows. Zero regression risk for current callers.

**Test surface to spot-check post-deploy**:
1. Open client Files → confirm browser lists shared folder children, breadcrumb renders, navigate in/out works, download works.
2. Confirm Governance folder picker (admin) still browses tenant root unchanged.
3. Confirm a tenant with no `shared_folder_item_id` still shows the existing "Open Shared Folder" button without error.

## Summary

- **Edge function**: hoist `useSharedRoot` / `effectiveRootId` to top level; apply to both list and download `verifyWithinRoot` calls. Boundary now matches the start folder when `use_shared_folder: true`.
- **Hook**: `downloadFile` forwards `use_shared_folder: useSharedFolder` so server boundary matches the browse mode.
- **Client Files page**: add inline browser inside the existing card (when configured), with breadcrumb, back button, folder/file list, download, loading/error/empty states. No other UI touched.

**Benefits**: closes a server-side privilege gap for shared-folder mode; gives clients an in-app file browser without leaving the page; keeps every existing caller bit-identical.

**Risk**: low. All changes are additive or boundary-tightening; no DB, RLS, or contract changes; existing callers exercise the unchanged code path.
