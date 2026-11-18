-- Rollback for 20261118100000_scorecard_discussion.sql
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Drops the notes table (and the notes in it) and the issue link column (issues stay; they only lose the
-- link to their metric). It deliberately keeps cst_last_activity() and the replaced get_cst_report():
-- the new get_cst_report calls cst_last_activity, so dropping the function would break the report, and
-- the extra last_active_at field is harmless to older callers. To go back to the exact earlier report
-- function, re-run the get_cst_report definition from 20261117100000_cst_scorecard_activity_report.sql.

DROP TABLE IF EXISTS public.eos_scorecard_discussion_notes;
DROP INDEX IF EXISTS public.eos_issues_linked_scorecard_metric_idx;
ALTER TABLE public.eos_issues DROP COLUMN IF EXISTS linked_scorecard_metric_id;
