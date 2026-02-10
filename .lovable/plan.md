
## Fix: Re-sync Tenant 7512 to Pull All Current Scope Items

### Problem

Tenant 7512 (RTO 91110) was last synced **before** the `isImplicit` filter was removed. The database only contains 33 old superseded qualifications (all with end dates before 2017). The current training products were never stored because they were classified as "implicit" by the TGA API.

The edge function fix is already deployed -- it now keeps all scope items. This tenant simply needs a fresh sync.

### What Needs to Happen

1. **Trigger a re-sync** for tenant 7512 (RTO 91110) using the already-fixed edge function
2. **Verify** the data now includes current qualifications with future end dates
3. **Confirm** the UI shows the correct mix of Current and Superseded items (only those still on scope, i.e., end date >= today)

### No Code Changes Required

The edge function and display logic are already correct:
- Edge function: includes all items (implicit filter removed)
- Display filter: shows items with end date >= today or no end date
- Status colours: green for Current, red for Superseded (already implemented)

This is a data issue, not a code issue. The sync just needs to be re-run.
