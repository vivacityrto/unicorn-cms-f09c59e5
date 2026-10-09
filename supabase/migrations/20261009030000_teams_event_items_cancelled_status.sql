-- =====================================================================
-- Teams event registration — allow a result row to be marked 'cancelled'
--
-- When someone's Teams registration is cancelled from Unicorn, their result
-- row moves from 'registered'/'invited' to 'cancelled'. That row is not
-- covered by uq_teams_event_items_event_email_success (which only spans
-- 'registered'/'invited'), so the person can be registered again later.
--
-- This only WIDENS the allowed values: every existing row already satisfies
-- the new check, and nothing that currently writes the table is affected.
-- The cancel Edge Function is the only writer of 'cancelled', so apply this
-- before that function is deployed.
--
-- ROLLBACK (first move any cancelled rows back, e.g. to 'registered', or delete them):
--   ALTER TABLE public.teams_event_registration_items DROP CONSTRAINT teams_event_items_status_check;
--   ALTER TABLE public.teams_event_registration_items ADD CONSTRAINT teams_event_items_status_check
--     CHECK (result_status IN ('pending','registered','invited','already_processed','excluded','duplicate','failed'));
-- =====================================================================

ALTER TABLE public.teams_event_registration_items
  DROP CONSTRAINT teams_event_items_status_check;

ALTER TABLE public.teams_event_registration_items
  ADD CONSTRAINT teams_event_items_status_check
  CHECK (result_status IN (
    'pending', 'registered', 'invited', 'already_processed',
    'excluded', 'duplicate', 'failed', 'cancelled'
  ));
