# Plan: Sync Package Stages from Unicorn1

## Status: ✅ COMPLETE

## Summary

Successfully synced 171 package stage records from `unicorn1.package_stages` to `public.package_stages`.

## Changes Made

### Database Migration
- Dropped FK constraint to `documents_stages`
- Truncated existing incomplete data (9 records)
- Inserted 171 records from `unicorn1.package_stages`
- Added new FK constraint to `stages` table

### Frontend Updates
- Updated `src/pages/CalendarTimeCapture.tsx` - changed join to `stages(id, name)`
- Updated `src/components/package-builder/PackageBuilderOverview.tsx` - changed join to `stages(id, name, shortname)`

### Note on Other Files
The hooks `useStageDependencies.tsx`, `usePackageStageOverrides.tsx`, and `usePackageBuilder.tsx` query `package_stages` but don't explicitly join with `documents_stages` for stage info - they either:
- Query only `package_stages` columns
- Use separate queries to `documents_stages` directly (not via FK)

These will continue to work as-is since the FK change doesn't affect queries that don't use the relationship.

## Expected Outcome

- 171 package stage records synced ✅
- Consistent with `stages` table (source of truth) ✅
- Frontend displays stage names correctly ✅
