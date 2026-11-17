-- QA ONLY (unicorn-qa). Rolled-back behaviour and RLS tests for the notification
-- routing foundation (20261117140000_notification_routing_foundation.sql).
-- Uses the QA personas: a Super Admin, a Team Member, a Team Leader, an Integrator,
-- a system account, a disabled account and a client user. QA has two active CSC assignments: tenant 54 (a Team Member) and tenant
-- 6372 (the Super Admin). Tenant 55 has none, so it is the "unassigned" case.
-- Everything runs in one transaction that is rolled back, so QA is left unchanged.
-- Result: one row per check; any ok = false fails.

BEGIN;

CREATE TEMP TABLE _t (name text, ok boolean, detail text);
-- The acting roles record their own results (the pg_temp helpers are usable by any role with TEMP on the database).
GRANT ALL ON _t TO authenticated, anon;

CREATE FUNCTION pg_temp.act(p_uid uuid, p_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END $f$;

-- Run a statement, return its SQLSTATE or 'ok'. Must be called as the acting role.
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $f$;

DO $t$
DECLARE
  sa   uuid := 'ada3ae59-4848-41f6-86dd-59ee1004488c';  -- Super Admin, active CSC on tenant 6372
  tm   uuid := '2545941c-6e4d-9f2b-d86a-9a8dac298ac3';  -- Team Member, active CSC on tenant 54
  tl   uuid := '83ac1f71-3cf5-71f3-3414-f2c8e91e378a';  -- Team Leader, active, no assignment
  dis  uuid := 'ef5bbf62-2abf-9d53-2075-21b8d25c2265';  -- disabled account
  int1 uuid := 'deb8aaba-bfe8-9e95-66ba-962c56d19576';  -- Integrator
  int2 uuid := '772f8570-18b1-338b-5c07-6b421e880105';  -- system account (is_system_account = true)
  cl   uuid := '4131db90-24ec-1fc8-452e-1dce57618ed2';  -- client user, tenant 54
  d_all uuid; d_tm uuid; d_tm_bad text; n int; n2 int; v text; v_ids text;
BEGIN
  RESET ROLE;

  -- 1. Owner audience, tenant with a primary CSC: only that CSC.
  SELECT count(*), string_agg(user_id::text || ':' || reason, ',') INTO n, v_ids
    FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('client message goes only to the tenant primary CSC',
    n = 1 AND v_ids = tm::text || ':primary_csc', v_ids);

  -- 2. The actor is never a recipient (and an owned tenant does not escalate).
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54, tm);
  INSERT INTO _t VALUES ('actor is excluded', n = 0, 'rows=' || n);

  -- 3. Unassigned tenant: Super Admins only, reason unassigned.
  SELECT count(*), string_agg(user_id::text || ':' || reason, ',') INTO n, v_ids
    FROM public.resolve_notification_recipients('client_message', 55);
  INSERT INTO _t VALUES ('unassigned tenant escalates to Super Admins',
    n = 1 AND v_ids = sa::text || ':unassigned', v_ids);

  -- 4. Unknown category raises.
  INSERT INTO _t VALUES ('unknown category raises',
    pg_temp.try($$SELECT * FROM public.resolve_notification_recipients('nope', 54)$$) = 'P0001', '');

  -- 5. Task audience is the subject; platform audience is Super Admins.
  SELECT count(*), string_agg(reason, ',') INTO n, v_ids FROM public.resolve_notification_recipients('task', NULL, NULL, int1);
  INSERT INTO _t VALUES ('task goes to the assignee', n = 1 AND v_ids = 'assignee', v_ids);
  SELECT count(*), string_agg(reason, ',') INTO n, v_ids FROM public.resolve_notification_recipients('platform_alert', NULL);
  INSERT INTO _t VALUES ('platform alert goes to Super Admins', n = 1 AND v_ids = 'platform_alert', v_ids);

  -- 6. Delegate RPC: a Super Admin creates an all_csc delegate.
  PERFORM pg_temp.act(sa);
  d_all := public.create_notification_delegate('all_csc', NULL, int1);
  RESET ROLE;
  SELECT count(*) INTO n FROM public.audit_events WHERE entity = 'notification_delegate' AND entity_id = d_all AND action = 'created';
  INSERT INTO _t VALUES ('all_csc delegate created and audited', d_all IS NOT NULL AND n = 1, '');

  SELECT string_agg(user_id::text || ':' || reason, ',' ORDER BY reason) INTO v_ids
    FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('all_csc delegate receives an owned tenant with the owner',
    v_ids = int1::text || ':delegate,' || tm::text || ':primary_csc', v_ids);

  SELECT count(*), string_agg(reason, ',') INTO n, v_ids FROM public.resolve_notification_recipients('client_message', 55);
  INSERT INTO _t VALUES ('all_csc delegate gets nothing for an unassigned tenant', n = 1 AND v_ids = 'unassigned', v_ids);

  -- 7. A CSC (Team Member with an active assignment) manages their own assistants only.
  PERFORM pg_temp.act(tm);
  d_tm := public.create_notification_delegate('user', tm, tl, 54);
  INSERT INTO _t VALUES ('CSC adds own assistant for an owned tenant', d_tm IS NOT NULL, '');
  INSERT INTO _t VALUES ('CSC cannot add an assistant for a tenant they do not own',
    pg_temp.try($$SELECT public.create_notification_delegate('user', '2545941c-6e4d-9f2b-d86a-9a8dac298ac3', '83ac1f71-3cf5-71f3-3414-f2c8e91e378a', 6372)$$) = '42501', '');
  INSERT INTO _t VALUES ('CSC cannot add an assistant for another person',
    pg_temp.try($$SELECT public.create_notification_delegate('user', 'ada3ae59-4848-41f6-86dd-59ee1004488c', '772f8570-18b1-338b-5c07-6b421e880105', NULL)$$) = '42501', '');
  INSERT INTO _t VALUES ('CSC cannot create an all_csc delegate',
    pg_temp.try($$SELECT public.create_notification_delegate('all_csc', NULL, '772f8570-18b1-338b-5c07-6b421e880105')$$) = '42501', '');
  INSERT INTO _t VALUES ('CSC cannot end an all_csc link',
    pg_temp.try(format('SELECT public.end_notification_delegate(%L)', d_all)) = '42501', '');
  INSERT INTO _t VALUES ('CSC cannot write the delegates table directly',
    pg_temp.try($$INSERT INTO public.staff_notification_delegates (principal_kind, principal_user_id, delegate_user_id) VALUES ('user', '2545941c-6e4d-9f2b-d86a-9a8dac298ac3', '772f8570-18b1-338b-5c07-6b421e880105')$$) = '42501', '');
  SELECT count(*) INTO n FROM public.staff_notification_delegates;
  INSERT INTO _t VALUES ('CSC sees only links they are part of (own link, not the all_csc link)', n = 1, 'seen=' || n);
  RESET ROLE;

  SELECT string_agg(user_id::text || ':' || reason, ',' ORDER BY user_id::text) INTO v_ids
    FROM public.resolve_notification_recipients('client_message', 54);
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('owner, all_csc delegate and own-assistant delegate are all notified', n = 3, v_ids);

  PERFORM pg_temp.act(tm);
  PERFORM public.end_notification_delegate(d_tm);
  RESET ROLE;
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('ending a link stops delivery', n = 2, 'rows=' || n);
  SELECT count(*) INTO n FROM public.audit_events WHERE entity = 'notification_delegate' AND entity_id = d_tm AND action = 'ended';
  INSERT INTO _t VALUES ('end is audited', n = 1, '');

  -- 8. Non-staff, anon and invalid delegates are refused.
  PERFORM pg_temp.act(cl);
  INSERT INTO _t VALUES ('client user cannot create a delegate',
    pg_temp.try($$SELECT public.create_notification_delegate('user', '4131db90-24ec-1fc8-452e-1dce57618ed2', '772f8570-18b1-338b-5c07-6b421e880105', NULL)$$) = '42501', '');
  SELECT count(*) INTO n FROM public.notification_category;
  INSERT INTO _t VALUES ('client user sees no category rows (RLS)', n = 0, 'seen=' || n);
  RESET ROLE;
  PERFORM pg_temp.act(NULL, 'anon');
  INSERT INTO _t VALUES ('anon has no access to preferences',
    pg_temp.try($$SELECT count(*) FROM public.notification_preferences$$) = '42501', '');
  INSERT INTO _t VALUES ('anon cannot execute the delegate RPC',
    pg_temp.try($$SELECT public.create_notification_delegate('all_csc', NULL, '772f8570-18b1-338b-5c07-6b421e880105')$$) = '42501', '');
  RESET ROLE;
  PERFORM pg_temp.act(sa);
  INSERT INTO _t VALUES ('delegate must be an active internal user (client refused)',
    pg_temp.try($$SELECT public.create_notification_delegate('user', 'ada3ae59-4848-41f6-86dd-59ee1004488c', '4131db90-24ec-1fc8-452e-1dce57618ed2', NULL)$$) = '22023', '');
  INSERT INTO _t VALUES ('system account cannot be a delegate',
    pg_temp.try($$SELECT public.create_notification_delegate('user', 'ada3ae59-4848-41f6-86dd-59ee1004488c', '772f8570-18b1-338b-5c07-6b421e880105', NULL)$$) = '22023', '');
  INSERT INTO _t VALUES ('disabled user cannot be a delegate',
    pg_temp.try($$SELECT public.create_notification_delegate('user', 'ada3ae59-4848-41f6-86dd-59ee1004488c', 'ef5bbf62-2abf-9d53-2075-21b8d25c2265', NULL)$$) = '22023', '');
  INSERT INTO _t VALUES ('unknown category in a delegate is refused',
    pg_temp.try($$SELECT public.create_notification_delegate('user', 'ada3ae59-4848-41f6-86dd-59ee1004488c', '83ac1f71-3cf5-71f3-3414-f2c8e91e378a', NULL, ARRAY['nope'])$$) = '22023', '');
  INSERT INTO _t VALUES ('duplicate active link is refused',
    pg_temp.try($$SELECT public.create_notification_delegate('all_csc', NULL, 'deb8aaba-bfe8-9e95-66ba-962c56d19576')$$) = '23505', '');
  RESET ROLE;

  -- 9. Category-limited delegate only receives those categories.
  PERFORM pg_temp.act(sa);
  PERFORM public.end_notification_delegate(d_all);
  PERFORM public.create_notification_delegate('all_csc', NULL, int1, NULL, ARRAY['support_ticket']);
  RESET ROLE;
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = int1;
  SELECT count(*) INTO n2 FROM public.resolve_notification_recipients('support_ticket', 54) WHERE user_id = int1;
  INSERT INTO _t VALUES ('category-limited delegate gets only its categories', n = 0 AND n2 = 1, 'msg=' || n || ' ticket=' || n2);

  -- 10. Own preferences: off, mute, watch, opt in (resolver, written as the owner of the row).
  INSERT INTO public.notification_preferences (user_id, category, channel, enabled, scope) VALUES (tm, 'client_message', 'in_app', true, 'off');
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tm;
  INSERT INTO _t VALUES ('scope off mutes the owner', n = 0, 'rows=' || n);
  UPDATE public.notification_preferences SET scope = 'my_and_delegated' WHERE user_id = tm AND category = 'client_message';
  INSERT INTO public.notification_client_overrides VALUES (tm, 54, 'mute');
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tm;
  INSERT INTO _t VALUES ('per-client mute removes the owner for that client', n = 0, 'rows=' || n);
  DELETE FROM public.notification_client_overrides WHERE user_id = tm;
  INSERT INTO public.notification_client_overrides VALUES (tl, 54, 'watch');
  SELECT string_agg(reason, ',') INTO v_ids FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tl;
  INSERT INTO _t VALUES ('watching a client adds a non-owner', v_ids = 'watching', coalesce(v_ids, 'none'));
  DELETE FROM public.notification_client_overrides WHERE user_id = tl;
  INSERT INTO public.notification_preferences (user_id, category, channel, enabled, scope) VALUES (tl, 'client_message', 'in_app', true, 'all_clients');
  SELECT string_agg(reason, ',') INTO v_ids FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tl;
  INSERT INTO _t VALUES ('opting in to all clients adds a non-owner', v_ids = 'opted_in', coalesce(v_ids, 'none'));
  DELETE FROM public.notification_preferences WHERE user_id IN (tm, tl);

  -- 11. Channels follow the matrix: email is off by default, in-app and Teams on.
  SELECT in_app::text || teams::text || email::text INTO v
    FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tm;
  INSERT INTO _t VALUES ('default channels are in-app and Teams, not email', v = 'truetruefalse', v);

  -- 12. Excluded accounts: exempt rows and system accounts.
  INSERT INTO public.notification_exempt_users (user_id, reason) VALUES (tm, 'qa test');
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tm;
  INSERT INTO _t VALUES ('exempt account is never a recipient', n = 0, 'rows=' || n);
  DELETE FROM public.notification_exempt_users WHERE user_id = tm;
  UPDATE public.users SET is_system_account = true WHERE user_uuid = tm;
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('client_message', 54) WHERE user_id = tm;
  INSERT INTO _t VALUES ('system account is never a recipient', n = 0, 'rows=' || n);

  -- 12b. An assignment to someone who cannot be notified does not count as an owner:
  --      the tenant is treated as unassigned, so Super Admins are told and delegates are not.
  --      (tm is a system account at this point; int1 holds a support_ticket-only all_csc link.)
  SELECT count(*), string_agg(user_id::text || ':' || reason, ',') INTO n, v_ids
    FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('owner who is a system account: tenant is unassigned, Super Admin told',
    n = 1 AND v_ids = sa::text || ':unassigned', coalesce(v_ids, 'none'));
  SELECT count(*) INTO n FROM public.resolve_notification_recipients('support_ticket', 54) WHERE user_id = int1;
  INSERT INTO _t VALUES ('delegates are not told when the only owner is ineligible', n = 0, 'rows=' || n);
  UPDATE public.users SET is_system_account = false, disabled = true WHERE user_uuid = tm;
  SELECT string_agg(user_id::text || ':' || reason, ',') INTO v_ids FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('owner who is disabled: tenant is unassigned', v_ids = sa::text || ':unassigned', coalesce(v_ids, 'none'));
  UPDATE public.users SET disabled = false WHERE user_uuid = tm;
  INSERT INTO public.notification_exempt_users (user_id, reason) VALUES (tm, 'qa test');
  SELECT string_agg(user_id::text || ':' || reason, ',') INTO v_ids FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('owner who is exempt: tenant is unassigned', v_ids = sa::text || ':unassigned', coalesce(v_ids, 'none'));
  DELETE FROM public.notification_exempt_users WHERE user_id = tm;
  SELECT string_agg(user_id::text || ':' || reason, ',') INTO v_ids FROM public.resolve_notification_recipients('client_message', 54);
  INSERT INTO _t VALUES ('an eligible owner is notified again once restored', v_ids = tm::text || ':primary_csc', coalesce(v_ids, 'none'));
  SELECT string_agg(user_id::text || ':' || reason, ',' ORDER BY reason) INTO v_ids FROM public.resolve_notification_recipients('support_ticket', 54, tm);
  INSERT INTO _t VALUES ('an owner who is the actor does not make the tenant unassigned',
    v_ids = int1::text || ':delegate', coalesce(v_ids, 'none'));

  -- 13. Own-row RLS on preferences.
  PERFORM pg_temp.act(tl);
  INSERT INTO _t VALUES ('staff can write their own preference',
    pg_temp.try(format($q$INSERT INTO public.notification_preferences (user_id, category, channel, enabled) VALUES (%L, 'task', 'in_app', false)$q$, tl)) = 'ok', '');
  INSERT INTO _t VALUES ('staff cannot write someone else''s preference',
    pg_temp.try(format($q$INSERT INTO public.notification_preferences (user_id, category, channel, enabled) VALUES (%L, 'task', 'in_app', false)$q$, int2)) = '42501', '');
  INSERT INTO _t VALUES ('invalid scope is rejected',
    pg_temp.try(format($q$INSERT INTO public.notification_preferences (user_id, category, channel, enabled, scope) VALUES (%L, 'task', 'teams', true, 'everyone')$q$, tl)) = '23514', '');
  SELECT count(*) INTO n FROM public.notification_preferences WHERE user_id <> tl;
  INSERT INTO _t VALUES ('staff do not see other people''s preferences', n = 0, 'seen=' || n);
  INSERT INTO _t VALUES ('staff cannot read the exempt list',
    (SELECT count(*) FROM public.notification_exempt_users) = 0, '');
  RESET ROLE;
END
$t$;

SELECT name, ok, detail FROM _t ORDER BY ok, name;
ROLLBACK;
