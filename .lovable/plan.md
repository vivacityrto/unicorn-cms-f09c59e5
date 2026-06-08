# Plan: Single SharePoint upload to client Shared Folder

Only `supabase/functions/deliver-governance-document/index.ts` changes.

## 1. Select only shared folder columns (line 967)
Change select to:
```ts
.select("drive_id, shared_folder_item_id")
```

## 2. Remove the governance folder guard (lines 971–991)
Delete the entire `if (!spSettings?.governance_drive_id ...)` block. The shared-folder guard at 993–1013 stays, but the error message already matches the requested copy — verified, no text change required.

## 3. Replace primary upload destination (lines 1015–1017)
Replace with shared-folder resolution that mirrors the previous mirror logic:
```ts
const driveId = spSettings.drive_id as string;
const sharedRootId = spSettings.shared_folder_item_id as string;
let categorySubfolder: string | null = null;

// Resolve shared folder root path
const sharedRootInfo = await graphGet<DriveItem>(
  `/drives/${driveId}/items/${sharedRootId}`,
);
if (!sharedRootInfo.ok) {
  throw new Error(`Could not resolve shared folder root (${sharedRootId})`);
}
const sharedParentRef = sharedRootInfo.data.parentReference as { path?: string } | undefined;
const sharedFullPath = sharedParentRef?.path
  ? `${sharedParentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${sharedRootInfo.data.name}`
  : sharedRootInfo.data.name;
let cleanPath = sharedFullPath.replace(/^\//, '');

// Navigate into "- Governance"
const govSub = await ensureFolder(driveId, cleanPath, "- Governance");
let parentItemId = govSub.itemId;
cleanPath = `${cleanPath}/- Governance`;
```

## 4. Update framework + category subfolder blocks (lines 1020–1070)
Simplify both blocks to use the local `cleanPath` directly (no more `graphGet` round-trip per subfolder — we already track the path):

```ts
const frameworkType = doc.framework_type as string | null;
if (frameworkType) {
  const frameworkFolderName = frameworkType.toUpperCase();
  try {
    const sub = await ensureFolder(driveId, cleanPath, frameworkFolderName);
    parentItemId = sub.itemId;
    cleanPath = `${cleanPath}/${frameworkFolderName}`;
  } catch (e) {
    console.warn(`[deliver] Could not resolve framework subfolder: ${e}`);
  }
}

if (doc.category) {
  const { data: catRow } = await supabase
    .from("dd_document_categories")
    .select("label")
    .eq("value", doc.category)
    .maybeSingle();
  const folderName = catRow?.label || null;
  if (folderName) {
    try {
      const sub = await ensureFolder(driveId, cleanPath, folderName);
      parentItemId = sub.itemId;
      cleanPath = `${cleanPath}/${folderName}`;
      categorySubfolder = folderName;
    } catch (e) {
      console.warn(`[deliver] Could not resolve category subfolder: ${e}`);
    }
  }
}
```

Upload block at 1072–1102 is unchanged — it already uses `driveId` and `parentItemId`.

## 5. Remove mirror block (lines 1106–1148)
Delete the entire mirror try/catch including `let sharedFolderError`.

## 6. Remove `shared_folder_error` from response (line 1239)
Drop that line from the `warnings` object; keep the other three fields.

## Verification
- `driveItem.webUrl` still written to `document_instances.generated_file_url` and the delivery record (lines after 1150 untouched).
- `categorySubfolder` still set and still referenced at line 1197 (`category_subfolder: categorySubfolder`).
- Error path / failure tracking unchanged.
- No other file references `governance_drive_id` / `governance_folder_item_id` for this function's flow.

No other files modified.
