## Completed: Package Add-On / Time Top-Up via Parent Instance Linking

### Summary
Add-on packages (e.g. General Consult for extra TAS days) can now be attached to a parent package instance. This preserves the audit trail (separate `package_instance` row) while rolling hours into the parent's burn-down.

### Database Changes
- `package_instances.parent_instance_id` (bigint, self-referencing FK) — links child to parent
- `rpc_get_package_usage` updated to include time entries from child instances (`OR te.package_id IN (SELECT id FROM package_instances WHERE parent_instance_id = ...)`)

### Frontend Changes
- **StartPackageDialog**: New "Attach to package" dropdown lists active non-child instances. On attach, sets `parent_instance_id` and increments parent's `hours_added` by the new package's `total_hours`
- **usePackageUsageQuery / usePackageUsage**: Queries filter `parent_instance_id IS NULL` so children don't appear as top-level packages
- **PackageBurndownCards** (ClientTimeTab): Excludes children from card list; shows "Add-ons: Gen Consult +7h" sub-line under parent card
- **ManageTenants**: Hours column excludes child instances to prevent double-counting

### How It Works
1. SuperAdmin starts a package → optionally attaches to existing parent
2. Child's `total_hours` added to parent's `hours_added`
3. Child's time entries roll into parent burn-down via RPC
4. Child excluded from burn-down cards and hours columns
5. Child visible as add-on label under parent card for audit trail
