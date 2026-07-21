## Goal

Add a pull-based Mailgun reconciliation fallback so `user_invitations.delivery_status` becomes self-healing, even if the push webhook was never registered. Additive only — `mailgun-webhook/index.ts` is untouched.

Sequencing per user approval: **deploy + manually verify against the two bwfat.com.au invites first, then add the cron job.**

## Step 1 — Create & deploy edge function (no cron yet)

File: `supabase/functions/reconcile-invite-delivery-status/index.ts`. Deno, `verify_jwt = false` (matches other cron-invoked functions in this project).

**Auth gate** (copied from `sync-outlook-calendar-cron`): accept either
- exact `SUPABASE_SERVICE_ROLE_KEY` bearer, or
- a JWT with `role=service_role`, `iss=supabase`, `ref` matching this project host, and unexpired `exp`.

Everything else → 401.

**Env reuse** (already configured):
`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` (default `"eu"`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Region branch copied verbatim from `send-invitation-email/index.ts`:
```
const apiBase = MAILGUN_REGION === "eu"
  ? "https://api.eu.mailgun.net"
  : "https://api.mailgun.net";
```

Mailgun auth: HTTP Basic `api:${MAILGUN_API_KEY}`.

**Flow per invocation**

1. Select up to **50** rows from `user_invitations` where:
   - `delivery_status IS NULL`
   - `mailgun_message_id IS NOT NULL`
   - `last_sent_at > now() - interval '7 days'`
   - Order `last_sent_at ASC` (oldest still-in-window first so nothing ages out unchecked).
2. Sequentially, for each row:
   - Trim `mailgun_message_id`, strip surrounding `<…>` — identical to `mailgun-webhook/index.ts` lines 109–112.
   - `GET ${apiBase}/v3/${MAILGUN_DOMAIN}/events?message-id=<id>` with Basic auth.
   - Parse `items` (Mailgun returns reverse-chronological). Walk items, pick the first mapped by the shared `mapEvent(event, severity)` helper copied verbatim from `mailgun-webhook/index.ts` (`delivered`, `complained`, `failed+permanent → bounced`, `failed+temporary → failed`). Non-terminal events (`accepted`, `opened`, `clicked`) → `null` and the row stays pending for a later run.
   - If mapped: `delivery_event_at = new Date(item.timestamp * 1000).toISOString()`, then `UPDATE user_invitations SET delivery_status, delivery_event_at WHERE id = row.id`. Last-write-wins vs. webhook — no conflict handling.
   - Per-row failures (non-200 Mailgun, malformed body, DB update error) are caught, counted as `errors`, logged with invitation id + short body snippet, and never abort the run.
   - Sleep 250 ms between Mailgun calls.
3. Log final summary: `{ checked, updated, still_pending, errors, duration_ms }`. Return `200 { ok: true, summary }`.

**Not touched:** `supabase/functions/mailgun-webhook/index.ts`, any frontend code, any schema — `delivery_status` / `delivery_event_at` columns already exist.

## Step 2 — Manual verification (BEFORE any cron)

1. Look up the two target rows to confirm they still have `mailgun_message_id` and `delivery_status IS NULL`:
   ```sql
   SELECT id, email, mailgun_message_id, last_sent_at,
          delivery_status, delivery_event_at
   FROM user_invitations
   WHERE email IN ('mary@bwfat.com.au','partners@bwfat.com.au')
   ORDER BY last_sent_at DESC;
   ```
2. Invoke the function once via `supabase--curl_edge_functions` (POST, empty body). Confirm HTTP 200 and summary payload.
3. Pull `supabase--edge_function_logs` for `reconcile-invite-delivery-status` and confirm per-row `updated invitation=… status=…` lines (or `mailgun 404/…` / `still pending` reasons if applicable).
4. Re-run the SQL from step 1 and confirm `delivery_status` + `delivery_event_at` are populated with real values (whatever Mailgun actually recorded — likely `delivered` or `bounced`).
5. Stop and report the results to the user before scheduling.

## Step 3 — Add pg_cron schedule (only after Step 2 confirmed)

Use the project's existing pattern (same shape as the `sync-outlook-calendar-cron` scheduling row):

```sql
select cron.schedule(
  'reconcile-invite-delivery-status',
  '*/20 * * * *',
  $$
  select net.http_post(
    url:='https://<project>.supabase.co/functions/v1/reconcile-invite-delivery-status',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

Executed via **`supabase--insert`** (not `supabase--migration`) — matches the Lovable rule that cron scheduling SQL carrying project-specific tokens must not be a shared migration.

Before scheduling, confirm `pg_cron` + `pg_net` are already enabled (the existing calendar cron proves they are, so no extension changes expected).

After insert: `SELECT jobname, schedule FROM cron.job WHERE jobname = 'reconcile-invite-delivery-status';` to confirm registration.

## Technical notes

- Mailgun Events API pagination is ignored — filtering by `message-id` returns a small event set for one message; we only need the most recent terminal event.
- 7-day window matches Mailgun's default event retention; older rows are silently skipped.
- 50/run × every 20 min = 150/hour headroom, well above the ~210 invitations/6 months backlog.
- Both push (webhook) and pull (this function) write the same enum values to the same two columns, so no reconciliation logic is needed if they overlap.
