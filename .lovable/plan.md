## Goal
Route shared-root uploads into a dedicated `- Uploads` subfolder under the tenant's shared root in SharePoint, auto-creating it on first use.

## Changes

**File:** `supabase/functions/upload-sharepoint-file/index.ts`

### 1. Add `findOrCreateUploadsFolder` helper
A new async function near the other Graph helpers:
- `GET /v1.0/drives/{drive_id}/items/{rootId}/children?$select=id,name,folder&$filter=name eq '- Uploads'`
- If `value[0]` exists and has a truthy `folder` property, return its `id`.
- Otherwise `POST /v1.0/drives/{drive_id}/items/{rootId}/children` with:
  ```json
  { "name": "- Uploads", "folder": {}, "@microsoft.graph.conflictBehavior": "fail" }
  ```
  Return the created item's `id`.
- Any non-OK Graph response throws; caller maps to 502.

### 2. Wire it in after token acquisition (~line 180)
After `accessToken = await getAppToken()` succeeds, and before the boundary check:

```ts
let parentFolderId = explicitParent || effectiveRootId;

if (useSharedRoot) {
  let uploadsTargetId: string;
  try {
    uploadsTargetId = await findOrCreateUploadsFolder(
      accessToken,
      drive_id,
      effectiveRootId,
    );
  } catch (e) {
    console.error("[upload-sp] Uploads folder resolve failed:", e);
    return jsonResponse(502, { error: "Failed to resolve uploads folder" });
  }
  parentFolderId = uploadsTargetId; // overrides any explicitParent
}
```

`parentFolderId` (currently `const` at line 164) becomes `let`, or is moved/reassigned in this block.

### 3. Skip boundary check when `useSharedRoot`
Update the guard at line 182:
```ts
if (!useSharedRoot && explicitParent && explicitParent !== effectiveRootId) {
  // existing verifyWithinRoot call unchanged
}
```
Rationale: the `- Uploads` folder is created as a direct child of `effectiveRootId`, so traversal is unnecessary.

## Out of scope
- No frontend changes — `ClientFilesPage.tsx` keeps sending `parent_folder_id`; it is now ignored when `useSharedRoot` is true.
- No DB migrations, no new env vars, no changes to non-shared-root upload flow.

## Verification
- Upload with `useSharedFolder=true` on a tenant with no existing `- Uploads` folder → folder created, file lands inside it.
- Upload again → existing folder reused (no duplicate, no error).
- Upload with `useSharedFolder=false` → behaviour unchanged.
- Simulated Graph 5xx on find/create → 502 `{ error: "Failed to resolve uploads folder" }`.
