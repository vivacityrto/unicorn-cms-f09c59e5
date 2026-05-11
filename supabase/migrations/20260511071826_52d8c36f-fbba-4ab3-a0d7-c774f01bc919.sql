-- Step 1: fn_tm_on_message_insert with access_scope filter
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

-- Step 2: fn_notify_conversation_participants with access_scope filter
CREATE OR REPLACE FUNCTION public.fn_notify_conversation_participants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _participant RECORD;
  _conv_subject text;
  _tenant_id bigint;
BEGIN
  SELECT subject, tenant_id INTO _conv_subject, _tenant_id
  FROM public.tenant_conversations WHERE id = NEW.conversation_id;

  IF _tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

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
    INSERT INTO public.user_notifications (user_id, tenant_id, type, title, message, link, is_read, created_by, created_at)
    VALUES (_participant.user_id, _tenant_id, 'message', COALESCE(_conv_subject, 'New message'), LEFT(NEW.body, 200), '/client/communications', false, NEW.sender_id, now());
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Step 3: backfill — remove 27 contaminated rows
DELETE FROM public.user_notifications n
USING public.tenant_users tu
WHERE n.type = 'message'
  AND tu.user_id = n.user_id
  AND tu.tenant_id = n.tenant_id
  AND tu.access_scope = 'academy_only';