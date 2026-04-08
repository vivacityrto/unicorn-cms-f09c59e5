

## Add "Provision SharePoint Folder" Button to Integrations Tab

### Problem
When a client is imported from Unicorn 1, the SharePoint client folder is not automatically provisioned (unlike the onboarding flow which has a toggle for it). There is no way to trigger folder provisioning from the Integrations tab.

### Solution
Add a "SharePoint Folder Provisioning" section to the existing `SharePointFolderConfig` component on the Integrations tab. This will include a "Provision Client Folder" button that calls the existing `provision-tenant-sharepoint-folder` edge function.

### Changes

**File: `src/components/client/SharePointFolderConfig.tsx`**
- Add a "Provision Folder" button to the card, visible when no folder has been provisioned yet (i.e., `provisioning_status` is not `success` or settings don't exist).
- The button calls `supabase.functions.invoke('provision-tenant-sharepoint-folder', { body: { tenant_id: tenantId } })` -- reusing the exact same logic already in `ClientFilesTab.tsx`.
- Show provisioning state (loading spinner) and success/error toast feedback.
- If already provisioned, show a subtle "Re-provision" option for cases where the folder needs to be recreated.
- After successful provisioning, refetch the settings to update the UI.

### Technical Details
- No database changes needed -- the edge function and settings table already exist.
- The provisioning button will be gated to SuperAdmin users only (using `useAuth().isSuperAdmin`).
- Reuses the existing `provision-tenant-sharepoint-folder` edge function which handles idempotency (returns `already_provisioned: true` if folder exists).

