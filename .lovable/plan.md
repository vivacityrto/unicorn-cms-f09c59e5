

# Fix: Subfolder Resolution and DOCX Image Relationship Injection

Two bugs in `supabase/functions/deliver-governance-document/index.ts`.

---

## Bug 1: Subfolder Resolution Path

**Problem**: At line 332, `ensureFolder` is called with `parentInfo.data.name` (just the folder name, e.g. `"41234 - Acme Corp"`) instead of the full root-relative path. The `ensureFolder` function constructs its Graph URL as `/drives/{driveId}/root:/{parentPath}:/children`, so it needs the complete path from the drive root.

**Fix**: Reconstruct the full root-relative path from `parentInfo.data.parentReference.path` + folder name, stripping the `/drives/{id}/root:` prefix. This matches the pattern used in `verify-compliance-folder/index.ts` (lines 196-202).

**Changed lines**: ~328-336 in `deliver-governance-document/index.ts`

Replace:
```typescript
if (parentInfo.ok && parentInfo.data.webUrl) {
  const sub = await ensureFolder(
    driveId,
    parentInfo.data.name || "",
    catRow.sharepoint_folder_name,
  );
  parentItemId = sub.itemId;
}
```

With:
```typescript
if (parentInfo.ok) {
  const parentRef = parentInfo.data.parentReference as { path?: string } | undefined;
  const fullPath = parentRef?.path
    ? `${parentRef.path.replace(/^\/drives\/[^/]+\/root:/, '')}/${parentInfo.data.name}`
    : parentInfo.data.name;
  const cleanPath = fullPath.replace(/^\//, '');
  const sub = await ensureFolder(driveId, cleanPath, catRow.sharepoint_folder_name);
  parentItemId = sub.itemId;
}
```

---

## Bug 2: Missing Image Relationship Entries in DOCX

**Problem**: The `processDocxTemplate` function injects images into `word/media/` and replaces placeholders with `<w:drawing>` blocks that reference `r:embed="rIdImg100"`, but it never adds the corresponding `<Relationship>` entry into `word/_rels/document.xml.rels`. Without this, Word cannot find the embedded image and the document will be corrupt or show a broken image.

**Fix**: After processing all XML entries, when we encounter `word/_rels/document.xml.rels`, inject the `<Relationship>` elements for each image before closing the `</Relationships>` tag.

**Changes in `processDocxTemplate` function** (~lines 47-92):

When processing `word/_rels/document.xml.rels`, append relationship entries for each image injection before the closing `</Relationships>` tag:

```typescript
// Inside the XML processing block, after merge field replacement:
if (entry.filename === 'word/_rels/document.xml.rels' && imageInjections.length > 0) {
  const relEntries = imageInjections.map(
    (img) =>
      `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`
  ).join('');
  content = content.replace('</Relationships>', relEntries + '</Relationships>');
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/deliver-governance-document/index.ts` | Fix subfolder path resolution; add image relationship injection to `.rels` file |

## Deployment
The edge function will be redeployed automatically after the fix.

