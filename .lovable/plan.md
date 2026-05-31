Add a tenant-assignment guard in the cohort-access-sender-worker edge function.

### What
In `supabase/functions/cohort-access-sender-worker/index.ts`, inside the item processing loop, add a guard immediately after the `planned_action` mismatch check and before the `invokeBody` construction.

### Change
If the job `action` is `"activate"` and `item.tenant_id` is `null` or `undefined`:
- Record outcome `"skipped"` with reason `"No tenant assigned — cannot activate"` via `record_cohort_item_outcome`
- Increment `skipped` and `drained`
- `continue` to the next item

The `"reset"` action is intentionally left unguarded because it does not require `tenant_id`.

No other files are touched. No schema changes are needed — `"skipped"` is already a valid outcome.