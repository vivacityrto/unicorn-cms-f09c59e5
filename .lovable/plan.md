

## Plan: Add "SharePoint Folder" button to the Audit Documents tab

### Scope
Add a single button in the Audit workspace → Documents tab that opens the client's SharePoint root folder in a new tab. No file mirroring (deferred for later discussion).

### Change

**File:** `src/components/audit/workspace/DocumentsTab.tsx`

- Fetch the client's SharePoint folder URL from `tenant_sharepoint_settings` for the audit's `tenant_id` (same query pattern already used in `ClientSharePointDocumentsTab.tsx` and `SharePointLinkDialog.tsx`):
  - Select `root_folder_url, manual_folder_url, setup_mode, provisioning_status, validation_status`
  - Effective URL = `setup_mode === 'manual' ? manual_folder_url : root_folder_url`
  - Show button only when a URL is resolvable AND (`provisioning_status === 'success'` OR `validation_status === 'valid'`)
- Render an outline button labelled **"SharePoint Folder"** with the `ExternalLink` lucide icon, top-right of the Documents tab header, opening the URL with `target="_blank" rel="noopener noreferrer"`.
- If no folder is configured for the client, hide the button (no error, no placeholder) — consistent with how `ClientSharePointDocumentsTab` behaves.

### Out of scope (deferred)
- Mirroring uploads to a "VCC Audit Uploads" subfolder in SharePoint.
- Pushing the generated AI report/findings to SharePoint.
- Any change to the existing Supabase `audit-documents` storage path or `client_audit_documents` records.

### Verification
1. Open an audit for a client with a provisioned SharePoint folder → "SharePoint Folder" button appears top-right of the Documents tab and opens the correct folder in a new tab.
2. Open an audit for a client without SharePoint configured → button is hidden, rest of the tab unchanged.
3. Existing upload-to-Supabase + AI review flow continues to work unchanged.

