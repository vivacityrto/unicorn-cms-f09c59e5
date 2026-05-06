
# Final Migration — Messaging Cutover (M1–M5)

Single transactional migration. All target tables empty in production. No data migration. Deploy before any UI changes. Amendment applied: partial unique index on `user_notifications.dedupe_key` plus `ON CONFLICT (dedupe_key) DO NOTHING` in the notification fan-out, with matching rollback.

## Scope

- M1 — Tighten RLS on `public.tenant_messages` to participant-scoped SELECT/INSERT and add a missing UPDATE policy.
- M2 — Add `AFTER INSERT` audit trigger writing to `public.audit_events`.
- M3 — Add `AFTER INSERT` orchestration trigger that touches `public.tenant_conversations` and fans out idempotent notifications into `public.user_notifications`.
- M4 — Mark `public.messages` deprecated via `COMMENT` (no drop).
- M5 — Enable Supabase Realtime on `tenant_messages` and `tenant_conversations` with `REPLICA IDENTITY FULL`.

## Migration (single transaction)

```sql
BEGIN;

-- =========================================================================
-- M1 — RLS hardening on public.tenant_messages
-- =========================================================================

DROP POLICY IF EXISTS tm_select_tenant      ON public.tenant_messages;
DROP POLICY IF EXISTS tm_select_participant ON public.tenant_messages;
DROP POLICY IF EXISTS tm_insert_tenant      ON public.tenant_messages;
DROP POLICY IF EXISTS tm_update_participant ON public.tenant_messages;

CREATE POLICY tm_select_participant
  ON public.tenant_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = tenant_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY tm_insert_tenant
  ON public.tenant_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_uuid = auth.uid()
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = tenant_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY tm_update_participant
  ON public.tenant_messages FOR UPDATE TO authenticated
  USING (
    sender_user_uuid = auth.uid()
    OR public.is_vivacity_team_safe(auth.uid())
  )
  WITH CHECK (
    sender_user_uuid = auth.uid()
    OR public.is_vivacity_team_safe(auth.uid())
  );

-- tm_select_staff, tm_insert_staff, tm_delete_staff: untouched.

-- =========================================================================
-- M2 — Send-event audit trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_tenant_message_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES (
    'tenant_message',
    NEW.id,
    'message_sent',
    NEW.sender_user_uuid,
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'tenant_id',       NEW.tenant_id,
      'sender_type',     NEW.sender_type,
      'body_length',     char_length(NEW.body)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tenant_message_send ON public.tenant_messages;
CREATE TRIGGER trg_audit_tenant_message_send
  AFTER INSERT ON public.tenant_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_tenant_message_send();

-- =========================================================================
-- M3 — Conversation-touch + idempotent notification fan-out
-- =========================================================================

-- Required so ON CONFLICT (dedupe_key) DO NOTHING has a real arbiter.
-- Partial index preserves legacy rows with NULL dedupe_key.
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_key_idx
  ON public.user_notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _participant   RECORD;
  _conv_subject  text;
  _tenant_id     bigint;
BEGIN
  -- Touch conversation
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
    RETURN NEW; -- conversation row missing; skip notify
  END IF;

  BEGIN
    FOR _participant IN
      SELECT user_id
        FROM public.conversation_participants
       WHERE conversation_id = NEW.conversation_id
         AND user_id <> NEW.sender_user_uuid
    LOOP
      INSERT INTO public.user_notifications
        (user_id, tenant_id, type, title, message, link,
         is_read, created_by, dedupe_key)
      VALUES (
        _participant.user_id,
        _tenant_id,
        'message',
        coalesce(_conv_subject, 'New message'),
        left(NEW.body, 200),
        '/client/inbox?tab=messages&conversation=' || NEW.conversation_id::text,
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
$$;

DROP TRIGGER IF EXISTS trg_tm_on_message_insert ON public.tenant_messages;
CREATE TRIGGER trg_tm_on_message_insert
  AFTER INSERT ON public.tenant_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_tm_on_message_insert();

-- =========================================================================
-- M4 — Deprecate public.messages (soft, comment only)
-- =========================================================================

COMMENT ON TABLE public.messages IS
'DEPRECATED: superseded by public.tenant_messages as of the messaging cutover sprint.
Hard-drop deferred to a follow-up sprint after one full release with confirmed zero reads.
RLS, indexes, and triggers intentionally left in place until hard-drop.';

-- =========================================================================
-- M5 — Realtime publication + replica identity
-- =========================================================================

ALTER TABLE public.tenant_messages      REPLICA IDENTITY FULL;
ALTER TABLE public.tenant_conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tenant_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tenant_conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_conversations';
  END IF;
END $$;

COMMIT;
```

## Rollback

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_tm_on_message_insert      ON public.tenant_messages;
DROP TRIGGER IF EXISTS trg_audit_tenant_message_send ON public.tenant_messages;
DROP FUNCTION IF EXISTS public.fn_tm_on_message_insert();
DROP FUNCTION IF EXISTS public.fn_audit_tenant_message_send();

DROP INDEX IF EXISTS user_notifications_dedupe_key_idx;

DROP POLICY IF EXISTS tm_update_participant ON public.tenant_messages;
DROP POLICY IF EXISTS tm_insert_tenant      ON public.tenant_messages;
DROP POLICY IF EXISTS tm_select_participant ON public.tenant_messages;

CREATE POLICY tm_insert_tenant ON public.tenant_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_user_uuid = auth.uid()
              AND public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY tm_select_tenant ON public.tenant_messages
  FOR SELECT TO authenticated
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

ALTER PUBLICATION supabase_realtime DROP TABLE public.tenant_messages;
ALTER PUBLICATION supabase_realtime DROP TABLE public.tenant_conversations;
ALTER TABLE public.tenant_messages      REPLICA IDENTITY DEFAULT;
ALTER TABLE public.tenant_conversations REPLICA IDENTITY DEFAULT;

COMMENT ON TABLE public.messages IS NULL;

COMMIT;
```

## Why these choices

- **Trigger ordering**: `trg_audit_…` fires before `trg_tm_…` by alphabetical name — audit captures the send even if orchestration fails.
- **Notify isolation**: notification loop is wrapped in `BEGIN … EXCEPTION WHEN OTHERS` so a transient `user_notifications` issue cannot block message sends.
- **Idempotency**: partial unique index on `dedupe_key` (`WHERE dedupe_key IS NOT NULL`) avoids touching legacy NULL rows, and `ON CONFLICT (dedupe_key) DO NOTHING` makes trigger re-fires (manual replay, statement retry) safe.
- **Realtime**: `REPLICA IDENTITY FULL` is required so UPDATE payloads on `tenant_conversations` (last-message touch) carry old values to subscribers; without it, change diffs would be incomplete.
- **Staff bypass preserved**: `tm_select_staff` is left intact; permissive policies OR together so Vivacity staff continue to read all conversations.
- **Re-runnable**: every DROP uses `IF EXISTS`; every CREATE pairs with a prior drop or `IF NOT EXISTS`.

## Backward-compat / impact

- `public.messages`: untouched (RLS, indexes, triggers, FKs unchanged). Latent readers continue to function until hard-drop sprint.
- `tm_select_tenant` removal is replaced by stricter `tm_select_participant` plus unchanged `tm_select_staff`. No live caller relies on tenant-wide reads without participation.
- `tm_insert_tenant` now requires the sender to be a `conversation_participants` row. UI rewrites must upsert participants before first send (covered in the upcoming UI plan, not this migration).
- New `tm_update_participant` closes a previously silent gap.
- `audit_events.entity_id` is `uuid NOT NULL` — `NEW.id` (uuid) inserts directly without cast, matching project standard.
- `user_notifications` schema confirmed: `(user_id, tenant_id, type, title, message, link, is_read, created_by, created_at, updated_at, dedupe_key, source_id)`. Defaults handle `id`, `created_at`, `updated_at`, `type`.

## Lock & deploy notes

- All DDL targets empty tables → `AccessExclusiveLock` held for milliseconds.
- `ALTER PUBLICATION ADD TABLE` takes a brief lock; safe at any time.
- `REPLICA IDENTITY FULL` on empty tables is instant.
- One transaction. No off-peak window required.

## Risk assessment

- **Low (deploy)**: empty tables, sub-second locks, transactional, idempotent.
- **Low (regression)**: no live UI consumer of the dropped policy; staff bypass preserved; `messages` table untouched.
- **Medium (post-deploy UI)**: until UI rewrites land, the new INSERT policy will reject sends from any code path that hasn't ensured a `conversation_participants` row for the sender. Mitigation: deploy DB before UI in the same release window; legacy `messages` table remains writable as a fallback (unused in practice).
- **Low (notify)**: notification failures are caught and logged via `RAISE WARNING` — never break a send.

## Out of scope (for the UI follow-up plan)

- `useClientCommunications.ts`, `TeamCommunicationsPage.tsx`, `MessageTab.tsx` rewrites: ensure participant rows exist, switch to `sender_user_uuid` + `sender_type`, drop legacy `is_read` references.
- App-layer read-event audit inserts.

## Approval gate

On approval I switch to default mode and apply this migration verbatim — no UI edits in the same step.
