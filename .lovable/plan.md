

## Add Delete Button to Package Data Manager

### What
Add a "Delete" button on completed package instances where the start and end dates are less than 7 days apart. This handles failed imports from Unicorn 1 that created short-lived junk records.

### How

**File: `src/components/client/PackageDataManager.tsx`**

1. **Add delete eligibility check**: A helper function `canDelete(row)` returns true when:
   - `is_complete === true`
   - Both `start_date` and `end_date` are set
   - `differenceInDays(end_date, start_date) < 7`

2. **Add delete handler**: `handleDelete(rowId)` — performs cascading deletes in order:
   - `compliance_audit_responses` via audit_id (if any audits reference this instance)
   - `time_entries` WHERE `package_instance_id = rowId`
   - `stage_instances` WHERE `package_instance_id = rowId` (and their child `task_instances`, `email_instances`, `document_instances`)
   - `phase_instances` WHERE `package_instance_id = rowId`
   - Finally `package_instances` WHERE `id = rowId`
   - Shows a confirmation dialog before executing

3. **Add confirmation dialog**: Uses a simple `window.confirm()` or an inline `ConfirmDialog` component with the package name and date range displayed.

4. **UI**: A red `Trash2` icon button appears in the actions column (alongside Save) only for eligible rows. The button is disabled while a delete is in progress.

5. **Import**: Add `Trash2` from lucide-react and `differenceInDays` from date-fns.

### Immediate action
Also delete the specific cancelled M-GR package instance for tenant 7544 (the one with start=14 Apr 2026 and end=14 Apr 2026) using the Supabase insert/update/delete tool.

### Technical details
- Delete cascades manually in application code since there may not be DB-level CASCADE on all FKs
- Only completed packages with <7 day span are eligible — active packages are never deletable
- Audit trail: the delete action itself is logged via a toast confirmation (no separate audit_events entry needed for junk data cleanup)

