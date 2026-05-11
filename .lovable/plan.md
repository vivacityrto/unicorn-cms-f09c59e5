## Goal

Replace the hard-coded anon JWT in the two `generate-notifications` pg_cron job command bodies with a call to `private.cron_function_jwt()`.

## Problem with the literal SQL

The user-supplied SQL does `UPDATE cron.job SET command = ...`. The migration runner does not own `cron.job` and direct UPDATEs return:

```
ERROR: 42501: permission denied for table job
```

`pg_cron` exposes `cron.alter_job(job_id bigint, command text)` (SECURITY DEFINER, owned by the cron superuser) precisely for this case. It produces the same end state — `cron.job.command` is overwritten — without needing table-level UPDATE privileges.

Confirmed current state (read-only check already done):
- jobid 1 = `generate-notifications-meetings` (contains `eyJ...` token)
- jobid 2 = `generate-notifications-daily` (contains `eyJ...` token)
- `private.cron_function_jwt()` exists.

## Migration

Name: `rotate_cron_job_commands_to_vault_helper`

Body uses `cron.alter_job` keyed by `jobname` (resilient to jobid drift across environments) with the exact command bodies the user specified — only the wrapping changes, the SQL inside the command string is byte-identical to the user's request:

```sql
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'generate-notifications-meetings'),
  command := $j1$
    SELECT net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/generate-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{"scope": "meetings"}'::jsonb
    ) AS request_id;
$j1$
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'generate-notifications-daily'),
  command := $j2$
    SELECT net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/generate-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{"scope": "tasks_obligations"}'::jsonb
    ) AS request_id;
$j2$
);
```

## Verification

After the migration runs, I'll execute:

```sql
SELECT jobid, jobname, command FROM cron.job WHERE command LIKE '%eyJ%';
```

Expected: 0 rows.

## Risk

- Schedule, jobname, database, username, active flag — all preserved (only `command` changes).
- If `private.cron_function_jwt()` ever returns NULL the Authorization header would become `'Bearer '`, causing the edge function to 401 on the next run; out of scope here since the helper is already in production use.
- No app code, RLS, or other triggers touched.
