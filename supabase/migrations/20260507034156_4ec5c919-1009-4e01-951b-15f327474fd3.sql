DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
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
      SELECT user_id
        FROM public.conversation_participants
       WHERE conversation_id = NEW.conversation_id
         AND user_id <> NEW.sender_user_uuid
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