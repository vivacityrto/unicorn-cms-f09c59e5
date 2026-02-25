

# Fix "Unknown" Package Names and Add Monthly/Lifecycle Breakdowns on Time Tab

## Problem

The **Package Burndown** and **Monthly Summary** cards on the Time tab both show "Unknown" because of a broken join. The code tries to use Supabase's relational syntax (`packages:package_id(name)`) on `package_instances`, but there is **no foreign key** between `package_instances.package_id` and `packages.id` in the database. Without the FK, Supabase returns null, and the fallback label "Unknown" is displayed.

Additionally, the Monthly Summary only shows aggregate totals (This Month / YTD / Total) -- the user wants a **per-month breakdown** and **package lifecycle dates** (start/end) visible.

## Root Cause (Technical)

In `ClientTimeTab.tsx`, both `PackageBurndownCards` (line 67-70) and `PackageTimeSummaryCards` (line 156-159) do:

```
.from('package_instances')
.select('id, package_id, packages:package_id(name)')
```

This Supabase join syntax requires a FK constraint. Since none exists, `packages` returns `null`, and `nameMap` maps every instance to "Unknown".

## Solution

### Fix 1: Resolve package names correctly

Replace the broken FK join with two separate queries:
1. Fetch `package_instances` (get `id`, `package_id`, `start_date`, `end_date`)
2. Fetch `packages` by the distinct `package_id` values (get `id`, `name`)
3. Map names client-side

This follows the established pattern noted in project memory: "no explicit FK relationship... requires separate fetches with client-side mapping."

### Fix 2: Show package lifecycle dates

Add start/end dates from `package_instances` to both the Burndown and Monthly Summary cards. Display format: "1 Jan 2025 -- 31 Dec 2025" or "1 Jan 2025 -- Ongoing".

### Fix 3: Add per-month breakdown

Replace the current 3-column aggregate (This Month / YTD / Total) with a monthly breakdown table/list showing each month's total hours for that package instance. This gives visibility into usage patterns over the package's life.

## Files Changed

**`src/components/client/ClientTimeTab.tsx`** -- single file, three changes:

### Change 1: `PackageBurndownCards` query (lines 54-140)
- Replace `packages:package_id(name)` join with two-step fetch
- Also fetch `start_date` and `end_date` from `package_instances`
- Display package lifecycle dates on each burndown card

### Change 2: `PackageTimeSummaryCards` query and display (lines 142-205)
- Same two-step fetch fix for package names
- Fetch `start_date` and `end_date` from `package_instances`
- Add a new query to `time_entries` grouped by `package_id` and month (`date_trunc`) to get per-month totals
- Replace the 3-column aggregate with a monthly breakdown list showing each month and its hours
- Show package lifecycle dates (start -- end/Ongoing)
- Keep "Total" and "Last entry" as summary info

### Change 3: Card layout enhancement
- Each Monthly Summary card will show:
  - Package name (resolved correctly)
  - Package life: "18 Nov 2025 -- Ongoing"
  - A compact list of months with hours (e.g., "Feb 2026: 6h 55m")
  - Total at the bottom
  - Last entry date

## What Does NOT Change
- Time entries list, filters, pagination
- Timer controls (Start/Stop)
- Package burndown calculation logic (view-driven)
- Stale drafts warning
- Add/Edit/Move/Delete time entry flows
- Any database tables or views
- RLS policies
- Any other tabs or pages

