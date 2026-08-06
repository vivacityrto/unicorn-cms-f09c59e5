# Messaging Pipeline

> **Last updated:** 2026-07-03 · **Reconsider by:** 2026-10-03 · **Confidence:** high — verified directly against live DB and migration history.
>
> **Reflects codebase:** `unicorn-cms-f09c59e5@2782e17f` · **Migration verified:** `20260703061102`

---

## Two tables, one live

There are two message tables. Only one is active.

| Table | Status | Rows | Notes |
|-------|--------|------|-------|
| `public.messages` | **DEPRECATED** | 0 | Superseded by `tenant_messages` at the messaging cutover sprint. Hard-drop deferred. RLS, indexes, and triggers intentionally left in place until drop. |
| `public.tenant_messages` | **LIVE** | 86+ | Active table — all message writes go here. |

When debugging or fixing anything related to messages or message notifications, **work only with `tenant_messages` and its triggers**. Do not touch the `messages` table — it will be hard-dropped in a follow-up sprint.

---

## Trigger chain (live)

New row in `tenant_messages` fires two triggers:

```
tenant_messages INSERT
  ├── trg_tm_on_message_insert        → fn_tm_on_message_insert()
  │     ├── Updates tenant_conversations.last_message_at / last_message_preview
  │     └── Inserts user_notifications for each eligible participant
  └── trg_audit_tenant_message_send   → fn_audit_tenant_message_send()
        └── Writes audit_events row (message_sent)
```

The deprecated `messages` table also has `trg_notify_conversation_participants` → `fn_notify_conversation_participants()` and `trg_update_conversation_on_message` → `fn_update_conversation_on_message()`. These **never fire** (zero rows) and will be dropped with the table.

---

## `fn_tm_on_message_insert` — notification logic

As of migration `20260703061102`, the recipient set is a UNION of two branches:

```sql
FOR _participant IN
  -- Branch A: scoped tenant participants (always)
  SELECT cp.user_id AS user_id, coalesce(_conv_subject, 'New message') AS title
    FROM public.conversation_participants cp
    JOIN public.tenant_users tu
      ON tu.user_id = cp.user_id
     AND tu.tenant_id = _tenant_id        -- scoped to this conversation's tenant
   WHERE cp.conversation_id = NEW.conversation_id
     AND cp.user_id <> NEW.sender_user_uuid
     AND COALESCE(tu.access_scope, '') <> 'academy_only'  -- academy filter

  UNION

  -- Branch B: all active internal Vivacity/ComplyHub staff (only when the
  -- client sent the message — staff-to-staff/staff-to-client traffic on the
  -- same thread does not re-trigger this branch)
  SELECT u.user_uuid AS user_id, _staff_title AS title   -- tenant-name-prefixed
    FROM public.users u
   WHERE NEW.sender_type = 'client'
     AND u.is_vivacity_internal = true
     AND COALESCE(u.archived, false) = false
     AND COALESCE(u.disabled, false) = false
     AND u.user_uuid <> NEW.sender_user_uuid
LOOP
  INSERT INTO public.user_notifications (...)
  ON CONFLICT (dedupe_key) DO NOTHING;
END LOOP;
```

Key behaviours:

| Scenario | Result |
|----------|--------|
| `access_scope = 'academy_only'` | Excluded from Branch A — no notification |
| No `tenant_users` row for this tenant | Excluded from Branch A by INNER JOIN — no notification, no error |
| User in `tenant_users` for multiple tenants | Only the row matching the conversation's `tenant_id` is evaluated (Branch A) |
| `access_scope = 'full'` (primary/secondary contact) | Receives notification via Branch A |
| **Any active `is_vivacity_internal` staff user, on a client-sent message** | **Receives notification via Branch B, title prefixed with the tenant's display name** (`public.tenants.name`) — added 2026-07-03, see below |
| Staff-sent message (`sender_type = 'staff'`) | Branch B returns zero rows — only Branch A (existing tenant-scoped participants) fires, unchanged from prior behaviour |
| Duplicate message event | `ON CONFLICT (dedupe_key) DO NOTHING` — safe |
| Staff user who is *also* a scoped Branch A participant (rare) | No duplicate row (unique `dedupe_key` collapses it), but which branch's title wins is non-deterministic — accepted edge case, near-zero real-world occurrence |
| Notification failure | Wrapped in `EXCEPTION WHEN OTHERS → RAISE WARNING` — message save is never blocked |

### Staff fan-out — added 2026-07-03

**Change:** every client-sent `tenant_messages` row now also notifies **every active internal staff user** (`is_vivacity_internal = true`, not archived, not disabled — currently 19 users), not just the tenant's assigned CSC. This was a deliberate reversal of the "not a bug" design noted below — the business wants any staff member to be able to see and act on a client message via the bell, not just whoever is a scoped `tenant_users`/`conversation_participants` row.

**Why the old design excluded staff:** see "Staff members in conversation_participants" below — it's now historical context, not current behaviour.

**Full trail:** `unicorn-audit/audit/2026-07-03-csc-message-staff-notification-fanout.md`.

---

## academy_only notification bug — resolved

**Bug:** Academy-only users (`access_scope = 'academy_only'`, `relationship_role = 'academy_user'`) were receiving `message`-type notifications via `fn_tm_on_message_insert`, which originally had no `access_scope` filter.

**Fix:** Migration `20260511071820` (applied 11 May 2026, 07:18 UTC) — unnamed MCP migration, present in `supabase_migrations.schema_migrations`.

**Backfill:** The same migration deleted 27 contaminated `user_notifications` rows for academy users. As of 12 May 2026, the academy user has zero message notifications.

**What the fix did NOT change:**
- RLS policies on `user_notifications` — untouched
- Any frontend notification code — untouched
- `fn_notify_conversation_participants` on the deprecated `messages` table — also patched in the same migration for completeness, but irrelevant since that trigger never fires

---

## Staff members in conversation_participants (historical — see 2026-07-03 change above)

Vivacity staff (e.g. `AJ@vivacity.com.au`, `carl@vivacity.com.au`) appear in `conversation_participants` for client conversations but have **no `tenant_users` row** for the client's tenant. The INNER JOIN in Branch A of `fn_tm_on_message_insert` still silently excludes them from *that* branch — this part is unchanged. What changed 2026-07-03 is that they now receive a notification via **Branch B** instead (the `is_vivacity_internal` staff fan-out), so the net effect is staff **do** now get a bell notification for client-sent messages, just via a different code path than tenant-scoped participants.

---

## Columns reference — `tenant_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK → `tenant_conversations.id` |
| `tenant_id` | bigint | NOT NULL |
| `sender_user_uuid` | uuid | NOT NULL — used by trigger as `NEW.sender_user_uuid` |
| `sender_type` | text | NOT NULL |
| `body` | text | NOT NULL |
| `meta` | jsonb | nullable |
| `created_at` | timestamptz | NOT NULL |
