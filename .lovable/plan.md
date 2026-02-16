

## Add Package Instance Selector to "Add Time Entry" Dialog

### What this does
When a consultant opens the Add Time Entry dialog, they will see a **Package** field that:
- Fetches all active (non-complete) package instances for the tenant
- If only **one** active instance exists, it auto-selects it and shows the package name as read-only
- If **multiple** active instances exist, shows a dropdown to pick one
- If **none** exist, hides the field
- Stores the selected **package instance ID** on the time entry

### Database change
The `time_entries` table currently has a `package_id` (integer) column that references the package template. We need a new column to link to the specific instance:

- **Add column** `package_instance_id` (bigint, nullable) to `time_entries`
- **Add foreign key** referencing `package_instances(id)`
- The existing `package_id` column is left untouched for backward compatibility

### UI change (AddTimeDialog.tsx)

1. Add state: `activeInstances` list and `selectedInstanceId`
2. On dialog open, query `package_instances` (joined to `packages` for name) where `tenant_id = tenantId` and `is_complete = false`
3. If exactly one result, auto-select it
4. Render a Package field between Allocation and Duration:
   - 0 instances: hidden
   - 1 instance: read-only display showing package name
   - 2+ instances: Select dropdown
5. On submit, include `package_instance_id: selectedInstanceId` in the insert
6. Reset `selectedInstanceId` in `resetForm()`

### Technical details

**Migration SQL:**
```sql
ALTER TABLE time_entries
  ADD COLUMN package_instance_id bigint
  REFERENCES package_instances(id);
```

**Query for active instances:**
```sql
SELECT pi.id, pi.package_id, p.name
FROM package_instances pi
JOIN packages p ON p.id = pi.package_id
WHERE pi.tenant_id = :tenantId AND pi.is_complete = false
ORDER BY pi.start_date DESC;
```

**File changed:** `src/components/client/AddTimeDialog.tsx`

