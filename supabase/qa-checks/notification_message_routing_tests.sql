-- QA ONLY (unicorn-qa). Rolled-back behaviour tests for notification message
-- routing (20261117150000_notification_message_routing.sql, which needs the
-- foundation 20261117140000). Same QA personas as notification_routing_tests.sql:
-- tenant 54 has the Team Member as primary CSC, tenant 55 has no CSC.
-- Everything runs in one transaction that is rolled back.
-- Result: one row per check; any ok = false fails.

BEGIN;

CREATE TEMP TABLE _t (name text, ok boolean, detail text);
GRANT ALL ON _t TO authenticated, anon;

CREATE FUNCTION pg_temp.act(p_uid uuid, p_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END $f$;

CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $f$;

-- Create a conversation and one message; returns the message id.
CREATE FUNCTION pg_temp.send(p_tenant bigint, p_sender uuid, p_type text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_conv uuid; v_msg uuid;
BEGIN
  INSERT INTO public.tenant_conversations (tenant_id, created_by_user_uuid, topic, subject)
  VALUES (p_tenant, p_sender, 'general', 'QA routing test') RETURNING id INTO v_conv;
  INSERT INTO public.tenant_messages (conversation_id, tenant_id, sender_user_uuid, sender_type, body)
  VALUES (v_conv, p_tenant, p_sender, p_type, 'QA routing test message') RETURNING id INTO v_msg;
  RETURN v_msg;
END $f$;

DO $t$
DECLARE
  sa   uuid := 'ada3ae59-4848-41f6-86dd-59ee1004488c';  -- Super Admin, CSC on tenant 6372
  tm   uuid := '2545941c-6e4d-9f2b-d86a-9a8dac298ac3';  -- Team Member, primary CSC on tenant 54
  tl   uuid := '83ac1f71-3cf5-71f3-3414-f2c8e91e378a';  -- Team Leader, active
  int1 uuid := 'deb8aaba-bfe8-9e95-66ba-962c56d19576';  -- Integrator, active
  int2 uuid := '772f8570-18b1-338b-5c07-6b421e880105';  -- is_system_account = true (legacy fan-out still includes it)
  cl   uuid := '4131db90-24ec-1fc8-452e-1dce57618ed2';  -- client user, tenant 54
  staff uuid[] := ARRAY[sa, tm, tl, int1, int2, 'ef5bbf62-2abf-9d53-2075-21b8d25c2265'::uuid];
  m uuid; m2 uuid; n int; n2 int; n3 int; v text; v_ids text;
BEGIN
  RESET ROLE;

  -- 1. Seeds are inert.
  SELECT string_agg(key || '=' || value, ',' ORDER BY key) INTO v FROM public.notification_routing_settings;
  INSERT INTO _t VALUES ('settings are seeded inert', v = 'escalation_enabled=false,escalation_hours=4,message_routing_mode=legacy', v);

  -- 2. Legacy mode: every active internal staff member except the sender (the disabled account is skipped).
  m := pg_temp.send(54, cl, 'client');
  SELECT count(*), string_agg(DISTINCT metadata ->> 'routing_reason', ',') INTO n, v
    FROM public.user_notifications WHERE dedupe_key LIKE 'tm:' || m || ':%' AND user_id = ANY (staff);
  INSERT INTO _t VALUES ('legacy mode still notifies all active internal staff', n = 5 AND v = 'legacy_staff', 'rows=' || n || ' reason=' || coalesce(v, ''));
  SELECT count(*) INTO n FROM public.notification_routing_shadow_log WHERE message_id = m;
  INSERT INTO _t VALUES ('no shadow rows in legacy mode', n = 0, 'rows=' || n);

  -- 3. A staff-sent message gives no staff notification (unchanged).
  m := pg_temp.send(54, tm, 'staff');
  SELECT count(*) INTO n FROM public.user_notifications WHERE dedupe_key LIKE 'tm:' || m || ':%' AND user_id = ANY (staff);
  INSERT INTO _t VALUES ('staff-sent message notifies no staff', n = 0, 'rows=' || n);

  -- 4. Shadow mode: legacy behaviour plus a log of the difference.
  UPDATE public.notification_routing_settings SET value = 'shadow' WHERE key = 'message_routing_mode';
  m := pg_temp.send(54, cl, 'client');
  SELECT count(*) INTO n FROM public.user_notifications WHERE dedupe_key LIKE 'tm:' || m || ':%' AND user_id = ANY (staff);
  INSERT INTO _t VALUES ('shadow mode keeps the legacy notifications', n = 5, 'rows=' || n);
  SELECT count(*) FILTER (WHERE legacy_notified AND resolver_would_notify),
         count(*) FILTER (WHERE legacy_notified AND NOT resolver_would_notify),
         count(*) FILTER (WHERE NOT legacy_notified AND resolver_would_notify)
    INTO n, n2, n3 FROM public.notification_routing_shadow_log WHERE message_id = m;
  INSERT INTO _t VALUES ('shadow log: owner agrees, four others only in legacy, none only in resolver',
    n = 1 AND n2 = 4 AND n3 = 0, 'both=' || n || ' legacy_only=' || n2 || ' resolver_only=' || n3);
  SELECT resolver_reason INTO v FROM public.notification_routing_shadow_log WHERE message_id = m AND user_id = tm;
  INSERT INTO _t VALUES ('shadow log records the reason', v = 'primary_csc', coalesce(v, 'none'));
  m := pg_temp.send(54, tm, 'staff');
  SELECT count(*) INTO n FROM public.notification_routing_shadow_log WHERE message_id = m;
  INSERT INTO _t VALUES ('shadow log ignores staff-sent messages', n = 0, 'rows=' || n);

  -- 5. Resolver mode: owner only; unassigned tenant goes to Super Admins.
  UPDATE public.notification_routing_settings SET value = 'resolver' WHERE key = 'message_routing_mode';
  m := pg_temp.send(54, cl, 'client');
  SELECT count(*), string_agg(user_id::text || ':' || (metadata ->> 'routing_reason'), ',') INTO n, v_ids
    FROM public.user_notifications WHERE dedupe_key LIKE 'tm:' || m || ':%' AND user_id = ANY (staff);
  INSERT INTO _t VALUES ('resolver mode notifies only the primary CSC', n = 1 AND v_ids = tm::text || ':primary_csc', coalesce(v_ids, 'none'));
  m2 := pg_temp.send(55, cl, 'client');
  SELECT count(*), string_agg(user_id::text || ':' || (metadata ->> 'routing_reason'), ',') INTO n, v_ids
    FROM public.user_notifications WHERE dedupe_key LIKE 'tm:' || m2 || ':%' AND user_id = ANY (staff);
  INSERT INTO _t VALUES ('unassigned tenant notifies Super Admins only', n = 1 AND v_ids = sa::text || ':unassigned', coalesce(v_ids, 'none'));
  m2 := pg_temp.send(54, tm, 'staff');
  SELECT count(*) INTO n FROM public.user_notifications WHERE dedupe_key LIKE 'tm:' || m2 || ':%' AND user_id = ANY (staff);
  INSERT INTO _t VALUES ('resolver mode: staff-sent message still notifies no staff', n = 0, 'rows=' || n);

  -- 6. Working time in the person's own calendar (Sydney, Mon to Fri 09:00 to 17:00).
  UPDATE public.users SET timezone = 'Australia/Sydney', working_days = '["mon","tue","wed","thu","fri"]'::jsonb,
         working_hours = '{"start":"09:00","end":"17:00"}'::jsonb WHERE user_uuid = tl;
  SELECT public.notification_working_seconds(tl, '2026-11-20 16:00 Australia/Sydney', '2026-11-23 10:00 Australia/Sydney') INTO n;
  INSERT INTO _t VALUES ('Friday 4 pm to Monday 10 am is 2 working hours', n = 7200, 'seconds=' || n);
  SELECT public.notification_working_seconds(tl, '2026-11-21 10:00 Australia/Sydney', '2026-11-22 15:00 Australia/Sydney') INTO n;
  INSERT INTO _t VALUES ('a weekend is 0 working hours', n = 0, 'seconds=' || n);
  SELECT public.notification_working_seconds(tl, '2026-11-18 09:30 Australia/Sydney', '2026-11-18 11:00 Australia/Sydney') INTO n;
  INSERT INTO _t VALUES ('within one day counts the overlap', n = 5400, 'seconds=' || n);
  SELECT public.notification_working_seconds(tl, '2026-11-18 11:00 Australia/Sydney', '2026-11-18 09:30 Australia/Sydney') INTO n;
  INSERT INTO _t VALUES ('reversed range is 0', n = 0, 'seconds=' || n);
  UPDATE public.users SET timezone = NULL, working_days = NULL, working_hours = NULL WHERE user_uuid = tl;
  SELECT public.notification_working_seconds(tl, '2026-11-18 09:00 Australia/Sydney', '2026-11-18 17:00 Australia/Sydney') INTO n;
  INSERT INTO _t VALUES ('blank profile falls back to Sydney 9 to 5, Monday to Friday', n = 28800, 'seconds=' || n);

  -- 7. Escalation. Off by default.
  m := pg_temp.send(54, cl, 'client');
  UPDATE public.user_notifications SET created_at = now() - interval '4 days' WHERE dedupe_key LIKE 'tm:' || m || ':%';
  SELECT public.escalate_unread_client_messages() INTO n;
  INSERT INTO _t VALUES ('escalation does nothing while switched off', n = 0, 'escalated=' || n);

  UPDATE public.notification_routing_settings SET value = 'true' WHERE key = 'escalation_enabled';
  m2 := pg_temp.send(54, cl, 'client');  -- fresh message, not yet overdue
  SELECT public.escalate_unread_client_messages() INTO n;
  INSERT INTO _t VALUES ('an overdue unread message escalates once, a fresh one does not', n = 1, 'escalated=' || n);
  SELECT count(*), string_agg(DISTINCT metadata ->> 'routing_reason', ',') INTO n, v
    FROM public.user_notifications WHERE dedupe_key = 'tm-esc:' || m || ':' || sa;
  INSERT INTO _t VALUES ('the Super Admin receives the escalation', n = 1 AND v = 'escalation', 'rows=' || n);
  SELECT count(*) INTO n FROM public.user_notifications WHERE dedupe_key LIKE 'tm-esc:' || m2 || ':%';
  INSERT INTO _t VALUES ('a fresh message is not escalated', n = 0, 'rows=' || n);
  SELECT count(*) INTO n FROM public.notification_escalations WHERE message_id = m;
  INSERT INTO _t VALUES ('escalation is recorded', n = 1, '');
  SELECT public.escalate_unread_client_messages() INTO n;
  INSERT INTO _t VALUES ('a message is escalated only once', n = 0, 'escalated=' || n);

  -- A read owner notification stops escalation.
  m2 := pg_temp.send(54, cl, 'client');
  UPDATE public.user_notifications SET created_at = now() - interval '4 days', is_read = true WHERE dedupe_key LIKE 'tm:' || m2 || ':%';
  SELECT public.escalate_unread_client_messages() INTO n;
  INSERT INTO _t VALUES ('a read owner notification stops escalation', n = 0, 'escalated=' || n);

  -- Legacy notifications are never escalated (no owner reason).
  UPDATE public.notification_routing_settings SET value = 'legacy' WHERE key = 'message_routing_mode';
  m2 := pg_temp.send(54, cl, 'client');
  UPDATE public.user_notifications SET created_at = now() - interval '4 days' WHERE dedupe_key LIKE 'tm:' || m2 || ':%';
  SELECT public.escalate_unread_client_messages() INTO n;
  INSERT INTO _t VALUES ('legacy-mode notifications are not escalated', n = 0, 'escalated=' || n);

  -- 8. Privileges.
  PERFORM pg_temp.act(tm);
  INSERT INTO _t VALUES ('staff cannot run the escalation job',
    pg_temp.try($$SELECT public.escalate_unread_client_messages()$$) = '42501', '');
  INSERT INTO _t VALUES ('staff cannot read the settings table unless Super Admin',
    (SELECT count(*) FROM public.notification_routing_settings) = 0, '');
  INSERT INTO _t VALUES ('staff cannot write the settings table',
    pg_temp.try($$UPDATE public.notification_routing_settings SET value = 'resolver' WHERE key = 'message_routing_mode'$$) = '42501', '');
  RESET ROLE;
  PERFORM pg_temp.act(sa);
  SELECT count(*) INTO n FROM public.notification_routing_settings;
  SELECT count(*) INTO n2 FROM public.notification_routing_shadow_log;
  INSERT INTO _t VALUES ('Super Admin can read settings and the shadow log', n = 3 AND n2 > 0, 'settings=' || n || ' shadow=' || n2);
  INSERT INTO _t VALUES ('Super Admin cannot write the settings table directly',
    pg_temp.try($$UPDATE public.notification_routing_settings SET value = 'resolver' WHERE key = 'message_routing_mode'$$) = '42501', '');
  RESET ROLE;
  PERFORM pg_temp.act(NULL, 'anon');
  INSERT INTO _t VALUES ('anon cannot read the shadow log',
    pg_temp.try($$SELECT count(*) FROM public.notification_routing_shadow_log$$) = '42501', '');
  RESET ROLE;

  -- 9. Settings constraints.
  INSERT INTO _t VALUES ('an invalid routing mode is rejected',
    pg_temp.try($$UPDATE public.notification_routing_settings SET value = 'everyone' WHERE key = 'message_routing_mode'$$) = '23514', '');
  INSERT INTO _t VALUES ('a non-numeric escalation window is rejected',
    pg_temp.try($$UPDATE public.notification_routing_settings SET value = 'soon' WHERE key = 'escalation_hours'$$) = '23514', '');
END
$t$;

SELECT name, ok, detail FROM _t ORDER BY ok, name;
ROLLBACK;
