## Fix three SharePoint provisioning bugs

### 1. RTO-ID prefix bug — `supabase/functions/_shared/graph-app-client.ts`
In `buildClientFolderName()`, remove the empty-string entry from `invalidRtoPatterns` (since `"anything".startsWith('')` is always `true`, making `hasValidRtoId` false for every tenant). Trim once, then check non-empty separately.

```ts
const invalidRtoPatterns = ['tba', 'replacing:'];
const trimmedRtoId = rtoId?.trim() ?? '';
const hasValidRtoId =
  trimmedRtoId !== '' &&
  !invalidRtoPatterns.some((p) => trimmedRtoId.toLowerCase().startsWith(p));
```

Fixes both `provision-tenant-sharepoint-folder` and `verify-compliance-folder` since they share this helper.

### 2. Default share folder name — `app_settings` data update
Update the `sharepoint_defaultshare` row from `Operations%20Share` to `-%20Operations%20Share` (decodes to `- Operations Share`, matching the `- Governance` convention). Single-row data update, no schema change.

### 3. Nested "- Uploads" folder — `supabase/functions/provision-tenant-sharepoint-folder/index.ts`
Immediately after the existing default-share folder creation block, add a nested `- Uploads` folder creation, guarded on the shared folder having succeeded. Uses the existing idempotent `ensureFolder` helper (409 → fetch existing). Wrapped in try/catch so an Uploads failure is logged but non-fatal.

```ts
if (sharedFolderItemId && sharedFolderName) {
  try {
    await ensureFolder(accessToken, driveId, `${folderPath}/${sharedFolderName}`, "- Uploads");
    console.log("[provision-sp] Uploads subfolder created inside", sharedFolderName);
  } catch (e) {
    console.error("[provision-sp] Failed to create Uploads subfolder:", e);
  }
}
```

### Scope
- No schema, RLS, or migration changes.
- Items 1 and 3: edge-function code only (auto-deploy).
- Item 2: one-row update to `app_settings`.
