## Cron scheduling — reclaim + purge only

Scope confirmed: two `cron.schedule` calls, no worker drive-queue cron. Both target pure in-database RPCs, so this is **not** an HTTP-invoking cron and does **not** need `net.http_post`, project URL, or anon key — the previous "use `supabase--insert` because it needs URL/anon key" note only applies to HTTP-fanout crons (like `sync-outlook-calendar-cron`). Here, `supabase--insert` is still the right tool (it's DML against `cron.job` via `cron.schedule`, not DDL), but purely because the migration tool is reserved for schema/RLS/function changes — there are no user-specific tokens embedded.

### Grant check (verified live)

Both functions are owned by `postgres`; `has_function_privilege('postgres', ..., 'EXECUTE') = true` for each. `pg_cron` executes jobs as the `postgres` role, so **no grant changes are required**.

- `public.reclaim_stale_bulk_document_locks(p_max_attempts integer, p_stall_minutes integer)` — defaults `5` / `120`, call with no args.
- `public.purge_bulk_document_job_items(p_days integer)` — call with `30`.

### Exact `cron.schedule` calls to apply

```sql
-- 1) Reclaim stuck-leased items and stall long-idle jobs, every 5 minutes.
SELECT cron.schedule(
  'bulk-documents-reclaim-locks',
  '*/5 * * * *',
  $$SELECT public.reclaim_stale_bulk_document_locks();$$
);

-- 2) Purge finished bulk_document_job_items older than 30 days, once daily at 03:15 UTC.
SELECT cron.schedule(
  'bulk-documents-purge-items',
  '15 3 * * *',
  $$SELECT public.purge_bulk_document_job_items(30);$$
);
```

Both `cron.schedule` calls are idempotent by job name (re-running replaces the schedule/command for the same name). If either name already exists it will be updated in place.

Applied via `supabase--insert` in a single call. Pre-check `pg_cron` + `pg_net` extensions are already enabled (they are — used by existing crons like `sync-outlook-calendar-cron`); if `pg_cron` were somehow missing I'd stop and raise it separately rather than enabling it inside this change.

### Verification after apply

```sql
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname IN ('bulk-documents-reclaim-locks','bulk-documents-purge-items');
```

Expect two rows, `active = true`, commands matching above. Then wait ≥5 minutes and check `cron.job_run_details` for a `succeeded` run of `bulk-documents-reclaim-locks` before signing off. Purge won't fire until 03:15 UTC — verified by inspecting the row, not by waiting.

### Accepted tradeoff (recorded, not mitigated here)

If a worker's self-reinvocation chain dies entirely mid-job, `reclaim_stale_bulk_document_locks` will:
- reset individually stuck-leased items back to `pending` after their lease expires, and
- mark the job `stalled` once it hits the 2-hour no-progress threshold,

but **nothing will re-lease that pending work** until a human retriggers it. The reason this cron doesn't cover that gap is that the worker chain requires a real staff JWT to satisfy `repair_package_instance_stages` + SharePoint delivery auth (per PR-D's Option A), and `pg_cron` has no user session to mint one from. Widening those four in-production functions to trust `service_role` is out of scope for this change.

### Follow-up flag (do not build now)

The upcoming bulk-documents progress UI must expose a **"resume stalled job"** action that retriggers the worker under the viewing user's JWT. That's the actual mitigation for the tradeoff above — noted here so it doesn't get lost, not implemented in this PR.

### Rollback

```sql
SELECT cron.unschedule('bulk-documents-reclaim-locks');
SELECT cron.unschedule('bulk-documents-purge-items');
```
