# Add File Upload to Client Files Tab Browser

## Overview
Enable clients to upload files into the SharePoint folder they're currently browsing on the Files tab. Adds one hook field, one new edge function, and one UI block on `ClientFilesPage`.

## Scope (exactly 3 changes)

### 1. `src/hooks/useSharePointBrowser.tsx` — expose current folder ID
Add `currentFolderId` to the returned object. No other changes to the hook (state, queries, navigation, downloads all unchanged → fully backward-compatible for existing consumers including `ClientGovernanceDocumentsPage` and `SharePointFileBrowser`).

### 2. New edge function `supabase/functions/upload-sharepoint-file/index.ts`
Multipart upload endpoint mirroring `browse-sharepoint-folder` auth/tenant/SharePoint-settings patterns.

**Auth flow** (parity with browse function):
- Extract Bearer token from `Authorization` header → 401 if missing.
- `supabaseAdmin.auth.getUser(token)` → 401 if invalid.
- Lookup `public.users` for `tenant_id`, `unicorn_role`, `global_role`.
- SuperAdmin (`global_role='SuperAdmin'` OR `unicorn_role='Super Admin'`) may pass an explicit `tenant_id` override via FormData; non-SuperAdmins always use their own `tenant_id`. Return 400 if no tenant resolved.

**SharePoint settings**:
- Load `tenant_sharepoint_settings` for tenant. Require `is_enabled=true` AND `validation_status='valid'`. Else 400.

**Effective root + parent folder resolution**:
```ts
const useSharedRoot = use_shared_folder === 'true' && !!settings.shared_folder_item_id;
const effectiveRootId = useSharedRoot ? settings.shared_folder_item_id : settings.root_item_id;
const parentFolderId = parent_folder_id?.trim() || effectiveRootId;
if (!parentFolderId) return 400; // no root configured
if (parent_folder_id && parent_folder_id !== effectiveRootId) {
  const ok = await verifyWithinRoot(appToken, drive_id, parent_folder_id, effectiveRootId);
  if (!ok) return 403; // boundary breach
}
```
`verifyWithinRoot` is inlined (copied verbatim from `browse-sharepoint-folder/index.ts` — no cross-function imports).

**Token**: app-level only via `getAppToken()` from `_shared/graph-app-client.ts` (write access via `Sites.Selected`). Do not use user OAuth tokens for uploads — keeps audit attribution to the caller via `user_id` rather than mixing token identities.

**File handling**:
- Parse `multipart/form-data` via `await req.formData()`.
- Reject if no `file` field or `file.size === 0` → 400.
- Reject if `file.size > 52_428_800` → 400 `{ error: "File too large. Maximum 50 MB." }`.
- Sanitise filename: strip path separators (`/`, `\`), trim, fallback to `upload-<timestamp>` if empty. (Defensive — Graph rejects bad names anyway, but cleaner errors.)
- `< 4_194_304` → `graphUploadSmall(drive_id, parentFolderId, fileName, await file.arrayBuffer())`.
- `>= 4_194_304` → `graphUploadSession(drive_id, parentFolderId, fileName, new Uint8Array(await file.arrayBuffer()))`.

**Audit**:
- Insert into `sharepoint_access_log`: `{ user_id: user.id, tenant_id, action: 'upload', drive_id, item_id: uploadedItem.id, file_name: fileName }`. Service-role client bypasses the existing INSERT policy (`user_id = auth.uid()`), which is the same pattern `browse-sharepoint-folder` uses for `download` rows. Schema verified — all required columns present, `created_at` defaulted.
- Audit insert failures are logged but do not fail the request (upload already succeeded server-side).

**Response**: `{ success: true, item_id, file_name, web_url }`.

**CORS**: identical header block to `browse-sharepoint-folder` (allows the same Supabase client headers). Handle `OPTIONS` preflight. Include `corsHeaders` on every response, including errors.

**Config**: edge functions deploy with `verify_jwt = false` by default — we validate in code. No `supabase/config.toml` edit needed.

### 3. `src/pages/client/ClientFilesPage.tsx` — upload UI
Inside the existing `sharedFolderUrl ? (...)` branch, inside `<div className="mt-6 border-t pt-4 space-y-3">`, between the breadcrumb row and the file list:

- Add imports: `useRef` (extend existing React import), `Upload` from `lucide-react`, `toast` from `sonner`.
- Add state: `const [uploading, setUploading] = useState(false);`
- Add ref: `const fileInputRef = useRef<HTMLInputElement>(null);`
- Render an outline `Button` ("Upload file" / "Uploading…" with `Upload` or `Loader2` icon) and a hidden `<input type="file">`.
- On change: 50 MB client-side guard, build `FormData` (`file`, `tenant_id`, `use_shared_folder: 'true'`, optional `parent_folder_id: browser.currentFolderId`), call `supabase.functions.invoke('upload-sharepoint-file', { body: formData })`, toast success/error, `browser.refetch()`, reset `e.target.value`.
- Button placed inside the existing breadcrumb row container (right-aligned via `ml-auto`) so layout stays compact and only renders when `sharedFolderUrl` is truthy.

## Risk Assessment

| Area | Risk | Mitigation |
|---|---|---|
| Boundary enforcement | Client passes arbitrary `parent_folder_id` outside tenant root | `verifyWithinRoot` walks parentReferences against `effectiveRootId` — same logic browse function uses for download |
| RLS on audit log | INSERT policy requires `user_id = auth.uid()` | Service-role client bypasses RLS; `user_id` set to authenticated caller — matches existing `download` audit pattern |
| Token scope | Uploads need write permission | `getAppToken()` uses `Sites.Selected` granted to SharePoint sites; same token used by other write paths (e.g. governance delivery) |
| Large files | Graph rejects >4 MB on simple PUT | Size-based routing to `graphUploadSession` (chunked) |
| Memory | Buffering full file in edge function | 50 MB hard cap keeps memory bounded |
| Existing consumers of hook | Adding `currentFolderId` to return | Purely additive; no breaking change |
| Tenant isolation | SuperAdmin override could leak | Override gated on `isSuperAdmin` check (same as browse function); non-admins ignored with warning log |
| FK constraints | None added | `sharepoint_access_log.user_id` and `tenant_id` already validated by existing FKs |
| RLS policies | None touched | No migration; zero policy changes |
| Backward compatibility | All existing browse/download/navigation behaviour unchanged | Hook addition is purely additive; edge function is new; UI change is additive inside an existing conditional branch |

## Out of Scope (explicitly not touched)
- `browse-sharepoint-folder/index.ts`
- `SharePointFileBrowser.tsx`, `SharePointFolderConfig.tsx`
- `sharepoint_access_log` schema and RLS
- All other pages, hooks, edge functions, or migrations

## Verification After Build
1. Upload a small (<4 MB) file from the Files tab at folder root → appears in browser refresh, `sharepoint_access_log` row recorded with `action='upload'`.
2. Navigate into subfolder → upload → file lands in correct subfolder.
3. Attempt >50 MB → client-side block; bypass client → server returns 400.
4. Confirm `ClientGovernanceDocumentsPage` (other `useSharePointBrowser` consumer) still functions unchanged.
