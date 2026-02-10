

## Fix: TGA Data Not Displaying (RLS Policy Mismatch)

### Root Cause

The sync **is working correctly** -- the database contains all the TGA data for RTO 91020:
- 84 qualifications, 2,016 units, 180 skill sets, 4 courses (in `tenant_rto_scope`)
- 3 contacts, 2 addresses, 11 delivery locations
- Sync jobs show status "done" in `tga_rest_sync_jobs`

The problem is **broken RLS policies** preventing the UI from reading the data. Two tables use `u.role = 'superadmin'` which matches **no user** in the system. The actual field is `unicorn_role = 'Super Admin'`.

### What's Broken

| Table | Current SuperAdmin Check | Works? |
|---|---|---|
| `tenant_rto_scope` | `u.role = 'superadmin'` | No |
| `tga_rest_sync_jobs` | `u.role = 'superadmin'` | No |
| `tga_rto_snapshots` (one policy) | `u.role = 'superadmin'` | No |
| `tga_rto_summary` | `users.global_role = 'SuperAdmin'` | Maybe |
| `tga_rto_contacts` | `users.global_role = 'SuperAdmin'` | Maybe |
| `tga_rto_addresses` | `users.global_role = 'SuperAdmin'` | Maybe |
| `tga_rto_delivery_locations` | `users.global_role = 'SuperAdmin'` | Maybe |

The system already has a helper function `is_vivacity_team_safe(auth.uid())` that checks `unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')` -- this is the correct standard.

Additionally, the debug panel reads from `tga_rto_import_jobs` (old table, stuck at "queued") instead of `tga_rest_sync_jobs` (current table, shows "done").

### Fix Plan

**Step 1: Migration to fix all TGA-related RLS policies**

Replace all broken superadmin checks with `is_vivacity_team_safe(auth.uid())` and ensure tenant member access via `has_tenant_access_safe(auth.uid(), tenant_id)`:

- Drop and recreate policies on `tenant_rto_scope`, `tga_rest_sync_jobs`, `tga_rto_snapshots`
- Drop and recreate policies on `tga_rto_summary`, `tga_rto_contacts`, `tga_rto_addresses`, `tga_rto_delivery_locations`
- All policies will follow the same pattern:
  - Vivacity staff: full access via `is_vivacity_team_safe`
  - Tenant users: read access via `has_tenant_access_safe`

**Step 2: Fix debug panel data source**

Update `ClientIntegrationsTab.tsx` to read from `tga_rest_sync_jobs` instead of `tga_rto_import_jobs` so the debug panel shows the correct sync status.

### Technical Details

```text
Migration SQL pattern per table:

  DROP POLICY IF EXISTS "old_policy_name" ON table_name;
  CREATE POLICY "vivacity_all" ON table_name FOR ALL
    USING (is_vivacity_team_safe(auth.uid()));
  CREATE POLICY "tenant_read" ON table_name FOR SELECT
    USING (has_tenant_access_safe(auth.uid(), tenant_id));
```

Debug panel fix in `ClientIntegrationsTab.tsx` (~line 398):
- Change `supabase.from('tga_rto_import_jobs')` to `supabase.from('tga_rest_sync_jobs')`
- Map the correct column names from the new table

### Expected Result

After this fix:
- All TGA tabs (Quals, Skills, Units, Courses) will show correct counts and data
- Summary, Contacts, Addresses tabs will display correctly
- Debug panel will show "done" instead of "queued"
- Both Vivacity staff and tenant users will have appropriate access

