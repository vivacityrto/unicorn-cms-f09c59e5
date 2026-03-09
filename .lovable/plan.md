## Completed: Package Burn-down Billable Split & Manage Clients Hours Column

### Database Changes
- `rpc_get_package_usage` now returns `billable_minutes_total` and `non_billable_minutes_total` fields

### Frontend Changes
- **PackageUsage interfaces** (`usePackageUsageQuery.tsx`, `usePackageUsage.tsx`): Added `billable_minutes_total` and `non_billable_minutes_total`
- **ClientTimeSummaryCard**: Burn-down card now shows billable/non-billable breakdown line above the source (calendar/timer/manual) breakdown
- **ManageTenants**: Added "Hours" column showing `used / included` (e.g. `36:00 / 56:00`) with colour coding at 80% (yellow) and 100% (red)

### Data Fix Needed
- Watto Training M-SAR package shows 49h but should be 56h — fix via Package Data Manager inline edit
