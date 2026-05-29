## Fix governance folder naming to use current tenant legal name

### Problem
The `verify-compliance-folder` edge function uses a cached `root_name` value from `tenant_sharepoint_settings` when naming the governance folder. This value can be stale or was set during test provisioning, causing the folder to be named incorrectly.

### Change
File: `supabase/functions/verify-compliance-folder/index.ts`

1. **Line 107** — Remove `root_name` from the Supabase select:
   ```
   .select('governance_folder_item_id, governance_drive_id')
   ```

2. **Line 112** — Remove the stale `root_name` fallback. Replace:
   ```
   const tenantFolderName = (spSettings?.root_name as string | null) || buildClientFolderName(tenant.rto_id, tenant.legal_name, tenant.name);
   ```
   with:
   ```
   const tenantFolderName = buildClientFolderName(tenant.rto_id, tenant.legal_name, tenant.name);
   ```

### Why this is safe
- `root_name` is only referenced on lines 107 and 112 in this file — nowhere else.
- The change makes the folder name always derive from the tenant's current `rto_id`, `legal_name`, and `name`, which is the correct source of truth.
- No database schema changes, no frontend changes, no other edge functions affected.