

# Package Instance Data Manager

## Problem
Imported package data has issues: overlapping date ranges, duplicate active packages, KickStarts still marked active from years ago. You need a simple, focused view to see all a tenant's packages together and fix dates/status quickly.

## Solution
A new "Package Data Manager" dialog accessible from the client Packages tab (SuperAdmin only). It shows a compact table of ALL package instances for that tenant -- both active and completed -- sorted by start date, with inline editing of start date, end date, and active/deactivate toggles.

## What You'll See

A table with these columns:
- **Package** (read-only label, e.g. "M-SAR", "KS-RTO")
- **Start Date** (editable date picker)
- **End Date** (editable date picker, nullable)
- **Active** (toggle switch)
- **Complete** (toggle switch)
- **Save** button per row (only appears when a change is made)

Rows are sorted chronologically by start date. Colour-coded row backgrounds:
- Green tint = active
- Grey tint = complete
- Red/amber tint = potential issue (active with no end date and older than 12 months, or overlapping active packages of the same type)

A simple visual warning bar at the top if duplicate active packages of the same type are detected.

## Technical Approach

### New Component
**`src/components/client/PackageDataManager.tsx`**
- Dialog triggered by a "Data Manager" button on the Packages tab (SuperAdmin only)
- Fetches all `package_instances` for the tenant joined with `packages.name`
- Renders an editable table
- Each row tracks local edits; save button triggers an update to `package_instances` for that row
- Updates use `supabase.from('package_instances').update(...)` for `start_date`, `end_date`, `is_active`, `is_complete`, and `membership_state`
- When toggling `is_complete = true`, also sets `membership_state = 'complete'`
- When toggling `is_active = false` and `is_complete = true`, sets `end_date` to today if blank
- Toast confirmation on save

### Modified File
**`src/components/client/ClientPackagesTab.tsx`**
- Add a "Data Manager" button next to the existing "Start Package" / "Add Package" buttons (SuperAdmin only)
- Opens the `PackageDataManager` dialog
- Pass `tenantId` and an `onSuccess` callback to refresh the package list

### No Database Changes Required
All fields being edited (`start_date`, `end_date`, `is_active`, `is_complete`, `membership_state`) already exist on `package_instances`.

