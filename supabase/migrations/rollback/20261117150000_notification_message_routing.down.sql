-- Rollback for 20261117150000_notification_message_routing.sql
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Restores fn_tm_on_message_insert to the live version from migration
-- 20260703061102 (the staff fan-out), drops the shadow trigger, the escalation
-- job, function and tables, and the settings table. Notifications already
-- written keep their rows; the routing_reason in their metadata is harmless.
-- Escalation notifications already created (dedupe_key like 'tm-esc:%') stay
-- unless removed by hand.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notification-escalate-unread-client-messages';
  END IF;
END
$cron$;

DROP TRIGGER IF EXISTS trg_tm_zz_routing_shadow ON public.tenant_messages;

CREATE OR REPLACE FUNCTION public.fn_tm_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  _participant   RECORD;
  _conv_subject  text;
  _tenant_id     bigint;
  _tenant_name   text;
  _staff_title   text;
BEGIN
  UPDATE public.tenant_conversations
     SET last_message_at      = NEW.created_at,
         last_message_preview = public.fn_truncate_preview(NEW.body, 200),
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
        public.fn_truncate_preview(NEW.body, 200),
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
$fn$;

DROP FUNCTION IF EXISTS public.fn_tm_routing_shadow();
DROP FUNCTION IF EXISTS public.escalate_unread_client_messages(timestamptz);
DROP FUNCTION IF EXISTS public.notification_working_seconds(uuid, timestamptz, timestamptz);
DROP TABLE IF EXISTS public.notification_escalations;
DROP TABLE IF EXISTS public.notification_routing_shadow_log;
DROP FUNCTION IF EXISTS public.notification_setting(text, text);
DROP TABLE IF EXISTS public.notification_routing_settings;
