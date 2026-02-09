

## Client Reminders Calendar -- Implementation Plan

### Current State

All three views (`client_reminders_feed`, `my_client_reminders`, `tenant_client_reminders`) already exist in the database but have gaps that need fixing:

1. **No attendee expansion for meetings** -- currently only the meeting owner appears; attendees from `meeting_participants` are not included
2. **`meetings_shared` is a view, not a table** -- the original spec references `meetings_shared.user_id` which does not exist. The actual attendee data lives in `meeting_participants` (columns: `meeting_id`, `participant_email`, `participant_name`)
3. **No `security_invoker = true`** on any of the three views -- meaning RLS on the underlying tables is bypassed when querying through these views via PostgREST
4. **Missing composite index** `idx_meetings_tenant_starts_at` for performance

### Attendee Matching Challenge

`meeting_participants` stores `participant_email` (text), not `user_id` (uuid). To match attendees to users for the reminders feed, we need to join through the `users` table on email. This means a meeting will appear for an attendee only if their `participant_email` matches a `users.email` record. This is a reasonable convention and avoids creating new tables.

---

### Database Changes (Migration)

**Step 1 -- Replace `client_reminders_feed`**

Recreate with `security_invoker = true` and add a second meeting UNION leg that expands `meeting_participants` into per-user rows:

```text
Tasks (from tasks_tenants, unchanged)
  UNION ALL
Meetings -- owner row (from meetings, owner_user_uuid)
  UNION ALL
Meetings -- attendee rows (meetings JOIN meeting_participants JOIN users ON email)
  UNION ALL
Reminders (from calendar_entries, unchanged)
```

The attendee leg will use:
- `meeting_participants.participant_email` joined to `users.email`
- Output `users.id` as `owner_user_id` (so each attendee gets their own row)
- A `WHERE` guard to exclude the owner (avoids duplicates since the owner already has their own row)

**Step 2 -- Replace `my_client_reminders`**

Recreate with `security_invoker = true`. Logic unchanged (tenant membership + `owner_user_id = auth.uid()`).

**Step 3 -- Replace `tenant_client_reminders`**

Recreate with `security_invoker = true`. Logic unchanged (tenant membership only, all users visible to ClientAdmin).

**Step 4 -- Add composite index**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meetings_tenant_starts_at
  ON public.meetings (tenant_id, starts_at);
```

Note: `CONCURRENTLY` cannot run inside a transaction, so this will be a separate migration step.

**Step 5 -- Add index on `meeting_participants`**

The existing indexes cover `meeting_id` and `participant_email` individually, which is sufficient for the join pattern.

---

### No Legacy Table Changes

- No `ALTER TABLE` on any existing table
- No `UPDATE` or `DELETE` on existing data
- Only `CREATE OR REPLACE VIEW` and `CREATE INDEX`

---

### No Frontend Changes in This Migration

The views are already registered in the Supabase types. Once recreated, they will be queryable from the frontend via `supabase.from('my_client_reminders').select('*')`. Frontend components (Client Reminders Calendar UI) can be built in a follow-up step.

---

### Technical Detail: View SQL

**client_reminders_feed** (key change -- attendee expansion):

```sql
CREATE OR REPLACE VIEW public.client_reminders_feed
WITH (security_invoker = true) AS

-- Tasks
SELECT 'task'::text AS item_type, ...
FROM tasks_tenants tt WHERE tt.due_date IS NOT NULL

UNION ALL

-- Meetings: owner row
SELECT 'meeting'::text AS item_type,
  m.id::text AS item_id, m.tenant_id, m.title, m.starts_at, m.ends_at,
  m.owner_user_uuid AS owner_user_id,
  jsonb_build_object(..., 'role', 'owner') AS meta
FROM meetings m WHERE m.starts_at IS NOT NULL

UNION ALL

-- Meetings: attendee rows (matched via email)
SELECT 'meeting'::text AS item_type,
  m.id::text AS item_id, m.tenant_id, m.title, m.starts_at, m.ends_at,
  u.id AS owner_user_id,
  jsonb_build_object(..., 'role', 'attendee') AS meta
FROM meetings m
JOIN meeting_participants mp ON mp.meeting_id = m.id
JOIN users u ON lower(u.email) = lower(mp.participant_email)
WHERE m.starts_at IS NOT NULL
  AND u.id IS DISTINCT FROM m.owner_user_uuid

UNION ALL

-- Calendar entry reminders
SELECT 'reminder'::text AS item_type, ...
FROM calendar_entries ce WHERE ce.entry_date IS NOT NULL;
```

**my_client_reminders** and **tenant_client_reminders** retain their existing filter logic, just rebuilt with `security_invoker = true`.

---

### Acceptance Criteria Covered

| Criteria | Status |
|---|---|
| Views exist and compile | Will be recreated |
| ClientUser scoping (owner_user_id = auth.uid()) | Preserved in my_client_reminders |
| ClientAdmin scoping (all tenant items) | Preserved in tenant_client_reminders |
| Meeting attendee expansion | New: via meeting_participants + users join |
| No legacy table changes | Confirmed: views and indexes only |
| security_invoker enabled | New: added to all three views |
| Composite index on meetings | New: (tenant_id, starts_at) |
