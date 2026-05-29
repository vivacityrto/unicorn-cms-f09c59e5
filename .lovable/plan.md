## Plan: Fix get-sharepoint-parent-folder 404 bugs

Edit `supabase/functions/get-sharepoint-parent-folder/index.ts` only.

### Changes

**1. Zod schema (line 8)** — make `tenant_id` optional so the frontend keeps working unchanged:
```ts
tenant_id: z.number().int().positive().optional(),
```

**2. Remove tenant gate (lines 49–74)** — delete the service-role `createClient`, the `tenant_sharepoint_settings` query, and both error returns (`spErr`, `!spRow`). The `getUser(token)` auth check is the tenant boundary.

Since `getUser` still needs a Supabase client, retain a minimal client created with `SUPABASE_URL` + `SUPABASE_ANON_KEY` solely to call `auth.getUser(token)`. No DB queries remain. Remove the unused destructure of `tenant_id`.

**3. Fix Bug 1 (lines 88–99)** — replace the invalid `/parent` navigation with a two-step lookup:

```ts
// Step 1: fetch the item to get its parentReference.id
const itemResp = await graphGet<{ parentReference?: { id?: string } }>(
  `/drives/${resolved.driveId}/items/${resolved.itemId}?$select=parentReference`,
);
if (!itemResp.ok) {
  console.warn("[get-sharepoint-parent-folder] item fetch failed:", itemResp.status);
  return json(
    { error: `Failed to fetch drive item (Graph ${itemResp.status})` },
    itemResp.status >= 400 && itemResp.status < 600 ? itemResp.status : 502,
  );
}
const parentId = itemResp.data?.parentReference?.id;
if (!parentId) {
  return json({ error: "Drive item has no parent reference" }, 502);
}

// Step 2: fetch the parent folder
const parentResp = await graphGet<{ id?: string; name?: string; webUrl?: string }>(
  `/drives/${resolved.driveId}/items/${parentId}?$select=id,name,webUrl`,
);
```

The existing `!parentResp.ok` block, `folderUrl = parentResp.data?.webUrl` check, and `{ folder_url }` response remain unchanged.

### Final flow
OPTIONS → method check → Bearer validation → `getUser(token)` → Zod parse → `resolveDriveItemFromSharingUrl` → fetch item (`$select=parentReference`) → read `parentReference.id` → fetch parent (`$select=id,name,webUrl`) → return `{ folder_url: webUrl }`.

### Microsoft Graph v1.0 correctness
- `GET /drives/{drive-id}/items/{item-id}` is the canonical DriveItem retrieval endpoint and `parentReference` is a documented property containing `{ driveId, id, path, ... }`.
- `/drives/{drive-id}/items/{item-id}/parent` is **not** an exposed navigation property on DriveItem in v1.0 — Graph returns 404. The two-step approach is the documented pattern.
- Same drive is used for both calls, so no cross-drive permission issue.
- `$select=parentReference` and `$select=id,name,webUrl` are valid OData projections.

### Error handling preserved
- 401 on missing/invalid Bearer or `getUser` failure — unchanged.
- 400 on Zod failure or invalid JSON — unchanged (tenant_id now optional).
- 422 on `resolveDriveItemFromSharingUrl` throw — unchanged.
- Graph failures propagate status (400–599) or fall back to 502 — same pattern applied to both new calls.
- 502 when `webUrl` missing — unchanged.

### Risk assessment
- **Low.** Surface area limited to one file. Auth boundary preserved via `getUser`. Response shape `{ folder_url }` unchanged, so frontend (`StageDocumentsSection.tsx` and callers of this function) is unaffected.
- **Tenant isolation:** Previously enforced by the existence check on `tenant_sharepoint_settings`. After fix, isolation relies on (a) authenticated user via `getUser`, and (b) Graph app-only client returning data only for SharePoint items the Vivacity app has access to. The `file_url` is already a tenant-bound SharePoint sharing URL stored on documents the user has RLS access to upstream. This matches the user's stated intent ("auth check is the correct and sufficient tenant boundary").
- **Backward compatibility:** Frontend continues sending `tenant_id`; optional schema accepts it without error. No DB schema changes. No other functions touched.
- **Behavioral change:** Six tenants previously blocked with 404 will now succeed. Tenants whose Graph access genuinely fails will still get a Graph-status error surfaced via the improved error toasts.
- **No new failure modes** introduced beyond the two new Graph-status passthroughs, which use the same status-clamping pattern already proven for `parentResp`.