## Manage Documents — SharePoint Template Linking Improvements

Three small, scoped changes in `src/pages/ManageDocuments.tsx` (no business logic, no schema changes).

### 1. Include Framework segment in folder navigation

In the `Master Documents — Select Template File` dialog (lines ~2006–2035), the auto-navigated folder is currently just `RTO` / `GTO` / `CRICOS` / `Other`.

Update `autoFolder` to be prefixed with `Framework/`, matching what `GovernanceDocumentDetail.tsx` already does:

```ts
const autoFolder = browseDoc?.framework_type
  ? `Framework/${frameworkFolderMap[browseDoc.framework_type.toLowerCase()] || 'Other'}`
  : 'Framework/Other';
```

`SharePointFileBrowser` already supports slash-separated segments via `autoNavSegments`, so no change is needed there.

### 2. Allow re-selecting / changing the linked template from the row

Today, in the documents table action cell (lines ~1700–1715):
- If `source_template_url` is set → renders an `<a>` that just opens the link in a new tab (no way to change it).
- If empty → renders a button that opens the picker.

Change behaviour so the link icon **always** opens the picker (so the user can pick or replace the template), while still giving access to the current URL:

- When `source_template_url` exists: render a `Link2` (linked) icon button styled as "linked" (primary color) that opens the picker. Add a small adjacent "open" affordance (external-link icon button) that opens the current URL in a new tab. Tooltip on the link icon: "Change linked template file" with the current URL shown.
- When empty: keep current `Link2Off` button that opens the picker.

This keeps the visual signal (linked vs not) while making the icon a true action that can also re-link.

### 3. Show link status in the Edit Document form

In the edit dialog form (lines ~1176–1308), add a new field block (after the existing fields, before the closing `</div>` at 1308) titled **"Template File"** that:

- Reads `source_template_url` from the document being edited (look up by `editingDocumentId` in `documents`).
- If linked: shows a green/primary-tinted row with `Link2` icon, the file name (last URL segment, decoded), an "Open" link button (new tab), a "Change…" button (sets `sharepointBrowseDocId = editingDocumentId` to open the picker), and an "Unlink" button (clears `source_template_url` via the same update path as `handleSharePointLinkSelected`, then `fetchDocuments()`).
- If not linked: shows muted "No template file linked" with a "Link template file…" button that opens the picker for the current `editingDocumentId`.

The picker dialog (already mounted at the page level via `sharepointBrowseDocId`) will appear over the edit dialog. After selection, `handleSharePointLinkSelected` already calls `fetchDocuments()`, so the form reflects the new value on next render. No new state is required beyond the existing `sharepointBrowseDocId`.

### Out of scope
- No changes to `SharePointFileBrowser`, governance pages, or backend.
- No changes to filtering, audit logging, or the `documents` schema.
- No change to the "Yes/No File" indicator column.

### Files touched
- `src/pages/ManageDocuments.tsx` (only)
