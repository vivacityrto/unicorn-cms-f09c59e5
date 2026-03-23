

# Merge Governance Features into Manage Documents (Keep Both Pages)

## What we're doing
Adding the unique Governance Documents features into the Manage Documents page, while **keeping the Governance Documents page intact** until you're satisfied everything works.

## Features to add to Manage Documents

1. **Framework filter** — New dropdown (RTO / GTO / CRICOS / No Framework) fetched from `dd_governance_framework`
2. **SharePoint status filter** — New dropdown (All / Has SP URL / No SP URL)
3. **Framework column** — Show `framework_type` in the table
4. **Version column** — Join `document_versions` to show current version number
5. **SharePoint link/unlink column** — Link icon to open SP URL or browse to set one (reuses `SharePointFileBrowser`)
6. **Document detail drill-down** — Clicking a row opens `GovernanceDocumentDetail` (version history, publishing, mapping editor, delivery history, tailoring health, package assignments) with a back button
7. **Updated date column** — Show `updated_at` formatted date

## Technical approach

### `src/pages/ManageDocuments.tsx`
- Add new state: `frameworkFilter`, `sharepointFilter`, `selectedDocId`, `sharepointBrowseDocId`
- Extend `fetchDocuments` query to also select `framework_type`, `source_template_url`, `updated_at`, `current_published_version_id`, and join `document_versions`
- Extend the `Document` interface with these new fields
- Add Framework and SharePoint filter dropdowns alongside existing filters
- Add Framework, Version, and SP link columns to the table
- Add row click → `setSelectedDocId` to open `GovernanceDocumentDetail`
- When `selectedDocId` is set, render `GovernanceDocumentDetail` with back button (early return, same pattern as GovernanceDocuments)
- Add the SharePoint file browser dialog (copy from GovernanceDocuments)
- Wire filters into `applyFiltersAndSort`

### No changes to
- `src/pages/admin/GovernanceDocuments.tsx` — kept as-is
- Navigation/routing — both menu items remain
- All governance sub-components — already standalone

## File changes
- **`src/pages/ManageDocuments.tsx`** — extend with governance features (filters, columns, drill-down, SP browser)

