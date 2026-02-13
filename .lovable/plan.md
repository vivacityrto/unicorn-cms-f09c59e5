
# Fix: Show Only Active Clients on Executive Dashboard

## Problem
The Executive Dashboard displays clients with `inactive` and `archived` tenant status (e.g., NSW Fishing Industry Training, Positive Training Academy). The underlying view `v_executive_client_health` filters on `package_instances.is_complete = false` but does not check `tenants.status`.

## Solution
Add `AND t.status = 'active'` to the `v_executive_client_health` view definition. This single change filters inactive/archived tenants from all dashboard components (Exposure table, Snapshot tiles, Alignment Signals, Momentum, etc.) since they all consume this view.

## Technical Details

### Migration: Update `v_executive_client_health` view

1. Drop and recreate `v_executive_client_health` (and its dependent views like `v_executive_watchlist_7d`) with an added `WHERE` clause: `AND t.status = 'active'`.
2. The current final line is:
   ```sql
   WHERE pi.is_complete = false;
   ```
   It becomes:
   ```sql
   WHERE pi.is_complete = false
     AND t.status = 'active';
   ```
3. Recreate all dependent views (`v_executive_watchlist_7d`) after the base view.

### No Frontend Changes Required
The hook and all components already consume from this view — filtering at the SQL level ensures consistency everywhere.

### Impact
- Removes inactive/archived tenants from all Executive Dashboard panels
- Reduces noise for Visionary/Integrator weekly reviews
- No effect on client-facing views or other dashboards
