
# Delete Test Processes from Database

## Summary
Remove all 4 test processes from the database to clean up test data. Since there are no related `process_versions` records, the deletion is straightforward.

## Records to Delete

| Title | Category | Created |
|-------|----------|---------|
| test | Operations | 5 Feb 2026 |
| test | Operations | 5 Feb 2026 |
| TEST | Operations | 5 Feb 2026 |
| Prospect Background | Sales & Marketing | 5 Feb 2026 |

## Technical Approach

### Database Migration
Create a migration to delete all 4 test process records by their IDs:

```sql
DELETE FROM public.processes
WHERE id IN (
  '870d0dbf-7836-4ea5-9c6a-5d569b690f37',
  '0343f220-dd17-4022-937b-8460506a657a',
  'aa4be5cd-6b46-49c2-965e-50d11926fb2b',
  '95c90b0f-95ac-46d0-9eae-facbe5b2ca88'
);
```

### File Changes
- **New migration file**: `supabase/migrations/[timestamp]_delete_test_processes.sql`

### Safety Checks
- No `process_versions` records exist, so no cascade issues
- Deleting by explicit UUID prevents accidental deletion of future legitimate records
- The Processes Widget on the dashboard will automatically reflect the cleanup

## Result
After this migration, the `/processes` page and dashboard widget will show an empty state until real processes are created.
