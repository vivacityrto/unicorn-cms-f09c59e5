
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

  SELECT name
    INTO _tenant_name
    FROM public.tenants
   WHERE id = _tenant_id;

  _staff_title := coalesce(_tenant_name, 'A client')
                  || ' — '
                  || coalesce(_conv_subject, 'New message');

  BEGIN
    FOR _participant IN
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
