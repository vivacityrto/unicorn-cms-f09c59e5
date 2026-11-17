-- Notification message routing (rollout step 2). Design and decisions:
-- docs/kb/reference/notification-redesign-2026-11-17.md
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Requires 20261117140000_notification_routing_foundation.sql (the resolver).
--
-- INERT BY DEFAULT: the message routing mode is 'legacy' and escalation is off,
-- so applying this file changes no notification. fn_tm_on_message_insert is
-- replaced by a version that behaves exactly as before in 'legacy' mode.
--
--   message_routing_mode = legacy    today's behaviour: every client-sent message notifies all active internal staff
--   message_routing_mode = shadow    legacy behaviour, plus a log of what the resolver would have done instead
--   message_routing_mode = resolver  client-sent messages notify the resolver's recipients only (owner-only plus escalation)
--
-- Adds:
--   public.notification_routing_settings        mode, escalation switch and hours (Super Admin read; changed by audited SQL)
--   public.notification_routing_shadow_log      per message and person: legacy vs resolver (Super Admin read)
--   public.notification_escalations             one row per escalated message (Super Admin read)
--   public.notification_setting(text, text)     read a setting
--   public.notification_working_seconds(...)    working time between two instants, in a person's own calendar
--   public.fn_tm_on_message_insert()            REPLACED: same logic, plus the resolver branch
--   public.fn_tm_routing_shadow()               shadow-log trigger function
--   trg_tm_zz_routing_shadow on tenant_messages fires after trg_tm_on_message_insert (trigger name order)
--   public.escalate_unread_client_messages(timestamptz)  one escalation to Super Admins after N working hours unread
--   pg_cron job 'notification-escalate-unread-client-messages' (only where pg_cron is installed; does nothing until escalation_enabled = true)

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_routing_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT nrs_mode  CHECK (key <> 'message_routing_mode' OR value IN ('legacy', 'shadow', 'resolver')),
  CONSTRAINT nrs_bool  CHECK (key <> 'escalation_enabled'   OR value IN ('true', 'false')),
  CONSTRAINT nrs_hours CHECK (key <> 'escalation_hours'     OR value ~ '^[0-9]{1,3}$')
);

INSERT INTO public.notification_routing_settings (key, value) VALUES
  ('message_routing_mode', 'legacy'),
  ('escalation_enabled',   'false'),
  ('escalation_hours',     '4')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notification_setting(p_key text, p_default text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT COALESCE((SELECT s.value FROM public.notification_routing_settings s WHERE s.key = p_key), p_default);
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Shadow log and escalation record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_routing_shadow_log (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id            uuid NOT NULL,
  conversation_id       uuid,
  tenant_id             bigint,
  user_id               uuid NOT NULL,
  legacy_notified       boolean NOT NULL,
  resolver_would_notify boolean NOT NULL,
  resolver_reason       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nrsl_message ON public.notification_routing_shadow_log (message_id);
CREATE INDEX IF NOT EXISTS nrsl_created ON public.notification_routing_shadow_log (created_at);

CREATE TABLE IF NOT EXISTS public.notification_escalations (
  message_id   uuid PRIMARY KEY,
  tenant_id    bigint,
  escalated_at timestamptz NOT NULL DEFAULT now(),
  recipients   integer NOT NULL DEFAULT 0
);

REVOKE ALL ON public.notification_routing_settings, public.notification_routing_shadow_log,
              public.notification_escalations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_routing_settings, public.notification_routing_shadow_log,
                public.notification_escalations TO authenticated;
GRANT ALL ON public.notification_routing_settings, public.notification_routing_shadow_log,
             public.notification_escalations TO service_role;

ALTER TABLE public.notification_routing_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_routing_shadow_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_escalations         ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_routing_settings_super_admin_read ON public.notification_routing_settings
  FOR SELECT TO authenticated USING (public.is_super_admin_safe(auth.uid()));
CREATE POLICY notification_routing_shadow_log_super_admin_read ON public.notification_routing_shadow_log
  FOR SELECT TO authenticated USING (public.is_super_admin_safe(auth.uid()));
CREATE POLICY notification_escalations_super_admin_read ON public.notification_escalations
  FOR SELECT TO authenticated USING (public.is_super_admin_safe(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Working time in a person's own calendar. Uses users.timezone,
--    working_days (['mon', ...]) and working_hours ({"start","end"}); blank
--    values fall back to Australia/Sydney, Monday to Friday, 09:00 to 17:00.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_working_seconds(p_user uuid, p_from timestamptz, p_to timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  WITH cfg AS (
    SELECT COALESCE(NULLIF(u.timezone, ''), 'Australia/Sydney') AS tz,
           CASE WHEN u.working_days IS NULL
                  OR jsonb_typeof(u.working_days) <> 'array'
                  OR jsonb_array_length(u.working_days) = 0
                THEN ARRAY['mon', 'tue', 'wed', 'thu', 'fri']
                ELSE ARRAY(SELECT lower(d) FROM jsonb_array_elements_text(u.working_days) AS d)
           END AS days,
           COALESCE((u.working_hours ->> 'start')::time, TIME '09:00') AS st,
           COALESCE((u.working_hours ->> 'end')::time,   TIME '17:00') AS en
      FROM (SELECT 1) AS one
      LEFT JOIN public.users u ON u.user_uuid = p_user
  )
  SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(w.we, p_to) - GREATEST(w.ws, p_from))))), 0)::bigint
    FROM cfg
    CROSS JOIN LATERAL generate_series(
           ((p_from AT TIME ZONE cfg.tz)::date - 1)::timestamp,
           ((p_to   AT TIME ZONE cfg.tz)::date + 1)::timestamp,
           interval '1 day') AS d(day)
    CROSS JOIN LATERAL (
           SELECT ((d.day::date + cfg.st) AT TIME ZONE cfg.tz) AS ws,
                  ((d.day::date + cfg.en) AT TIME ZONE cfg.tz) AS we) AS w
   WHERE p_to > p_from
     AND (ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[EXTRACT(DOW FROM d.day::date)::int + 1] = ANY (cfg.days);
$fn$;

-- ---------------------------------------------------------------------------
-- 4. The message trigger function. Identical to the live version (migration
--    20260703061102) for Branch A and for the legacy staff fan-out; the only
--    additions are the mode switch, the resolver branch and a routing_reason in
--    each notification's metadata. A notification failure still never blocks the
--    message save.
-- ---------------------------------------------------------------------------
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
  _mode          text;
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
    _mode := public.notification_setting('message_routing_mode', 'legacy');

    FOR _participant IN
      SELECT cp.user_id AS user_id,
             coalesce(_conv_subject, 'New message') AS title,
             'tenant_participant'::text AS reason
        FROM public.conversation_participants cp
        JOIN public.tenant_users tu
          ON tu.user_id   = cp.user_id
         AND tu.tenant_id = _tenant_id
       WHERE cp.conversation_id = NEW.conversation_id
         AND cp.user_id <> NEW.sender_user_uuid
         AND COALESCE(tu.access_scope, '') <> 'academy_only'

      UNION

      SELECT u.user_uuid AS user_id,
             _staff_title AS title,
             'legacy_staff'::text AS reason
        FROM public.users u
       WHERE NEW.sender_type = 'client'
         AND _mode <> 'resolver'
         AND u.is_vivacity_internal = true
         AND COALESCE(u.archived, false) = false
         AND COALESCE(u.disabled, false) = false
         AND u.user_uuid <> NEW.sender_user_uuid

      UNION

      SELECT r.user_id AS user_id,
             _staff_title AS title,
             r.reason AS reason
        FROM public.resolve_notification_recipients('client_message', _tenant_id, NEW.sender_user_uuid) r
       WHERE NEW.sender_type = 'client'
         AND _mode = 'resolver'
         AND r.in_app
    LOOP
      INSERT INTO public.user_notifications
        (user_id, tenant_id, type, title, message, link,
         source_id, is_read, created_by, dedupe_key, metadata)
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
        'tm:' || NEW.id::text || ':' || _participant.user_id::text,
        jsonb_build_object('routing_reason', _participant.reason)
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

-- ---------------------------------------------------------------------------
-- 5. Shadow log: in 'shadow' mode, record for each client-sent message who the
--    legacy fan-out notified and who the resolver would have. Never blocks the
--    message save.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tm_routing_shadow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_tenant bigint;
BEGIN
  IF NEW.sender_type IS DISTINCT FROM 'client' THEN
    RETURN NEW;
  END IF;
  IF public.notification_setting('message_routing_mode', 'legacy') <> 'shadow' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT c.tenant_id INTO v_tenant
      FROM public.tenant_conversations c
     WHERE c.id = NEW.conversation_id;
    IF v_tenant IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notification_routing_shadow_log
      (message_id, conversation_id, tenant_id, user_id, legacy_notified, resolver_would_notify, resolver_reason)
    SELECT NEW.id, NEW.conversation_id, v_tenant,
           COALESCE(l.user_id, r.user_id),
           (l.user_id IS NOT NULL),
           (r.user_id IS NOT NULL AND r.in_app),
           r.reason
      FROM (SELECT n.user_id
              FROM public.user_notifications n
              JOIN public.users u ON u.user_uuid = n.user_id AND u.is_vivacity_internal = true
             WHERE n.dedupe_key LIKE 'tm:' || NEW.id::text || ':%') l
      FULL JOIN public.resolve_notification_recipients('client_message', v_tenant, NEW.sender_user_uuid) r
        ON r.user_id = l.user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_tm_routing_shadow failed for message %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_tm_zz_routing_shadow ON public.tenant_messages;
CREATE TRIGGER trg_tm_zz_routing_shadow
  AFTER INSERT ON public.tenant_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_tm_routing_shadow();

-- ---------------------------------------------------------------------------
-- 6. Escalation: a client message whose owner notifications (primary CSC and
--    delegates) are all still unread after N working hours of the primary CSC's
--    own calendar is escalated once to Super Admins who were not already told.
--    Does nothing unless escalation_enabled = 'true'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalate_unread_client_messages(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_hours   integer;
  v_count   integer := 0;
  v_rows    integer;
  r         record;
BEGIN
  IF public.notification_setting('escalation_enabled', 'false') <> 'true' THEN
    RETURN 0;
  END IF;
  v_hours := public.notification_setting('escalation_hours', '4')::integer;

  FOR r IN
    SELECT split_part(n.dedupe_key, ':', 2)::uuid AS message_id,
           min(n.created_at) AS first_at,
           (array_agg(n.user_id ORDER BY (n.metadata ->> 'routing_reason' = 'primary_csc') DESC, n.created_at))[1] AS clock_user,
           (array_agg(n.title ORDER BY n.created_at))[1]      AS title,
           (array_agg(n.message ORDER BY n.created_at))[1]    AS message,
           (array_agg(n.link ORDER BY n.created_at))[1]       AS link,
           (array_agg(n.source_id ORDER BY n.created_at))[1]  AS source_id,
           (array_agg(n.tenant_id ORDER BY n.created_at))[1]  AS tenant_id,
           (array_agg(n.created_by ORDER BY n.created_at))[1] AS created_by
      FROM public.user_notifications n
     WHERE n.type = 'message'
       AND n.dedupe_key LIKE 'tm:%'
       AND n.metadata ->> 'routing_reason' IN ('primary_csc', 'delegate')
       AND n.created_at > p_now - interval '7 days'
       AND NOT EXISTS (
             SELECT 1 FROM public.notification_escalations e
              WHERE e.message_id = split_part(n.dedupe_key, ':', 2)::uuid)
     GROUP BY 1
    HAVING NOT bool_or(n.is_read)
     ORDER BY min(n.created_at)
     LIMIT 200
  LOOP
    IF public.notification_working_seconds(r.clock_user, r.first_at, p_now) < v_hours * 3600 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.user_notifications
      (user_id, tenant_id, type, title, message, link, source_id, is_read, created_by, dedupe_key, metadata)
    SELECT rec.user_id, r.tenant_id, 'message',
           'Unanswered ' || v_hours || 'h: ' || r.title,
           r.message, r.link, r.source_id, false, r.created_by,
           'tm-esc:' || r.message_id::text || ':' || rec.user_id::text,
           jsonb_build_object('routing_reason', 'escalation')
      FROM public.resolve_notification_recipients('platform_alert', NULL) rec
     WHERE rec.in_app
       AND NOT EXISTS (
             SELECT 1 FROM public.user_notifications o
              WHERE o.dedupe_key = 'tm:' || r.message_id::text || ':' || rec.user_id::text)
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    INSERT INTO public.notification_escalations (message_id, tenant_id, recipients)
    VALUES (r.message_id, r.tenant_id, v_rows)
    ON CONFLICT (message_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Function privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.notification_setting(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_working_seconds(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_unread_client_messages(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tm_routing_shadow() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.notification_setting(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_working_seconds(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_unread_client_messages(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Escalation job, only where pg_cron is installed (it is not on unicorn-qa).
--    Every 15 minutes; a no-op until escalation_enabled = 'true'.
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notification-escalate-unread-client-messages';
    PERFORM cron.schedule('notification-escalate-unread-client-messages', '*/15 * * * *',
                          'select public.escalate_unread_client_messages()');
  END IF;
END
$cron$;
