
-- M1 — RLS hardening on public.tenant_messages
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

-- M2 — Send-event audit trigger
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

-- M3 — Conversation-touch + idempotent notification fan-out
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

-- M4 — Deprecate public.messages
COMMENT ON TABLE public.messages IS
'DEPRECATED: superseded by public.tenant_messages as of the messaging cutover sprint.
Hard-drop deferred to a follow-up sprint after one full release with confirmed zero reads.
RLS, indexes, and triggers intentionally left in place until hard-drop.';

-- M5 — Realtime publication + replica identity
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
