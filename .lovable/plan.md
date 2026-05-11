## Migration

**Name:** `filter_academy_only_from_message_notifications`

**Transactionality:** Supabase migrations run in a single implicit transaction. All three steps (function replace × 2, backfill DELETE) commit atomically — if any step fails, none are applied.

---

## Pre-deploy verification

Run before applying to confirm the contamination count matches the audit:

```sql
-- expect: 27
SELECT count(*) AS academy_only_message_notifs
FROM public.user_notifications n
JOIN public.tenant_users tu
  ON tu.user_id = n.user_id
 AND tu.tenant_id = n.tenant_id
WHERE n.type = 'message'
  AND tu.access_scope = 'academy_only';

-- baseline totals to compare against post-deploy
SELECT
  (SELECT count(*) FROM public.user_notifications WHERE type = 'message') AS total_message_notifs,
  (SELECT count(*) FROM public.user_notifications WHERE type = 'message') -
  (SELECT count(*) FROM public.user_notifications n
     JOIN public.tenant_users tu ON tu.user_id = n.user_id AND tu.tenant_id = n.tenant_id
    WHERE n.type = 'message' AND tu.access_scope = 'academy_only') AS expected_after_backfill;
```

Expected: `27`, `total = 112`, `expected_after_backfill = 85`.

---

## Migration body (single transaction)

### Step 1 — Replace `fn_tm_on_message_insert`

`CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()` — identical to current body except the participant loop becomes:

```sql
FOR _participant IN
  SELECT cp.user_id
    FROM public.conversation_participants cp
    JOIN public.tenant_users tu
      ON tu.user_id = cp.user_id
     AND tu.tenant_id = _tenant_id
   WHERE cp.conversation_id = NEW.conversation_id
     AND cp.user_id <> NEW.sender_user_uuid
     AND COALESCE(tu.access_scope, '') <> 'academy_only'
LOOP
  INSERT INTO public.user_notifications
    (user_id, tenant_id, type, title, message, link,
     source_id, is_read, created_by, dedupe_key)
  VALUES (
    _participant.user_id, _tenant_id, 'message',
    coalesce(_conv_subject, 'New message'),
    left(NEW.body, 200),
    '/client/inbox?tab=messages&conversation=' || NEW.conversation_id::text,
    NEW.conversation_id::text,
    false,
    NEW.sender_user_uuid,
    'tm:' || NEW.id::text || ':' || _participant.user_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END LOOP;
```

Preserved: `SECURITY DEFINER`, `SET search_path = public`, surrounding `BEGIN…EXCEPTION WHEN OTHERS … RAISE WARNING` block, the `tenant_conversations` UPDATE, the early `RETURN NEW` when `_tenant_id IS NULL`.

### Step 2 — Replace `fn_notify_conversation_participants`

`CREATE OR REPLACE FUNCTION public.fn_notify_conversation_participants()` — identical body except participant loop:

```sql
FOR _participant IN
  SELECT cp.user_id
    FROM public.conversation_participants cp
    JOIN public.tenant_users tu
      ON tu.user_id = cp.user_id
     AND tu.tenant_id = _tenant_id
   WHERE cp.conversation_id = NEW.conversation_id
     AND cp.user_id <> NEW.sender_id
     AND COALESCE(tu.access_scope, '') <> 'academy_only'
LOOP
  INSERT INTO public.user_notifications
    (user_id, tenant_id, type, title, message, link, is_read, created_by, created_at)
  VALUES (
    _participant.user_id, _tenant_id, 'message',
    COALESCE(_conv_subject, 'New message'),
    LEFT(NEW.body, 200),
    '/client/communications',
    false, NEW.sender_id, now()
  );
END LOOP;
```

Preserved: `SECURITY DEFINER`, `SET search_path = public`, the `tenant_conversations` lookup. Note this legacy path uses `NEW.sender_id` (column on `messages`), not `sender_user_uuid`.

### Step 3 — Backfill delete

```sql
DELETE FROM public.user_notifications n
USING public.tenant_users tu
WHERE n.type = 'message'
  AND tu.user_id = n.user_id
  AND tu.tenant_id = n.tenant_id
  AND tu.access_scope = 'academy_only';
```

Expected: 27 rows deleted, atomic with the function replacements.

---

## Post-deploy verification

```sql
-- 1. Zero contaminated rows remain
SELECT count(*) AS should_be_zero
FROM public.user_notifications n
JOIN public.tenant_users tu
  ON tu.user_id = n.user_id AND tu.tenant_id = n.tenant_id
WHERE n.type = 'message' AND tu.access_scope = 'academy_only';
-- expect: 0

-- 2. Non-academy message notifications untouched
SELECT count(*) AS non_academy_message_notifs
FROM public.user_notifications WHERE type = 'message';
-- expect: 85 (was 112 - 27)

-- 3. Functions show the new join + filter
SELECT proname, pg_get_functiondef(oid) ILIKE '%access_scope%' AS has_filter
FROM pg_proc
WHERE proname IN ('fn_tm_on_message_insert', 'fn_notify_conversation_participants');
-- expect: both has_filter = true

-- 4. Triggers still attached and enabled
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname IN ('trg_tm_on_message_insert','trg_notify_conversation_participants');
-- expect: both tgenabled = 'O'

-- 5. Spot-check non-academy delivery still works:
--    pick an active conversation with a non-academy participant and confirm
--    the most recent tenant_messages insert created a matching user_notifications row
SELECT tm.id AS message_id, cp.user_id AS participant,
       tu.access_scope,
       EXISTS (
         SELECT 1 FROM public.user_notifications n
         WHERE n.dedupe_key = 'tm:' || tm.id::text || ':' || cp.user_id::text
       ) AS notif_exists
FROM public.tenant_messages tm
JOIN public.conversation_participants cp ON cp.conversation_id = tm.conversation_id
JOIN public.tenant_users tu ON tu.user_id = cp.user_id AND tu.tenant_id = tm.tenant_id
WHERE cp.user_id <> tm.sender_user_uuid
  AND tm.created_at > now() - interval '30 days'
ORDER BY tm.created_at DESC
LIMIT 20;
-- expect: notif_exists = true for non-academy rows; no academy_only rows present
```

---

## Risk & rollback

- **Lock impact:** `CREATE OR REPLACE FUNCTION` only locks the catalog row for the function; no lock on `tenant_messages`, `messages`, `conversation_participants`, or `user_notifications`. Backfill DELETE touches 27 rows on `user_notifications` — negligible.
- **RLS / FKs:** untouched. No policy, constraint, or schema change.
- **Forward compat:** new participants who are academy-only will simply be skipped from the loop — no error path, idempotent `ON CONFLICT (dedupe_key) DO NOTHING` retained on Step 1.
- **Rollback:** revert the migration by re-applying the original two `CREATE OR REPLACE FUNCTION` bodies (recoverable from git history of this migration's diff, or from `pg_proc` snapshot we captured during audit). The 27-row DELETE is not reversible without a backup; user has approved this loss.

---

## Summary of changes

1. `fn_tm_on_message_insert` — adds `JOIN tenant_users` + `access_scope <> 'academy_only'` filter.
2. `fn_notify_conversation_participants` — same filter applied to the legacy/dormant path.
3. One-time DELETE removes 27 historical contaminated rows.

**Benefits:** Academy-only users can no longer accumulate or receive realtime fan-out for client portal `type='message'` notifications. Closes the data-at-rest gap left by the prior client-side `useClientNotifications` short-circuit. No impact on any other notification type, edge function, or client-portal user.
