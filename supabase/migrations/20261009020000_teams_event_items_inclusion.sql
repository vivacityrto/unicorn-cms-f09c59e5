-- =====================================================================
-- Teams event registration — record who was added for one event only
--
-- Adds `inclusion` to teams_event_registration_items so each person's row
-- says whether they came from the Contact Directory Group or were added
-- for this event only ("extra"). Skipped Group members are recorded as
-- excluded rows with exclusion_reason = 'skipped_for_event' (no schema
-- change needed for that).
--
-- Additive and backwards compatible: existing rows read 'group', and the
-- previously deployed Edge Functions (which never write the column) keep
-- working because of the default. So the migration can be applied before
-- the functions that use it are deployed.
--
-- ROLLBACK:
--   ALTER TABLE public.teams_event_registration_items DROP COLUMN IF EXISTS inclusion;
-- =====================================================================

ALTER TABLE public.teams_event_registration_items
  ADD COLUMN inclusion text NOT NULL DEFAULT 'group'
  CONSTRAINT teams_event_items_inclusion_check CHECK (inclusion IN ('group', 'extra'));
