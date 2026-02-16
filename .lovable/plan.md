
# Show Only the Most Recent Package Instance Per Package Type

## Problem
When a client has multiple active instances of the same package (e.g., "Kickstart RTO Package" started 17/09/2024 AND 25/11/2025), both appear in the Packages tab. Only the most recent instance per package type should display.

## Solution
After fetching all active package instances, deduplicate them by `package_id` -- keeping only the instance with the latest `start_date` for each package type.

## Technical Change

### File: `src/hooks/useClientManagement.tsx`
In the `useClientPackages` hook, after building the `packageData` array (around line 617), add a deduplication step:

- Group all built `ClientPackage` entries by `package_id`
- For each group, keep only the entry with the most recent `membership_started_at` date
- Replace the `setPackages(packageData)` call with `setPackages(deduplicatedData)`

This is a small, isolated change (~8 lines) that filters after the existing data build logic, so it does not affect stage resolution, hours calculation, or any other downstream logic.

## Impact
- Only the Packages tab listing is affected
- The older instance still exists in the database and remains accessible via direct URL or other queries
- No database changes required
