BEGIN;

DROP POLICY IF EXISTS "eos_qc_answers_participant_select"
  ON public.eos_qc_answers;

DROP POLICY IF EXISTS "eos_qc_fit_participant_select"
  ON public.eos_qc_fit;

DROP POLICY IF EXISTS "eos_qc_links_participant_select"
  ON public.eos_qc_links;

DROP POLICY IF EXISTS "eos_qc_signoffs_participant_select"
  ON public.eos_qc_signoffs;

COMMIT;

-- Verification query (not executed as part of migration):
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'eos_qc_answers','eos_qc_fit','eos_qc_links','eos_qc_signoffs'
--   )
--   AND cmd = 'SELECT'
-- ORDER BY tablename, policyname;
-- Expected: exactly 4 rows (qc_answers_select, qc_fit_select, qc_links_select, qc_signoffs_select). No *_participant_select policies.

-- Verification query (not executed as part of migration):
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'eos_qc_answers','eos_qc_fit','eos_qc_links','eos_qc_signoffs'
--   )
--   AND cmd = 'SELECT'
-- ORDER BY tablename, policyname;
-- Expected: exactly 4 rows (qc_answers_select, qc_fit_select, qc_links_select, qc_signoffs_select). No *_participant_select policies.
