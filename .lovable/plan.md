

## Add Governance Folder Column to SharePoint Folder Mapping

The SharePoint Folder Mapping page (`/admin/sharepoint-sites` → folder mapping) already has a "Compliance Docs" column with a "Create" button that calls `verify-compliance-folder`. We need to add an equivalent **"Governance Docs"** column that shows the governance folder status and lets staff create/verify it.

### Changes

**File: `src/pages/admin/SharePointFolderMapping.tsx`**

1. **Extend `TenantRow` interface** — add `sp_governance_item_id: string | null` and `sp_governance_folder_url: string | null`

2. **Update `fetchTenants` query** — add `governance_folder_item_id, governance_folder_url` to the `tenant_sharepoint_settings` select and map them into the row

3. **Add "Governance Docs" table column** between the existing "Compliance Docs" and "Actions" columns:
   - If `sp_governance_item_id` exists → show a green "Ready" badge linking to the `governance_folder_url`
   - If the tenant has a root folder mapped (`sp_root_item_id`) but no governance folder → show a "Verify" button that calls `verify-compliance-folder` (which creates the governance folder and subfolders)
   - If neither → show "—"

4. **Add state for governance verification** — `creatingGovernance` + `governanceTenant` (same pattern as the existing compliance folder state)

5. **Add `handleVerifyGovernance` handler** — calls `verify-compliance-folder` with `{ tenant_id, create_category_subfolders: true }`, shows success/error toast, refreshes the table

**File: `supabase/functions/deliver-governance-document/index.ts`**

6. **Improve the error response** when governance folder is missing — add `error_code: "GOVERNANCE_FOLDER_MISSING"` and a more actionable message directing staff to the SharePoint Folder Mapping page

**File: `src/components/client/StageDocumentsSection.tsx`**

7. **Detect `GOVERNANCE_FOLDER_MISSING`** error code in the generation catch block and show a specific destructive toast: "Governance Folder Not Configured — verify the compliance folder from the SharePoint Folder Mapping page first"

