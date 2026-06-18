## Phase 5 — Register nightly cron job for `reporting_obligations`

Schedule a new pg_cron job that calls the existing `generate-notifications` edge function with `{"scope":"reporting_obligations"}` once per day. No edits to the edge function, no schema migration, no changes to existing cron jobs.

### SQL (runtime, via Supabase `insert` tool — not a migration)
```sql
SELECT cron.schedule(
  'generate-notifications-reporting-obligations',
  '15 0 * * *',
  $$ SELECT net.http_post(
       url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/generate-notifications',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || private.cron_function_jwt()
       ),
       body := '{"scope":"reporting_obligations"}'::jsonb
     ) AS request_id; $$
);
```

Schedule `15 0 * * *` runs at 00:15 UTC (~11:15 AEST), 10 minutes after the existing daily job at 00:05 UTC. Uses the same `private.cron_function_jwt()` helper the two existing jobs already use.

### Verification
```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'generate-notifications-reporting-obligations';
-- one row, schedule '15 0 * * *', active = true

SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'generate-notifications%'
ORDER BY jobname;
-- shows all three: meetings-v2, daily-v2, reporting-obligations
```

### Rollback
```sql
SELECT cron.unschedule('generate-notifications-reporting-obligations');
```

### Out of scope
Phase 6 frontend. No changes to existing cron jobs or the edge function.
