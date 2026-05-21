## Goal
Add an automatic 30-minute scheduled trigger for `sync-outlook-calendar` so consultant Outlook calendars stay current without manual clicks, without touching the existing Edge Function logic, UI, schemas, or RLS.

## Root cause confirmed
- `sync-outlook-calendar/index.ts` is a **per-user** function: it reads `Authorization: Bearer <user JWT>`, calls `supabaseAdmin.auth.getUser(token)`, then operates on that single `user.id`.
- It already refreshes expired access tokens, writes `last_synced_at` / `last_error` to `oauth_tokens`, and respects an optional `includeMeetings` flag (default `false`).
- No `pg_cron` entry exists for it (verified against `cron.job` — only audit, notifications, compliance jobs run today).
- Because the function is per-user and bound to a JWT, `pg_cron` cannot call it directly — it needs a fan-out wrapper.

## Approach
Two-piece fix, both additive and isolated:

1. **New Edge Function `sync-outlook-calendar-cron`** — service-role fan-out wrapper.
2. **New `pg_cron` job** — invokes the wrapper every 30 minutes via `net.http_post`.

The existing `sync-outlook-calendar` function is **not modified**. All UI sync buttons (`CalendarTimeCapture`, `OutlookIntegration`, `MicrosoftAccountCard`) continue calling it exactly as today via `supabase.functions.invoke`.

## Technical detail

### 1. `supabase/functions/sync-outlook-calendar-cron/index.ts`
Responsibilities:
- Authorize the caller: accept only requests carrying the project service-role key in `Authorization` (compared against `SUPABASE_SERVICE_ROLE_KEY`). pg_cron will send this. Rejects 401 otherwise — prevents anyone from triggering a global sync.
- Query `oauth_tokens` with the admin client:
  ```ts
  .select('user_id, account_email')
  .eq('provider', 'microsoft')
  .not('refresh_token', 'is', null)
  ```
- For each row, mint a short-lived user JWT signed with `SUPABASE_JWT_SECRET` (env var already present in every Supabase project). Standard claims:
  ```
  { aud: 'authenticated', role: 'authenticated', sub: user_id,
    iat: now, exp: now + 60 }
  ```
  Signed HS256 using `jose` (`npm:jose@5`).
- POST to `${SUPABASE_URL}/functions/v1/sync-outlook-calendar` with:
  - `Authorization: Bearer <minted user JWT>`
  - `apikey: <SUPABASE_ANON_KEY>`
  - Body: `{ "action": "sync-calendar" }` — **never** `includeMeetings`. Meetings/participants tables stay untouched.
- Wrap each user call in `try/catch`; on failure log and continue. The downstream function already writes `last_error` to `oauth_tokens` when refresh fails, so per-user failures are audit-visible without extra writes here.
- Use `Promise.allSettled` with a small concurrency limit (e.g. 5) so one slow Graph call doesn't block the run.
- Return summary `{ processed, succeeded, failed, durationMs }` for log inspection.

CORS not needed (server-to-server only) but include standard headers for safety / parity with project conventions.

### 2. Secret check
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` — all standard Supabase-managed env vars. No new secrets required.

### 3. `pg_cron` job (run via the SQL-insert tool, not migration, because it embeds the project URL + anon key — same pattern as `generate-notifications-*` jobs already in this project)

```sql
select cron.schedule(
  'sync-outlook-calendar-every-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/sync-outlook-calendar-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'apikey', '<ANON_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Idempotent install: `select cron.unschedule('sync-outlook-calendar-every-30min')` (ignore-if-missing) before scheduling, to keep re-runs safe.

### 4. Why mint a JWT instead of changing the function
The instructions explicitly forbid editing `sync-outlook-calendar`. The function's only identity input is `Authorization`. Signing a one-minute JWT with `SUPABASE_JWT_SECRET` is the standard Supabase pattern, requires no schema/RLS/code change to the existing function, and keeps the manual UI invocations byte-for-byte identical.

## Verified untouched
- `sync-outlook-calendar/index.ts` — no edits.
- `CalendarTimeCapture.tsx`, `OutlookIntegration.tsx`, `MicrosoftAccountCard.tsx` — no edits; their `functions.invoke('sync-outlook-calendar', …)` calls keep working with user JWT.
- `useOutlookCalendar.tsx`, `useOutlookConnectionStatus.tsx` — no edits.
- Tables `calendar_events`, `oauth_tokens`, `meetings`, `meeting_participants`, `calendar_time_drafts` — no schema or RLS changes. Writes to `calendar_events` / `oauth_tokens` happen only via the existing function with the same service-role path it already uses.

## Edge cases handled
- **Stale access token, valid refresh token** (current state for all consultants): existing `refreshTokenIfNeeded` handles it; first scheduled run heals everyone.
- **Invalid/expired refresh token**: existing function throws → wrapper's `try/catch` logs and moves on; function itself writes `last_error` via its own update path. Other users still processed.
- **`last_synced_at = null` (Dave)**: function treats null as "first sync" — full backfill happens; expected behaviour.
- **User added later**: wrapper re-queries `oauth_tokens` every run, so new connections auto-enrol with no code change.
- **Manual sync racing with scheduled sync**: `calendar_events` upserts on `(user_id, external_event_id)` (existing behaviour), so concurrent runs are safe.
- **Meetings table protection**: wrapper hard-codes body without `includeMeetings`. Even if a future caller flips it, the schedule won't.
- **Unauthorized invocation**: wrapper rejects anything not bearing the service-role key — global sync can't be triggered from the browser.

## Out of scope (explicitly not touched)
UI components, hooks, the existing edge function, RLS policies, schema, meetings ingestion, client-side polling.

## Risk assessment
- **Low.** Purely additive: one new edge function + one cron row. No mutation of existing code paths. Worst case (wrapper fails) = today's behaviour (no scheduled sync) — manual buttons still work. Per-user errors are isolated and surfaced via existing `oauth_tokens.last_error`. Throughput at 30-min cadence × small consultant population × concurrency 5 is negligible against Graph rate limits.

## Benefits
- Consultant calendars refresh automatically; expired access tokens self-heal via existing refresh flow.
- `oauth_tokens.last_synced_at` becomes a true freshness signal for the connection-status UI.
- Broken connections surface in `last_error` within 30 minutes instead of waiting for a user to click sync.
- Zero blast radius on meetings, RLS, schema, or UI.

## Implementation order when approved
1. Create `supabase/functions/sync-outlook-calendar-cron/index.ts` (auto-deploys).
2. Run the `cron.schedule` SQL via the insert tool (contains URL + keys, matches existing `generate-notifications` precedent).
3. Manually invoke the wrapper once to verify; check `oauth_tokens.last_synced_at` advances and `calendar_events` populates for Dave.
