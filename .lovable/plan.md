## Scope
Fix two existing Supabase Edge Functions that reference incorrect database schema names and missing required fields.

## Changes

### File 1: `supabase/functions/run-stage-health-monitor/index.ts`
- **Line 36**: In the `.select()` call on `stage_instances`, change `package_instance_id` to `packageinstance_id`.
- **Line 49**: In the `packageInstanceIds` array mapping, change `s.package_instance_id` to `s.packageinstance_id`.
- **Line 65**: In the `tenantMap.get()` call, change `stage.package_instance_id` to `stage.packageinstance_id`.
- **Line 116**: In the `.from()` call, change `consult_log` (singular) to `consult_logs` (plural).

### File 2: `supabase/functions/run-workload-forecast/index.ts`
- **Line 95**: In the `.from()` call for consult hours, change `consult_log` (singular) to `consult_logs` (plural).
- **Line 166**: In the `.from()` call for recent logs, change `consult_log` (singular) to `consult_logs` (plural).
- **Lines 127-138**: The `workloadSnapshots.push({...})` object is missing `user_id` and `snapshot_date`. Add them:
  - `user_id: userId`
  - `snapshot_date: today`

## Verification
After deployment, both functions should run without schema-related errors. The `workload_snapshots` insert should succeed because `user_id` and `snapshot_date` are now included.

## Risk
Very low — only correcting mismatched names and adding missing non-nullable fields that the table requires. No logic changes.