-- QA ONLY (unicorn-qa). Rolled-back RLS and behaviour tests for the support
-- ticket model, run under the real `authenticated` / `anon` roles with each
-- persona's JWT claims. Requires the legacy seed (support_tickets_legacy_seed.sql)
-- and the backfill to have run. Everything is inside one transaction that is
-- rolled back, so QA is left unchanged. Result: one row per check; any ok=false fails.

BEGIN;

CREATE TEMP TABLE _t (name text, ok boolean, detail text);

CREATE FUNCTION pg_temp.act(p_uid uuid, p_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END $f$;

DO $t$
DECLARE
  sa  uuid := 'ada3ae59-4848-41f6-86dd-59ee1004488c';
  tl  uuid := '83ac1f71-3cf5-71f3-3414-f2c8e91e378a';
  tm  uuid := '2545941c-6e4d-9f2b-d86a-9a8dac298ac3';
  ca  uuid := '4131db90-24ec-1fc8-452e-1dce57618ed2';  -- client, tenant 54, reporter of tickets 01, 05, 11
  cb  uuid := '2a527821-bb89-40bc-f684-cf171d18e29d';  -- client, tenant 54, reporter of 02, 08
  c55 uuid := 'e78282ab-8253-0e00-b626-1f34591ffbe2';  -- client, tenant 55, reporter of 04 and 07
  c56 uuid := '0e51e126-1c74-2c02-6c87-50d5a0139618';  -- client, tenant 56
  cin uuid := '7dfeec09-914b-7d64-b13b-f58cac4cc7d7';  -- client, inactive membership
  t_own   uuid := 'a0000000-0000-4000-8000-000000000005';
  t_other uuid := 'a0000000-0000-4000-8000-000000000002';
  t_04    uuid := 'a0000000-0000-4000-8000-000000000004';
  n int; n2 int; v_id uuid; v_num bigint; v_txt text; v_bool boolean; v_raised boolean; v_state text;
BEGIN
  -- 1. A client sees only their own tickets.
  PERFORM pg_temp.act(ca);
  SELECT count(*) INTO n FROM public.support_tickets;
  SELECT count(*) INTO n2 FROM public.support_tickets WHERE reporter_id <> ca;
  RESET ROLE;
  INSERT INTO _t VALUES ('client sees only own tickets', n = 4 AND n2 = 0, 'seen=' || n || ' foreign=' || n2);

  -- 2. A client cannot read another client's ticket, even in the same tenant.
  PERFORM pg_temp.act(ca);
  SELECT count(*) INTO n FROM public.support_tickets WHERE id = t_other;
  RESET ROLE;
  INSERT INTO _t VALUES ('client cannot read same-tenant colleague ticket', n = 0, 'rows=' || n);

  -- 3. A client cannot update status, own or other (the old any-tenant-user UPDATE gap).
  PERFORM pg_temp.act(ca);
  UPDATE public.support_tickets SET status = 'closed' WHERE id = t_own;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.support_tickets SET status = 'closed', assignee_id = ca WHERE id = t_other;
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RESET ROLE;
  SELECT status INTO v_txt FROM public.support_tickets WHERE id = t_own;
  INSERT INTO _t VALUES ('client cannot update tickets', n = 0 AND n2 = 0 AND v_txt = 'resolved', 'own=' || n || ' other=' || n2 || ' status=' || v_txt);

  -- 4. A client cannot insert a ticket directly.
  v_raised := false;
  PERFORM pg_temp.act(ca);
  BEGIN
    INSERT INTO public.support_tickets (tenant_id, reporter_id, title) VALUES (54, ca, 'direct');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  INSERT INTO _t VALUES ('client cannot insert ticket directly', v_raised, '');

  -- 5. create_support_ticket as a client: defaults, verbatim wording, staff-only diagnostics, notifications.
  PERFORM pg_temp.act(ca);
  SELECT c.id, c.ticket_number INTO v_id, v_num
    FROM public.create_support_ticket('Test subject', 'My exact wording  with spaces',
         '/client/x', '{"browser":"Chrome","os":"Win","screen":"1x1","page_path":"/client/x","evil":"drop table"}'::jsonb) c;
  SELECT (ai_state || '|' || type || '|' || urgency || '|' || product || '|' || tenant_id || '|' || status) INTO v_txt
    FROM public.support_tickets WHERE id = v_id;
  SELECT count(*) INTO n FROM public.support_ticket_messages WHERE ticket_id = v_id;
  SELECT body INTO v_state FROM public.support_ticket_messages WHERE ticket_id = v_id AND kind = 'reply';
  RESET ROLE;
  INSERT INTO _t VALUES ('client ticket created with default fields',
    v_txt = 'pending|other|medium|unicorn|54|new', v_txt);
  INSERT INTO _t VALUES ('client sees only the public message (diagnostics hidden)', n = 1, 'visible=' || n);
  INSERT INTO _t VALUES ('reporter wording stored verbatim', v_state = 'My exact wording  with spaces', '');
  PERFORM pg_temp.act(sa);
  SELECT count(*) INTO n FROM public.support_ticket_messages WHERE ticket_id = v_id;
  SELECT string_agg(body, ' ') INTO v_txt FROM public.support_ticket_messages WHERE ticket_id = v_id AND kind = 'event';
  RESET ROLE;
  INSERT INTO _t VALUES ('staff sees message plus diagnostics, allowlisted keys only',
    n = 2 AND v_txt LIKE '%Chrome%' AND v_txt NOT LIKE '%drop table%', 'visible=' || n);
  SELECT count(*) INTO n FROM public.user_notifications WHERE source_id = v_id::text AND type = 'ticket_submitted' AND user_id IN (sa, tl, tm);
  INSERT INTO _t VALUES ('triage notifications sent to staff only', n >= 1 AND NOT EXISTS (
    SELECT 1 FROM public.user_notifications WHERE source_id = v_id::text AND user_id = ca), 'notified=' || n);

  -- 6. Clients cannot set classification, another product, or a tenant they are not in.
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN PERFORM public.create_support_ticket('s', 'b', NULL, NULL, 'unicorn', NULL, 'bug', NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot set type', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN PERFORM public.create_support_ticket('s', 'b', NULL, NULL, 'company', NULL, NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot raise company ticket', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN PERFORM public.create_support_ticket('s', 'b', NULL, NULL, 'unicorn', 56, NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot raise ticket in a tenant they do not belong to', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(cin);
  BEGIN PERFORM public.create_support_ticket('s', 'b');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client with inactive membership cannot raise ticket', v_raised, '');

  -- 9. Staff-only rows hidden from the reporter on a migrated ticket (reply + note visible; migration event hidden).
  PERFORM pg_temp.act(ca);
  SELECT count(*) INTO n FROM public.support_ticket_messages WHERE ticket_id = t_own;
  RESET ROLE;
  SELECT count(*) INTO n2 FROM public.support_ticket_messages WHERE ticket_id = t_own;
  INSERT INTO _t VALUES ('migrated ticket: reporter sees replies only, not the migration event', n = 2 AND n2 = 3, 'client=' || n || ' all=' || n2);

  -- 8. Reply rules.
  PERFORM pg_temp.act(ca);
  INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (v_id, ca, 'reply', false, 'a reply');
  RESET ROLE; INSERT INTO _t VALUES ('client can reply on own ticket', true, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (v_id, ca, 'reply', true, 'sneaky note');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot post a staff-only note', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (v_id, ca, 'event', false, 'forged event');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot forge an event', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (v_id, ca, 'ai_draft', true, 'forged draft');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot forge an AI draft', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (t_other, ca, 'reply', false, 'into someone else''s ticket');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot reply on a colleague ticket', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (v_id, cb, 'reply', false, 'impersonation');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot post as another user', v_raised, '');
  v_raised := false;
  BEGIN INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (v_id, NULL, 'ai_draft', false, 'bad');
  EXCEPTION WHEN check_violation THEN v_raised := true; END;
  INSERT INTO _t VALUES ('ai_draft rows are forced staff-only by constraint', v_raised, '');

  -- 10. Staff status change: event, resolved_at, reporter notification.
  PERFORM pg_temp.act(tm);
  UPDATE public.support_tickets SET status = 'resolved' WHERE id = t_04;
  RESET ROLE;
  SELECT (resolved_at IS NOT NULL)::text INTO v_txt FROM public.support_tickets WHERE id = t_04;
  SELECT count(*) INTO n FROM public.support_ticket_messages WHERE ticket_id = t_04 AND kind = 'event' AND body = 'Status changed to Resolved' AND NOT staff_only AND author_id = tm;
  SELECT count(*) INTO n2 FROM public.user_notifications WHERE source_id = t_04::text AND type = 'ticket_resolved' AND user_id = c55;
  INSERT INTO _t VALUES ('staff status change sets resolved_at, writes public event, notifies reporter', v_txt = 'true' AND n = 1 AND n2 = 1, 'resolved_at=' || v_txt || ' event=' || n || ' notif=' || n2);

  -- 11. Assignment: staff only; events are staff-only.
  v_raised := false; PERFORM pg_temp.act(tm);
  BEGIN UPDATE public.support_tickets SET assignee_id = ca WHERE id = t_04;
  EXCEPTION WHEN invalid_parameter_value THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('cannot assign a ticket to a client user', v_raised, '');
  PERFORM pg_temp.act(tm);
  UPDATE public.support_tickets SET assignee_id = tl WHERE id = t_04;
  RESET ROLE;
  PERFORM pg_temp.act(c55);
  SELECT count(*) INTO n FROM public.support_ticket_messages WHERE ticket_id = t_04 AND body LIKE 'Assigned to%';
  SELECT count(*) INTO n2 FROM public.support_ticket_messages WHERE ticket_id = t_04 AND body = 'Status changed to Resolved';
  RESET ROLE;
  INSERT INTO _t VALUES ('assignment event hidden from reporter, status event visible', n = 0 AND n2 = 1, 'assign_visible=' || n || ' status_visible=' || n2);

  -- 12. Reporter reply reopens a resolved ticket (definer trigger; clients have no UPDATE).
  PERFORM pg_temp.act(ca);
  INSERT INTO public.support_ticket_messages (ticket_id, author_id, kind, staff_only, body) VALUES (t_own, ca, 'reply', false, 'It is still broken');
  RESET ROLE;
  SELECT status INTO v_txt FROM public.support_tickets WHERE id = t_own;
  SELECT count(*) INTO n FROM public.user_notifications WHERE source_id = t_own::text AND type = 'ticket_reply';
  INSERT INTO _t VALUES ('client reply reopens a resolved ticket and notifies staff', v_txt = 'in_progress' AND n >= 1, 'status=' || v_txt || ' notified=' || n);

  -- 13. Soft delete is Super Admin only.
  v_raised := false; PERFORM pg_temp.act(tm);
  BEGIN UPDATE public.support_tickets SET deleted_at = now() WHERE id = t_04;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('team member cannot delete a ticket', v_raised, '');
  PERFORM pg_temp.act(sa);
  UPDATE public.support_tickets SET deleted_at = now() WHERE id = t_04;
  RESET ROLE;
  PERFORM pg_temp.act(c55);
  SELECT count(*) INTO n FROM public.support_tickets WHERE id = t_04;
  RESET ROLE;
  INSERT INTO _t VALUES ('super admin delete hides the ticket from its reporter', n = 0, 'rows=' || n);

  -- 14. Immutable columns, product and tenant boundary.
  v_raised := false; PERFORM pg_temp.act(sa);
  BEGIN UPDATE public.support_tickets SET tenant_id = 56 WHERE id = t_other;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('tenant_id cannot be changed, even by a super admin', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(sa);
  BEGIN PERFORM public.create_support_ticket('s', 'b', NULL, NULL, 'complyhub_ai', 54, NULL, NULL, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('ComplyHub ticket cannot carry a customer tenant', v_raised, '');
  PERFORM pg_temp.act(tm);
  SELECT c.id INTO v_id FROM public.create_support_ticket('ComplyHub bug', 'Staff-written, no customer data', NULL, NULL, 'complyhub_ai', NULL, 'bug', 'high', 'https://example.invalid/ref/1') c;
  RESET ROLE;
  SELECT (product || '|' || tenant_id || '|' || type || '|' || urgency || '|' || ai_state) INTO v_txt FROM public.support_tickets WHERE id = v_id;
  INSERT INTO _t VALUES ('staff-raised ComplyHub ticket uses the Vivacity tenant and no AI draft', v_txt = 'complyhub_ai|6372|bug|high|none', v_txt);
  PERFORM pg_temp.act(ca);
  SELECT count(*) INTO n FROM public.support_tickets WHERE product <> 'unicorn';
  RESET ROLE;
  INSERT INTO _t VALUES ('clients never see ComplyHub or company tickets', n = 0, 'rows=' || n);
  v_raised := false;
  BEGIN INSERT INTO public.support_tickets (product, tenant_id, reporter_id, title) VALUES ('company', 54, sa, 'bad tenant');
  EXCEPTION WHEN check_violation THEN v_raised := true; END;
  INSERT INTO _t VALUES ('database blocks a customer tenant on a company ticket', v_raised, '');

  -- 15. Attachments.
  PERFORM pg_temp.act(ca);
  INSERT INTO public.support_ticket_attachments (ticket_id, bucket, storage_path, file_name, uploaded_by) VALUES (t_own, 'ticket-files', t_own || '/shot.png', 'shot.png', ca);
  RESET ROLE; INSERT INTO _t VALUES ('client can attach to own ticket', true, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_attachments (ticket_id, bucket, storage_path, file_name, uploaded_by) VALUES (t_own, 'suggest-attachments', 'x/y.png', 'y.png', ca);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot register a legacy-bucket attachment', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO public.support_ticket_attachments (ticket_id, bucket, storage_path, file_name, uploaded_by) VALUES (t_other, 'ticket-files', t_other || '/z.png', 'z.png', ca);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot attach to a colleague ticket', v_raised, '');

  -- 16. Storage object visibility follows the attachment row.
  INSERT INTO storage.objects (bucket_id, name) VALUES ('ticket-files', t_own || '/shot.png');
  PERFORM pg_temp.act(ca);   SELECT count(*) INTO n  FROM storage.objects WHERE bucket_id = 'ticket-files';
  PERFORM pg_temp.act(c56);  SELECT count(*) INTO n2 FROM storage.objects WHERE bucket_id = 'ticket-files';
  RESET ROLE;
  INSERT INTO _t VALUES ('reporter reads own file, other tenant cannot', n = 1 AND n2 = 0, 'reporter=' || n || ' other=' || n2);
  PERFORM pg_temp.act(tm);   SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'ticket-files';
  RESET ROLE;
  INSERT INTO _t VALUES ('staff reads ticket files', n = 1, 'rows=' || n);
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('ticket-files', t_other || '/up.png', ca::text);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client cannot upload into a colleague ticket folder', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(ca);
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('ticket-files', t_own || '/up.png', ca::text);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('client can upload into own ticket folder', NOT v_raised, '');

  -- 17. anon has no access at all.
  v_raised := false; PERFORM pg_temp.act(NULL, 'anon');
  BEGIN PERFORM count(*) FROM public.support_tickets;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('anon cannot read tickets', v_raised, '');
  v_raised := false; PERFORM pg_temp.act(NULL, 'anon');
  BEGIN PERFORM public.create_support_ticket('s', 'b');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true; END;
  RESET ROLE; INSERT INTO _t VALUES ('anon cannot call create_support_ticket', v_raised, '');
END
$t$;

SELECT name, ok, detail FROM _t;
ROLLBACK;
