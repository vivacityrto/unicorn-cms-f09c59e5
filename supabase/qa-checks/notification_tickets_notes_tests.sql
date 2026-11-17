-- QA ONLY (unicorn-qa). Rolled-back tests for ticket and note routing
-- (20261117170000_notification_tickets_notes_routing.sql). Same QA personas as
-- notification_routing_tests.sql: tenant 54 has the Team Member as primary CSC,
-- tenant 55 has no CSC. Everything runs in one transaction that is rolled back.
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

DO $t$
DECLARE
  sa  uuid := 'ada3ae59-4848-41f6-86dd-59ee1004488c';  -- Super Admin
  tm  uuid := '2545941c-6e4d-9f2b-d86a-9a8dac298ac3';  -- Team Member, primary CSC on tenant 54
  tl  uuid := '83ac1f71-3cf5-71f3-3414-f2c8e91e378a';  -- Team Leader
  int1 uuid := 'deb8aaba-bfe8-9e95-66ba-962c56d19576'; -- Integrator
  ca  uuid := '4131db90-24ec-1fc8-452e-1dce57618ed2';  -- client user, tenant 54
  c55 uuid := 'e78282ab-8253-0e00-b626-1f34591ffbe2';  -- client user, tenant 55
  v_id uuid; v_num bigint; n int; v text; d uuid;
BEGIN
  RESET ROLE;

  -- Function shape: one overload, callers updated.
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'support_triage_recipients';
  INSERT INTO _t VALUES ('support_triage_recipients has exactly one overload', n = 1, 'overloads=' || n);
  INSERT INTO _t VALUES ('create_support_ticket passes the tenant',
    (SELECT pg_get_functiondef(oid) LIKE '%support_triage_recipients(NULL, v_uid, v_tenant)%' FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'create_support_ticket'), '');
  INSERT INTO _t VALUES ('the reply trigger passes the tenant',
    (SELECT pg_get_functiondef(oid) LIKE '%support_triage_recipients(t.assignee_id, NEW.author_id, t.tenant_id)%' FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'support_ticket_messages_after_insert'), '');

  -- Recipients.
  SELECT string_agg(user_id::text, ',') INTO v FROM public.support_triage_recipients(NULL, NULL, 54);
  INSERT INTO _t VALUES ('unassigned ticket for an owned tenant goes to the primary CSC only', v = tm::text, coalesce(v, 'none'));
  SELECT count(*) INTO n FROM public.support_triage_recipients(NULL, NULL, 55);
  INSERT INTO _t VALUES ('unassigned ticket for a tenant with no owner goes to the triage pool', n = 3, 'rows=' || n);
  SELECT count(*) INTO n FROM public.support_triage_recipients(NULL, NULL, NULL);
  INSERT INTO _t VALUES ('a ticket with no tenant goes to the triage pool', n = 3, 'rows=' || n);
  SELECT count(*) INTO n FROM public.support_triage_recipients(NULL, NULL, 6372);
  INSERT INTO _t VALUES ('a ticket for the Vivacity tenant goes to the triage pool, not its owners', n = 3, 'rows=' || n);
  SELECT string_agg(user_id::text, ',') INTO v FROM public.support_triage_recipients(tl, NULL, 54);
  INSERT INTO _t VALUES ('an assigned ticket goes to the assignee only', v = tl::text, coalesce(v, 'none'));
  SELECT count(*) INTO n FROM public.support_triage_recipients(tl, tl, 54);
  INSERT INTO _t VALUES ('the actor is never told', n = 0, 'rows=' || n);

  -- A delegate is told too.
  PERFORM pg_temp.act(sa);
  d := public.create_notification_delegate('all_csc', NULL, int1, NULL, ARRAY['support_ticket']);
  RESET ROLE;
  SELECT count(*) INTO n FROM public.support_triage_recipients(NULL, NULL, 54) WHERE user_id IN (tm, int1);
  INSERT INTO _t VALUES ('a delegate for tickets is told with the owner', n = 2, 'rows=' || n);

  -- End to end: a client submits a ticket.
  PERFORM pg_temp.act(ca);
  SELECT t.id, t.ticket_number INTO v_id, v_num
    FROM public.create_support_ticket('QA routing ticket', 'QA body', '/client/qa', '{}'::jsonb, 'unicorn', 54, NULL, NULL, NULL) t;
  RESET ROLE;
  SELECT string_agg(user_id::text, ',' ORDER BY user_id::text) INTO v
    FROM public.user_notifications WHERE type = 'ticket_submitted' AND source_id = v_id::text;
  INSERT INTO _t VALUES ('a client ticket notifies the owner and the ticket delegate, not the whole team',
    v = (SELECT string_agg(x::text, ',' ORDER BY x::text) FROM (VALUES (tm), (int1)) AS q(x)), coalesce(v, 'none'));

  PERFORM pg_temp.act(c55);
  SELECT t.id INTO v_id
    FROM public.create_support_ticket('QA unowned ticket', 'QA body', '/client/qa', '{}'::jsonb, 'unicorn', 55, NULL, NULL, NULL) t;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.user_notifications WHERE type = 'ticket_submitted' AND source_id = v_id::text;
  INSERT INTO _t VALUES ('a ticket for a tenant with no owner still reaches the triage pool', n = 3, 'rows=' || n);

  -- Notes helper.
  PERFORM pg_temp.act(tl);
  SELECT string_agg(user_id::text || ':' || reason, ',') INTO v FROM public.get_client_notification_recipients('client_note', 54);
  RESET ROLE;
  INSERT INTO _t VALUES ('staff can ask who to tell about a client note', v = tm::text || ':primary_csc', coalesce(v, 'none'));
  PERFORM pg_temp.act(tm);
  SELECT count(*) INTO n FROM public.get_client_notification_recipients('client_note', 54);
  RESET ROLE;
  INSERT INTO _t VALUES ('the caller is never in the answer', n = 0, 'rows=' || n);
  PERFORM pg_temp.act(ca);
  INSERT INTO _t VALUES ('a client user cannot call the helper',
    pg_temp.try($$SELECT * FROM public.get_client_notification_recipients('client_note', 54)$$) = '42501', '');
  RESET ROLE;
  PERFORM pg_temp.act(NULL, 'anon');
  INSERT INTO _t VALUES ('anon cannot call the helper',
    pg_temp.try($$SELECT * FROM public.get_client_notification_recipients('client_note', 54)$$) = '42501', '');
  INSERT INTO _t VALUES ('anon cannot call the triage function',
    pg_temp.try($$SELECT * FROM public.support_triage_recipients(NULL, NULL, 54)$$) = '42501', '');
  RESET ROLE;
END
$t$;

SELECT name, ok, detail FROM _t ORDER BY ok, name;
ROLLBACK;
