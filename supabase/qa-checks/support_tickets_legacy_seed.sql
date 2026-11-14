-- QA ONLY (unicorn-qa, project qfpxvumcrnzrjyvqkicq). Never run against production.
-- Synthetic legacy rows used to prove the support-ticket backfill on a database
-- whose legacy tables are empty. All content is invented. Idempotent.
-- Cleanup: supabase/qa-checks/support_tickets_legacy_seed_cleanup.sql

-- Reference data that production has and QA does not.
INSERT INTO public.dd_suggest_item_type (code, label, sort_order)
SELECT v.code, v.label, v.so FROM (VALUES
  ('suggestion','Suggestion',10),('improvement','Improvement',20),('data_enhancement','Data Enhancement',30),
  ('error','Error',40),('functionality_fail','Functionality Fail',50),('question','Question',60),('other','Other',70)
) v(code, label, so) WHERE NOT EXISTS (SELECT 1 FROM public.dd_suggest_item_type t WHERE t.code = v.code);
INSERT INTO public.dd_suggest_status (code, label, sort_order)
SELECT v.code, v.label, v.so FROM (VALUES
  ('new','New',10),('triaged','Triaged',20),('in_progress','In Progress',30),('blocked','Blocked',40),('resolved','Resolved',50),('closed','Closed',60)
) v(code, label, so) WHERE NOT EXISTS (SELECT 1 FROM public.dd_suggest_status t WHERE t.code = v.code);
INSERT INTO public.dd_suggest_priority (code, label, sort_order)
SELECT v.code, v.label, v.so FROM (VALUES ('low','Low',10),('medium','Medium',20),('high','High',30),('critical','Critical',40)) v(code, label, so)
WHERE NOT EXISTS (SELECT 1 FROM public.dd_suggest_priority t WHERE t.code = v.code);
INSERT INTO public.dd_suggest_impact_rating (code, label, sort_order)
SELECT v.code, v.label, v.so FROM (VALUES ('low','Low',20),('medium','Medium',30),('high','High',40)) v(code, label, so)
WHERE NOT EXISTS (SELECT 1 FROM public.dd_suggest_impact_rating t WHERE t.code = v.code);
INSERT INTO public.dd_suggest_release_status (code, label, sort_order)
SELECT v.code, v.label, v.so FROM (VALUES ('not_released','Not Released',10),('released','Released',20)) v(code, label, so)
WHERE NOT EXISTS (SELECT 1 FROM public.dd_suggest_release_status t WHERE t.code = v.code);

-- QA stand-in for the Vivacity tenant id used by staff-raised and company tickets.
INSERT INTO public.tenants (id, name) SELECT 6372, 'QA Vivacity stand-in' WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = 6372);

WITH u AS (SELECT * FROM (VALUES
  ('sa',  'ada3ae59-4848-41f6-86dd-59ee1004488c'::uuid),
  ('tl',  '83ac1f71-3cf5-71f3-3414-f2c8e91e378a'::uuid),
  ('tm',  '2545941c-6e4d-9f2b-d86a-9a8dac298ac3'::uuid),
  ('c54a','4131db90-24ec-1fc8-452e-1dce57618ed2'::uuid),
  ('c54u','2a527821-bb89-40bc-f684-cf171d18e29d'::uuid),
  ('c56', '0e51e126-1c74-2c02-6c87-50d5a0139618'::uuid),
  ('c55', 'e78282ab-8253-0e00-b626-1f34591ffbe2'::uuid)) x(k, id)),
rows AS (SELECT * FROM (VALUES
 -- n, type, status, urgency, priority, tenant, reporter, assignee, title, description, deleted
 (1,'error','new','high','high',54,'c54a',NULL,'Cannot save the register','Trying to: save a register entry'||E'\n\n'||'What happened: the page went blank',false),
 (2,'suggestion','triaged','medium','medium',54,'c54u','tm','Add bulk upload','We would like to upload contacts in bulk.',false),
 (3,'improvement','in_progress','critical','critical',56,'c56','tl','  Spaced title needing trim  ','The layout is confusing.',false),
 (4,'functionality_fail','blocked','low','low',55,'c55',NULL,'Export fails','The export never finishes.',false),
 (5,'question','resolved','medium','medium',54,'c54a','tm','How do I add a user?','Where do I add a user?',false),
 (6,'error','resolved','high','high',56,'c56','tl','Wrong date shown','Dates show in the US order.',false),
 (7,'other','closed',NULL,'high',55,'c55',NULL,'Closed without a fix','Priority and urgency disagree on this row.',false),
 (8,'suggestion','closed','low','low',54,'c54u','tm','Closed with a note','A request that was declined.',false),
 (9,'data_enhancement','new','high','high',6372,'sa',NULL,'Staff-raised, later deleted','Raised by staff.',true),
 (10,'error','in_progress','medium','medium',6372,'tm','tl','Staff-raised internal bug','Internal issue.',false),
 (11,'improvement','triaged','medium','medium',54,'c54a',NULL,'Improvement with context','Please improve this screen.',false),
 (12,'other','new','medium','medium',56,'c56',NULL,'x','y',false)
) r(n, ty, st, urg, pri, ten, rep, asg, title, descr, del))
INSERT INTO public.suggest_items
 (id, tenant_id, suggest_item_type_id, suggest_status_id, suggest_priority_id, suggest_impact_rating_id,
  suggest_release_status_id, title, description, reported_by, created_by, assigned_to, urgency, is_deleted,
  created_at, updated_at, resolved_at, resolved_by, resolution_notes, error_message, affected_areas,
  steps_to_reproduce, feature_context, improvement_context, source_page_label, source_area, source_component)
SELECT ('a0000000-0000-4000-8000-0000000000' || lpad(r.n::text, 2, '0'))::uuid, r.ten,
  (SELECT id FROM public.dd_suggest_item_type WHERE code = r.ty), (SELECT id FROM public.dd_suggest_status WHERE code = r.st),
  (SELECT id FROM public.dd_suggest_priority WHERE code = r.pri), (SELECT id FROM public.dd_suggest_impact_rating WHERE code = 'medium'),
  (SELECT id FROM public.dd_suggest_release_status WHERE code = 'not_released'),
  r.title, r.descr, (SELECT id FROM u WHERE k = r.rep), (SELECT id FROM u WHERE k = r.rep), (SELECT id FROM u WHERE k = r.asg),
  r.urg, r.del,
  now() - make_interval(days => 100 - r.n * 3), now() - make_interval(days => 50 - r.n),
  CASE WHEN r.st = 'resolved' THEN now() - make_interval(days => 60 - r.n) END,
  CASE WHEN r.n IN (5, 8) THEN (SELECT id FROM u WHERE k = 'tm') END,
  CASE WHEN r.n IN (5, 8) THEN 'Resolution text for row ' || r.n END,
  CASE WHEN r.n = 3 THEN 'Error: example failure' END,
  CASE WHEN r.n = 3 THEN ARRAY['Dashboard','Registers'] END,
  CASE WHEN r.n = 3 THEN 'Open the page, click save' END,
  CASE WHEN r.n = 11 THEN 'Used weekly by the whole team' END,
  CASE WHEN r.n = 11 THEN 'Currently three clicks too many' END,
  CASE WHEN r.n = 10 THEN 'Registers page' END,
  CASE WHEN r.n = 10 THEN 'registers' END,
  CASE WHEN r.n = 10 THEN 'RegisterForm' END
FROM rows r
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.suggest_attachments (id, tenant_id, suggest_item_id, file_name, file_path, file_size_bytes, mime_type, created_by)
SELECT 'a1000000-0000-4000-8000-000000000001', 54, 'a0000000-0000-4000-8000-000000000005', 'legacy-shot.png',
       '54/ada3ae59-4848-41f6-86dd-59ee1004488c/legacy-shot.png', 1234, 'image/png', '4131db90-24ec-1fc8-452e-1dce57618ed2'
ON CONFLICT (id) DO NOTHING;

-- Help Centre support threads (3) plus a chat-bot thread that must NOT migrate.
INSERT INTO public.help_threads (id, tenant_id, user_id, channel, status, subject, created_at, updated_at, metadata) VALUES
 ('b0000000-0000-4000-8000-000000000001', 54, '4131db90-24ec-1fc8-452e-1dce57618ed2', 'support', 'resolved', 'Cannot sign in on mobile', now() - interval '40 days', now() - interval '38 days', '{"page_path":"/client/dashboard","browser":"Chrome","os":"Android","screen":"390x844"}'),
 ('b0000000-0000-4000-8000-000000000002', 56, '0e51e126-1c74-2c02-6c87-50d5a0139618', 'support', 'resolved', NULL, now() - interval '30 days', now() - interval '29 days', '{}'),
 ('b0000000-0000-4000-8000-000000000003', 55, 'e78282ab-8253-0e00-b626-1f34591ffbe2', 'support', 'open', NULL, now() - interval '2 days', now() - interval '2 days', '{"page_path":"/client/documents"}'),
 ('b0000000-0000-4000-8000-000000000009', 54, '4131db90-24ec-1fc8-452e-1dce57618ed2', 'chatbot', 'open', NULL, now() - interval '5 days', now() - interval '5 days', '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.help_messages (id, thread_id, sender_id, role, content, metadata, created_at) VALUES
 ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '4131db90-24ec-1fc8-452e-1dce57618ed2', 'user', 'I cannot sign in on my phone.',
   '{"attachments":[{"url":"https://example.invalid/storage/v1/object/public/support-attachments/54/b0000000-0000-4000-8000-000000000001/aa11-my%20screenshot.png","name":"my screenshot.png","type":"image/png"}]}', now() - interval '40 days'),
 ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', '2545941c-6e4d-9f2b-d86a-9a8dac298ac3', 'staff', 'Thanks, we have reset your access.', '{}', now() - interval '39 days'),
 ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', '0e51e126-1c74-2c02-6c87-50d5a0139618', 'user', 'Where do I find my certificates?', '{}', now() - interval '30 days'),
 ('b1000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'e78282ab-8253-0e00-b626-1f34591ffbe2', 'user', 'The documents page will not load for me today at all, it keeps spinning and I have tried two browsers.', '{}', now() - interval '2 days'),
 ('b1000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000009', '4131db90-24ec-1fc8-452e-1dce57618ed2', 'user', 'chatbot question that must not migrate', '{}', now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;
