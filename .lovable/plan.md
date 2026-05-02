## Problem

Posting time from a meeting on `/tenant/7449` fails with:

```
package_id 1027 does not belong to tenant 7449
```

## Root cause

The trigger `public.fn_validate_time_entry_package` (BEFORE INSERT/UPDATE on `time_entries`) treats `time_entries.package_id` as a `package_instances.id` — which matches every other writer in the system. A spot check of the 10 most recent rows confirms `time_entries.package_id` and `time_entries.package_instance_id` are always equal and both reference `package_instances.id`.

The RPC `public.rpc_import_meeting_time_to_client` is the only writer that breaks this convention. It looks up the package_instance, captures both `pi.id` and `pi.package_id` (the **base** package id from the `packages` table), then inserts:

```sql
INSERT INTO public.time_entries (
  ..., package_id, package_instance_id, ...
) VALUES (
  ..., v_base_package_id, v_package_instance_id, ...
);
```

For tenant 7449 / instance 15152, that inserts `package_id = 1027` (the base package id). The trigger then searches `package_instances WHERE id = 1027 AND tenant_id = 7449`, finds nothing, and raises the error the user saw.

## Fix

Single migration that recreates `rpc_import_meeting_time_to_client` with one line changed: store `v_package_instance_id` in `time_entries.package_id` instead of `v_base_package_id`. Everything else — argument list, return shape, draft path, audit log payload — stays identical.

```sql
-- in the time_entries INSERT branch
INSERT INTO public.time_entries (
  tenant_id, client_id, package_id, package_instance_id, user_id, work_type, is_billable,
  start_at, duration_minutes, notes, source, calendar_event_id
) VALUES (
  v_tenant_id, p_client_id, v_package_instance_id, v_package_instance_id, v_user_id, 'meeting', true,
  (p_work_date::timestamp AT TIME ZONE 'UTC'), p_minutes, p_notes, 'calendar', p_calendar_event_id
) RETURNING id INTO v_time_entry_id;
```

The audit-log payload keeps recording both `package_id` (now the instance id, matching the row that was actually written) and `package_instance_id` so historical audit reads remain coherent.

## Out of scope

- The draft path (`calendar_time_drafts`) is left untouched. Its `package_id` column historically stores base package ids and no trigger objects to it. Reconciling drafts → time_entries on later post is a separate concern (the post path goes through the same RPC again, so this fix already covers it).
- The trigger `fn_validate_time_entry_package` is correct and is not modified.
- No frontend changes — `AddTimeFromMeetingDialog.tsx` already sends the correct `p_package_instance_id`.

## Verification after deploy

1. On `/tenant/7449`, open Time → "Add Time from Meeting", pick the AHMRC training meeting, click "Post Time" — should toast success.
2. SQL spot check:
   ```sql
   SELECT package_id, package_instance_id
   FROM time_entries
   WHERE tenant_id = 7449
   ORDER BY id DESC LIMIT 1;
   -- expect both columns equal, both = 15152
   ```

## Files

- new migration `supabase/migrations/<timestamp>_fix_import_meeting_time_package_id.sql`
