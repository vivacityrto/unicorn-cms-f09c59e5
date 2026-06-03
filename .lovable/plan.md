## Two narrow fixes

### Fix 1 — Cohort sender confirmation casing
File: `src/pages/admin/CohortAccessSender.tsx` (~line 173)

Change:
```ts
const expectedConfirm = previewSummary ? `Send to ${previewSummary.will_send} people` : "";
```
to:
```ts
const expectedConfirm = previewSummary ? `SEND TO ${previewSummary.will_send} PEOPLE` : "";
```
No other edits to the file.

### Fix 2 — `launch_cohort_job` migration
Recreate the function via `CREATE OR REPLACE FUNCTION` preserving the exact current body, changing only the final `INSERT INTO public.audit_eos_events` to include `tenant_id` with the hard-coded Vivacity tenant id `6372`:

```sql
INSERT INTO public.audit_eos_events (
  tenant_id, user_id, entity, entity_id, action, reason, details
) VALUES (
  6372, v_caller, 'cohort_send_job', v_job_id, 'cohort_job_launched',
  'Cross-tenant cohort access sender launched',
  jsonb_build_object(
    'action', p_action,
    'resolved', v_resolved,
    'planned', v_planned,
    'filter', p_filter,
    'include_uuids_count', COALESCE(array_length(p_include_uuids,1),0)
  )
);
```

All other logic, signature, `SECURITY DEFINER`, and `SET search_path` settings remain identical.