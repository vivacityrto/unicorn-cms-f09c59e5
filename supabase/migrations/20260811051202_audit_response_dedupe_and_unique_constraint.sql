-- 2026-08-11 audit-response-duplicate-race
-- client_audit_responses had no unique constraint on (audit_id, question_id).
-- A non-atomic check-then-insert/update pattern in the app raced under
-- near-simultaneous saves, and once 2 rows existed for the same question the
-- app's "does a row exist?" check began erroring (maybeSingle() with >1 row)
-- and the error was silently swallowed, causing every future save for that
-- question to insert yet another row. One question (a0025001-0000-0000-0006-000000000001)
-- on audit e3340bd5-70e9-489e-988f-f6a8256e04d5 (Mock Audit - Melloz Services)
-- accumulated 63 duplicate rows as a result.
--
-- Step 1: consolidate the 63 rows for that question into a single row (the
-- earliest, id 57f0c40d-0c06-466d-bec4-1b3acb1f9380) with the verified-correct
-- final answer (rating=compliant, score=2, and the stable notes sentence that
-- appeared unchanged across the last two edits).
delete from client_audit_responses
where audit_id = 'e3340bd5-70e9-489e-988f-f6a8256e04d5'
  and question_id = 'a0025001-0000-0000-0006-000000000001'
  and id <> '57f0c40d-0c06-466d-bec4-1b3acb1f9380';

update client_audit_responses
set rating = 'compliant',
    score = 2,
    notes = 'Cited evidence of Industry consultation records and Industry support letters for each proposed scope item.',
    is_flagged = false,
    responded_at = '2026-08-11 04:57:45.831+00'
where id = '57f0c40d-0c06-466d-bec4-1b3acb1f9380';

-- Step 2: prevent this from ever happening again — enforce one response row
-- per (audit_id, question_id) at the database level, and let the app use a
-- real atomic upsert against it instead of a manual check-then-write.
alter table public.client_audit_responses
  add constraint client_audit_responses_audit_question_uniq
  unique (audit_id, question_id);
