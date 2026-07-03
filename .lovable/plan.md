
# Implementation Plan — Fan out client `tenant_messages` to internal staff (corrected)

Single-migration change to `public.fn_tm_on_message_insert()`. Fix applied to the tenant-name lookup: `public.tenants` PK is `id` (bigint), not `tenant_id`. Verified via catalog:

- `information_schema.columns` on `public.tenants` shows only `id` from the pair (`id`, `tenant_id`) — no `tenant_id` column exists on that table.
- `pg_index`/`pg_attribute` confirms `id` is the primary key.

`SET search_path = ''` still holds — `public.tenants.id` is already fully schema-qualified.

## 1. Final SQL — replacement function body (corrected)

```sql
CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _participant   RECORD;
  _conv_subject  text;
  _tenant_id     bigint;
  _tenant_name   text;
  _staff_title   text;
BEGIN
  -- 1. Update the conversation summary fields
  UPDATE public.tenant_conversations
     SET last_message_at      = NEW.created_at,
         last_message_preview = left(NEW.body, 200),
         updated_at           = now()
   WHERE id = NEW.conversation_id;

  -- 2. Resolve conversation subject + tenant
  SELECT subject, tenant_id
    INTO _conv_subject, _tenant_id
    FROM public.tenant_conversations
   WHERE id = NEW.conversation_id;

  IF _tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Resolve tenant display name (for staff-branch title only).
  --    public.tenants PK column is `id` (bigint), not `tenant_id`.
  SELECT name
    INTO _tenant_name
    FROM public.tenants
   WHERE id = _tenant_id;

  _staff_title := coalesce(_tenant_name, 'A client')
                  || ' — '
                  || coalesce(_conv_subject, 'New message');

  BEGIN
    -- 4. Fan-out: UNION of scoped tenant participants + (if client-sent) all
    --    active internal Vivacity staff. Dedupe key collapses any overlap
    --    to a single user_notifications row.
    FOR _participant IN
      -- Branch A: scoped tenant participants (always)
      SELECT cp.user_id AS user_id,
             coalesce(_conv_subject, 'New message') AS title
        FROM public.conversation_participants cp
        JOIN public.tenant_users tu
          ON tu.user_id   = cp.user_id
         AND tu.tenant_id = _tenant_id
       WHERE cp.conversation_id = NEW.conversation_id
         AND cp.user_id <> NEW.sender_user_uuid
         AND COALESCE(tu.access_scope, '') <> 'academy_only'

      UNION

      -- Branch B: internal Vivacity staff (only for client-sent messages)
      SELECT u.user_uuid AS user_id,
             _staff_title AS title
        FROM public.users u
       WHERE NEW.sender_type = 'client'
         AND u.is_vivacity_internal = true
         AND COALESCE(u.archived, false) = false
         AND COALESCE(u.disabled, false) = false
         AND u.user_uuid <> NEW.sender_user_uuid
    LOOP
      INSERT INTO public.user_notifications
        (user_id, tenant_id, type, title, message, link,
         source_id, is_read, created_by, dedupe_key)
      VALUES (
        _participant.user_id,
        _tenant_id,
        'message',
        _participant.title,
        left(NEW.body, 200),
        '/client/inbox?tab=messages&conversation=' || NEW.conversation_id::text,
        NEW.conversation_id::text,
        false,
        NEW.sender_user_uuid,
        'tm:' || NEW.id::text || ':' || _participant.user_id::text
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_tm_on_message_insert notify failed for message %: %',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tm_on_message_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tm_on_message_insert() TO authenticated, service_role;
```

### Schema-qualification / search_path re-check

Every object reference in the function body:

| Reference | Qualified | Notes |
|---|---|---|
| `public.tenant_conversations` | yes | UPDATE + SELECT |
| `public.tenants` (`id`, `name`) | yes | corrected PK column |
| `public.conversation_participants` | yes | Branch A |
| `public.tenant_users` | yes | Branch A join |
| `public.users` (`user_uuid`, `is_vivacity_internal`, `archived`, `disabled`) | yes | Branch B |
| `public.user_notifications` | yes | INSERT target |
| `left()`, `coalesce()`, `now()`, `::text`, `||` | `pg_catalog` | always resolvable regardless of search_path |

**`SET search_path = ''` remains correct.**

## 2. Migration ordering — single migration (unchanged)

One migration file, three statements in this order:
1. `CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert() …`
2. `REVOKE ALL ON FUNCTION public.fn_tm_on_message_insert() FROM PUBLIC;`
3. `GRANT EXECUTE ON FUNCTION public.fn_tm_on_message_insert() TO authenticated, service_role;`

No DML — the DDL/DML split rule does not apply.

## 3. Lock impact (unchanged)

Catalog-only: brief `AccessExclusiveLock` on the `pg_proc` row for this function. No lock on `tenant_messages` or `user_notifications`. No index rebuild, no rewrite.

## 4. Rollback plan (unchanged — restores current production body verbatim)

```sql
CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _participant   RECORD;
  _conv_subject  text;
  _tenant_id     bigint;
BEGIN
  UPDATE public.tenant_conversations
     SET last_message_at      = NEW.created_at,
         last_message_preview = left(NEW.body, 200),
         updated_at           = now()
   WHERE id = NEW.conversation_id;

  SELECT subject, tenant_id
    INTO _conv_subject, _tenant_id
    FROM public.tenant_conversations
   WHERE id = NEW.conversation_id;

  IF _tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
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
        _participant.user_id,
        _tenant_id,
        'message',
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_tm_on_message_insert notify failed for message %: %',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
```

## 5. Verification (unchanged)

Pre-deploy: wrap the synthetic INSERT in `BEGIN … ROLLBACK`, inspect the ~19 staff-branch rows plus any tenant-participant rows, assert no duplicate `user_id` per test message, then roll back. Post-deploy: real low-traffic client message, confirm `'<tenant name> — <subject>'` titles for staff rows, staff-sent message produces no staff-branch rows, `ON CONFLICT DO NOTHING` swallows a manual replay.

## 6. Deployment window

Single `CREATE OR REPLACE FUNCTION` plus two grant statements. No table lock, no backfill, no `VALIDATE CONSTRAINT`. **No off-peak window required.**

## Awaiting explicit approval before applying.

## Next prompt after approval

> Apply the corrected migration in `.lovable/plan.md` — one `CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()` plus `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO authenticated, service_role`. Do not touch any other function, trigger, table, or frontend file. Then run the post-deploy verification query for the test client message id I will provide.
