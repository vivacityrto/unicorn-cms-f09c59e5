

## Add Time Top-Up via `hours_added` on Parent Package

### Summary

When a client needs extra time (extra TAS days, additional consult hours), the approach is:

1. The add-on package (e.g. General Consult) is started as its own `package_instance` for audit trail
2. It gets linked to a parent package instance via a new `parent_instance_id` column
3. On linking, its hours are added to the parent's `hours_added` field
4. The linked instance is excluded from burn-down cards (its hours roll into the parent)
5. It retains its own stages/tasks for workflow tracking

### Database Changes

**1. Add `parent_instance_id` column to `package_instances`**

```sql
ALTER TABLE public.package_instances
  ADD COLUMN parent_instance_id bigint
  REFERENCES public.package_instances(id);
```

**2. Update `rpc_get_package_usage`** to include time entries from child instances in the parent's usage calculation:

```sql
-- When calculating used_minutes for a parent, also sum entries
-- where te.package_id IN (SELECT id FROM package_instances WHERE parent_instance_id = p_client_package_id)
```

**3. Update burn-down view/queries** to exclude child instances (where `parent_instance_id IS NOT NULL`) from the top-level burn-down card list.

### UI Changes

**4. Modify `StartPackageDialog`** - Add an optional "Attach to package" dropdown:
- Lists active (non-complete) package instances for the tenant
- When selected, sets `parent_instance_id` on the new instance
- After creation, increments `hours_added` on the parent instance by the new package's `total_hours`

**5. Update burn-down card queries** (`ClientTimeTab.tsx` PackageBurndownCards section) to filter out child instances from the card list (`WHERE parent_instance_id IS NULL`).

**6. Show attached add-ons** as a sub-list under the parent burn-down card (small text showing "Gen Consult +7h" etc.) so the audit trail is visible.

### Files Modified

- New SQL migration (add column + update RPC)
- `src/components/client/StartPackageDialog.tsx` (add "Attach to" selector, update `hours_added` on parent after start)
- `src/components/client/ClientTimeTab.tsx` (filter child instances from burn-down, show add-on sub-list)
- `src/hooks/usePackageUsage.tsx` (filter child instances from package list)
- `src/hooks/usePackageUsageQuery.tsx` (filter child instances)
- `src/pages/ManageTenants.tsx` (exclude child instances from hours column)

### How It Works End-to-End

1. SuperAdmin clicks "Start Package" on a tenant
2. Selects "General Consult" package
3. Sees new "Attach to" dropdown, selects "M-SAR Membership"
4. System creates the Gen Consult instance with `parent_instance_id` pointing to M-SAR
5. System adds Gen Consult's `total_hours` (e.g. 7) to M-SAR's `hours_added`
6. Burn-down card for M-SAR now shows increased included hours (e.g. 56 + 7 = 63)
7. Gen Consult does NOT appear as its own burn-down card
8. Time logged against Gen Consult rolls into M-SAR's burn-down totals
9. Gen Consult remains visible as a separate package instance for audit/workflow purposes

