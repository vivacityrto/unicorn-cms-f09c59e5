# Close stale staff impersonation preview sessions

## Problem confirmed

`audit_client_impersonation` currently holds **78 rows with `ended_at IS NULL`**, all older than 4 hours (oldest: 2026-02-09). `endPreview()` in `ClientPreviewContext.tsx` is the only writer that sets `ended_at`, and it only fires on explicit user action — tab closes, browser crashes, hard navigations, and SSO logouts all leave rows open forever. There is no server-side janitor.

## Verified context

- Table columns: `id, actor_user_id, tenant_id, started_at (default now()), ended_at (nullable), reason (nullable), created_at`. `reason` is unused — confirmed in spec, no logic depends on it.
- Existing cron jobs (jobids 3–11): none touch impersonation. No name collision with `close-stale-preview-sessions`.
- `pg_cron` extension is already installed and operational (8 active jobs).
- 4-hour cutoff matches the spec exactly — no in-flight sessions (any session under 4 hours old) will be affected.
- Frontend `ClientPreviewContext.tsx` is **not touched**. If a staff member clicks End Preview after the cron has stamped `ended_at`, the frontend UPDATE will overwrite with the true end time — acceptable per spec.
- RLS policies on the table remain unchanged. The cron job runs as the cron owner (superuser context), bypassing RLS — same pattern as the other 8 jobs.

## Plan — one migration, two statements

### Statement 1 — Backfill

```sql
UPDATE public.audit_client_impersonation
SET ended_at = started_at + INTERVAL '4 hours'
WHERE ended_at IS NULL
  AND started_at < NOW() - INTERVAL '4 hours';
```

Expected affected rows: **78**. All rows are older than 4 hours, so the `started_at < NOW() - INTERVAL '4 hours'` guard is redundant for the backfill but kept verbatim per spec for defensive symmetry with the cron statement.

### Statement 2 — Schedule recurring janitor

```sql
SELECT cron.schedule(
  'close-stale-preview-sessions',
  '0 */4 * * *',
  $$
    UPDATE public.audit_client_impersonation
    SET ended_at = started_at + INTERVAL '4 hours'
    WHERE ended_at IS NULL
      AND started_at < NOW() - INTERVAL '4 hours';
  $$
);
```

Runs at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC. Idempotent: once `ended_at` is set, the WHERE clause excludes the row.

Schema-qualifies `public.audit_client_impersonation` inside the job body so it does not depend on the cron worker's `search_path` (matches project convention from project-knowledge: fully qualify DB objects).

## What is NOT changed

- `src/contexts/ClientPreviewContext.tsx` — `startPreview()` / `endPreview()` untouched.
- No RLS policy changes on `audit_client_impersonation`.
- No other cron jobs touched.
- No `reason`-column logic.
- No edge function created — pg_cron runs the SQL inline.

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Closing a session of a still-active staff previewer | Very low | 4-hour cutoff exceeds realistic continuous preview duration; user can re-enter preview to start a new session. Frontend `endPreview` still overwrites if user later clicks End. |
| `ended_at` no longer reflects the real moment the user stopped | Low (audit accuracy) | Audit records still capture a bounded session window; row is no longer "open forever". Real end times are still recorded when users click End Preview. |
| Cron job name collision | None | Verified no existing job uses this name. |
| Race vs. concurrent `endPreview` UPDATE | Negligible | Both UPDATEs use the same row id; last write wins. Frontend write happens at most once per session. |
| RLS / tenant leakage | None | UPDATE runs in cron context (superuser); no RLS bypass added for app users. |
| Performance | None | Table is tiny (239 rows total); WHERE clause is indexed-friendly even without an index. |

## Benefits

- Removes 78 orphaned audit rows immediately, restoring meaningful "active preview" queries.
- Permanently caps session row lifetime at 4 hours.
- Zero frontend changes, zero new infra, zero new secrets — lowest-surface fix.
- Audit-complete: every row gets a defined `ended_at`, preserving compliance reviewability.
- Backward-compatible: no schema, no API, no policy, no contract changes.

## Production readiness checklist

- [x] No schema change
- [x] No RLS change
- [x] No frontend change
- [x] Idempotent recurring job
- [x] Verified extension availability and no name collision
- [x] Honors existing project rule: fully qualified object names in DB code
