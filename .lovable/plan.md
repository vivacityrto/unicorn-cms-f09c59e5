Change 1 — Remove the legacy "Client SharePoint Folder" card
- Delete the entire `{/* Client Folder */}` `<Card>` block (lines 83-108)
- Remove the `folderUrl` state variable and its `setFolderUrl` setter
- Remove the logic that populates `folderUrl` (the `provisioning_status === 'success' && client_access_enabled` block inside the useEffect)
- Simplify the `tenant_sharepoint_settings` query to only select `shared_folder_name, shared_folder_url` — remove `root_folder_url, manual_folder_url, setup_mode, provisioning_status, client_access_enabled`

Change 2 — Fix the Shared Folder card condition
- Replace the current gating condition (`sharedFolderName ? ... : ...`) with `sharedFolderUrl ? ... : ...`
- In the truthy branch: show `sharedFolderName` (if set) as display text above the "Open Shared Folder" button
- In the falsy branch: show the muted text "Your shared folder hasn't been configured yet. Contact your Vivacity consultant."

No other changes — Reference Library, loading skeleton, page heading, or any other component remain untouched.