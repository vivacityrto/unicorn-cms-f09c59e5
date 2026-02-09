

## Notification Generation Rules and Scheduled Jobs

### Overview

Create a single edge function (`generate-notifications`) that scans tasks, meetings, and obligation calendar entries, then inserts deduplicated rows into `user_notifications`. Schedule it via `pg_cron` + `pg_net`.

---

### Database Changes

**1. Add dedupe_key column to user_notifications**

```sql
ALTER TABLE public.user_notifications
ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_key_uq
ON public.user_notifications (dedupe_key);
```

This prevents duplicate notifications when the function runs multiple times. The unique index means an `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING` pattern works cleanly.

**2. Enable pg_cron and pg_net extensions**

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

Required for scheduled HTTP calls to edge functions.

**3. Create two cron schedules**

- **Hourly** (meetings): `0 * * * *` -- calls the edge function with `{ "scope": "meetings" }`
- **Daily** (tasks + obligations): `5 0 * * *` (00:05 UTC) -- calls with `{ "scope": "tasks_obligations" }`

Both use `net.http_post` to invoke the edge function with the service role key.

**4. Add performance index**

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_tenants_due_date
ON public.tasks_tenants (due_date)
WHERE due_date IS NOT NULL AND (completed IS NULL OR completed = false);
```

---

### Edge Function: `generate-notifications`

**File:** `supabase/functions/generate-notifications/index.ts`

**Config:** Add `[functions.generate-notifications] verify_jwt = false` to `supabase/config.toml`

**Logic by scope:**

#### Tasks (scope = "tasks_obligations")

Query `tasks_tenants` where `due_date IS NOT NULL` and not completed, matching these windows:
- `due_date = current_date + 7` -- window: `7d`
- `due_date = current_date + 1` -- window: `1d`  
- `due_date = current_date` -- window: `today`
- `due_date BETWEEN current_date - 3 AND current_date - 1` -- window: `overdue_N`

Recipient: `created_by` (no `assigned_to` column exists).

Dedupe key: `task_due:<task_id>:<window>`

Notification fields:
- `type`: `task_due`
- `title`: e.g. "Task due in 7 days: <task_name>"
- `message`: status and due date info
- `link`: `/client/tasks?task_id=<id>`

#### Meetings (scope = "meetings")

Query `meetings` where `starts_at` falls within:
- 24h window: `BETWEEN now() + interval '23h45m' AND now() + interval '24h15m'`
- 1h window: `BETWEEN now() + interval '50m' AND now() + interval '70m'`

Recipients: 
- Meeting owner: `meetings.owner_user_uuid`
- Attendees: `meeting_participants` joined to `users` on `lower(email) = lower(participant_email)` to get `user_uuid`

Dedupe key: `meeting_upcoming:<meeting_id>:<window>:<user_uuid>`

Notification fields:
- `type`: `meeting_upcoming`
- `title`: e.g. "Meeting in 1 hour: <title>"
- `link`: `/client/calendar?tab=reminders&meeting_id=<id>`

#### Obligations (scope = "tasks_obligations")

Query `calendar_entries` where:
- `title ILIKE '[OBLIGATION]%' OR description ILIKE '%type=obligation%'`
- `entry_date` matches: +30d, +7d, +1d, today, or -1d (overdue)

Recipient: `created_by`

Dedupe key: `obligation_due:<entry_id>:<window>`

Notification fields:
- `type`: `obligation_due`
- `title`: e.g. "Obligation due in 7 days: <title>"
- `link`: `/client/calendar?tab=reminders&reminder_id=<id>`

#### Insert pattern

All inserts use service role client with `ON CONFLICT (dedupe_key) DO NOTHING` via raw `.rpc()` call or upsert:

```typescript
await supabase
  .from('user_notifications')
  .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
```

#### Response

Returns JSON summary: `{ tasks_created, meetings_created, obligations_created, duplicates_skipped }`.

---

### Overdue Notification Cap

For tasks and obligations, the overdue window generates at most 3 notifications (overdue_1, overdue_2, overdue_3) by checking `current_date - due_date` and capping at 3. The dedupe key includes the day offset, so each overdue day is a separate notification.

---

### Files Created

| File | Purpose |
|---|---|
| `supabase/functions/generate-notifications/index.ts` | Edge function with all generation logic |
| Migration SQL | dedupe_key column, extensions, cron jobs, index |

### Files Modified

| File | Change |
|---|---|
| `supabase/config.toml` | Add `[functions.generate-notifications] verify_jwt = false` |

### No Legacy Table Changes

- No `ALTER TABLE` on tasks_tenants, meetings, calendar_entries, users, tenant_users
- Only `ALTER TABLE user_notifications ADD COLUMN dedupe_key` (new table, not legacy)
- Only `CREATE INDEX` on tasks_tenants (safe, no data change)

### Acceptance Criteria

| Criteria | How |
|---|---|
| No duplicates on re-run | dedupe_key unique index + upsert with ignoreDuplicates |
| ClientUser sees own notifications only | user_notifications RLS scopes by user_id = auth.uid() |
| Meeting attendees notified | join meeting_participants to users on email |
| Task recipients notified | uses created_by as recipient |
| Obligation reminders for tagged entries | ILIKE filter on title/description |
| Cron schedules running | pg_cron + pg_net call the function hourly and daily |

