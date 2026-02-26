

# Add `next_renewal_date` and Scope Time Logs to Renewal Year

## Overview

Three changes in one pass:

1. **Database**: Add `next_renewal_date` column, backfill open records, auto-set on insert
2. **Manage Packages dashboard**: Show renewal date under tenant name (with state inline), add renewal filter
3. **Time scoping**: Burndown view and time summaries filter entries to the current renewal year only (`next_renewal_date - 1 year` to `next_renewal_date`)

---

## 1. Database Migration

### Add column and backfill

```sql
ALTER TABLE package_instances ADD COLUMN next_renewal_date date;

UPDATE package_instances
SET next_renewal_date = start_date + INTERVAL '1 year'
WHERE end_date IS NULL;
```

### Auto-set trigger for future inserts

```sql
CREATE OR REPLACE FUNCTION set_default_renewal_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.next_renewal_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.next_renewal_date := NEW.start_date + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_renewal_date
BEFORE INSERT ON package_instances
FOR EACH ROW EXECUTE FUNCTION set_default_renewal_date();
```

### Update `v_package_burndown` -- scope to renewal year

Currently the burndown sums ALL time entries for a package instance. It needs to only count entries within the current renewal year window:

```sql
CREATE OR REPLACE VIEW v_package_burndown AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 AS included_minutes,
  COALESCE(ts.used_minutes, 0) AS used_minutes,
  -- remaining and percent_used as before ...
FROM package_instances pi
LEFT JOIN (
  SELECT te.package_id, SUM(te.duration_minutes) AS used_minutes
  FROM time_entries te
  JOIN package_instances pi2 ON pi2.id = te.package_id
  WHERE te.package_id IS NOT NULL
    AND te.start_at >= COALESCE(pi2.next_renewal_date, pi2.start_date + INTERVAL '1 year') - INTERVAL '1 year'
    AND te.start_at < COALESCE(pi2.next_renewal_date, pi2.start_date + INTERVAL '1 year')
  GROUP BY te.package_id
) ts ON ts.package_id = pi.id
WHERE pi.is_complete = false;
```

This ensures only hours logged within the current renewal year count toward the burndown.

### Update `v_package_time_summary` -- scope to renewal year

Similarly, the time summary view will filter entries to the renewal year window instead of using calendar year-to-date.

---

## 2. Frontend Time Scoping

### `useTimeSummaryQuery` (src/hooks/useTimeTrackingQuery.tsx)

The summary query currently fetches all `time_entries` for a client and calculates week/month/90-day buckets client-side. When a specific `packageId` is provided, it needs to also fetch the package instance's `next_renewal_date` and `start_date`, then only include entries within that renewal year window.

Changes:
- When `packageId` is set, fetch `next_renewal_date` and `start_date` from `package_instances`
- Calculate `renewalStart = next_renewal_date - 1 year` and `renewalEnd = next_renewal_date`
- Filter entries to only those within this window before computing summaries

### `ClientTimeTab.tsx` time entries list

The entries list and monthly breakdown already filter by `package_id`. The `resolvePackageNames` helper will also fetch `next_renewal_date` alongside `start_date` and `end_date`. The monthly breakdown cards will show the renewal year range instead of calendar YTD.

### `PackageBurndownCards` (ClientTimeTab.tsx)

Already reads from `v_package_burndown` which will be scoped at the database level. The lifecycle display will show the renewal year range.

---

## 3. Manage Packages Dashboard Layout

### Client column restructure (src/pages/ManagePackages.tsx)

Current layout per row:
```text
Tenant Name
```

New layout:
```text
Tenant Name  NSW
Renewal: 15 Mar 2027
```

- **Line 1**: Tenant name (font-semibold) + state (text-xs text-muted-foreground) on the same line
- **Line 2**: Renewal date with colour-coded text:
  - Red: lapsed (past due)
  - Amber: due within 30 days
  - Yellow: due within 60 days
  - Green/neutral: more than 60 days away

### Data fetching changes

Update `fetchTenantsForPackage` to also select `id, start_date, next_renewal_date` from `package_instances` and pass into each tenant record.

Add to `TenantData` interface:
```typescript
start_date?: string | null;
next_renewal_date?: string | null;
package_instance_id?: number | null;
```

### Renewal filter

New "Renewal" combobox alongside existing State and Status filters:
- All (default)
- Due 30 days
- Due 60 days
- Due 90 days
- Lapsed

### Inline date editing

Clicking the renewal date opens a date picker popover to update `package_instances.next_renewal_date` directly.

---

## Files Changed

| File | Change |
|------|--------|
| New migration | Add column, backfill, trigger, update both views |
| `src/pages/ManagePackages.tsx` | TenantData interface, fetch renewal dates, rearrange Client cell, add renewal filter, inline date picker |
| `src/hooks/useTimeTrackingQuery.tsx` | Scope summary to renewal year when package selected |
| `src/components/client/ClientTimeTab.tsx` | Fetch `next_renewal_date` in resolvePackageNames, display renewal year in lifecycle labels |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

## What Does NOT Change

- Package finalisation/creation workflows
- RLS policies
- Timer start/stop logic
- Time entry creation (entries are still recorded normally; only display/summaries are scoped)

