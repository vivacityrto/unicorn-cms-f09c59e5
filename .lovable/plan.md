

## Fix Package Burn-down Display and Add Hours to Manage Clients

### Issues Found

1. **49h vs 56h**: The `packages` table has `total_hours = 49` for M-SAR (id 1033), and `package_instances` has `included_minutes = 2940` (49h). If this should be 56h, it's a data correction — the package definition or instance needs updating. You can fix this via the Package Data Manager (inline edit on the Packages tab) or I can run a one-off migration.

2. **Burn-down missing billable breakdown**: The RPC `rpc_get_package_usage` returns total used minutes but does not split by billable/non-billable. The burn-down card shows source breakdown (calendar/timer/manual) but not billable vs non-billable.

3. **Manage Clients list missing hours**: No hours used / total hours column exists on the table.

### Changes

**1. Add billable/non-billable to RPC** (SQL migration)

Update `rpc_get_package_usage` to also return `billable_minutes_total` and `non_billable_minutes_total` by adding `is_billable` filtering to the existing query:

```sql
COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_minutes ELSE 0 END), 0) AS billable_total,
COALESCE(SUM(CASE WHEN NOT te.is_billable THEN te.duration_minutes ELSE 0 END), 0) AS non_billable_total
```

**2. Update TypeScript interfaces** (`usePackageUsageQuery.tsx`, `usePackageUsage.tsx`)

Add `billable_minutes_total` and `non_billable_minutes_total` to the `PackageUsage` interface.

**3. Update burn-down card** (`ClientTimeSummaryCard.tsx`)

Change the "Used" display line from `72:00 / 49:00` to show:
- Total used / included (e.g. `72:00 / 56:00`)
- Below that: `Billable: 36:00 | Non-billable: 36:00`

**4. Add Hours column to Manage Clients** (`ManageTenants.tsx`)

- During the existing `fetchTenants` data load, also fetch `included_minutes` and aggregate time usage per tenant from `time_entries` (or call a lightweight summary).
- Add a "Hours" column between "Package" and "ComplyHub" showing `used / included` (e.g. `72:00 / 56:00`) with colour coding when over budget.

### Files Modified
- New SQL migration (update `rpc_get_package_usage` with billable split)
- `src/hooks/usePackageUsageQuery.tsx` (add billable fields to interface)
- `src/hooks/usePackageUsage.tsx` (add billable fields to interface)
- `src/components/client/ClientTimeSummaryCard.tsx` (show billable/non-billable in burn-down)
- `src/pages/ManageTenants.tsx` (add Hours column with used/included display)

