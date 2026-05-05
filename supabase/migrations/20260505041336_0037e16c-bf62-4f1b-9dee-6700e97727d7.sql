-- =====================================================================
-- Suggestion Register — M1 of 3: schema only
-- Adds is_client_visible column to suggest_items.
-- No data, no RLS, no triggers (those are M2 and M3).
--
-- Lock impact: brief AccessExclusive; constant default → metadata-only
-- rewrite (PG >= 11). 8 rows; sub-second. Off-peak NOT required.
--
-- Verification:
--   SELECT count(*) FILTER (WHERE is_client_visible) FROM public.suggest_items;  -- expect 0
--
-- Rollback:
--   ALTER TABLE public.suggest_items DROP COLUMN is_client_visible;
-- =====================================================================

ALTER TABLE public.suggest_items
  ADD COLUMN is_client_visible boolean NOT NULL DEFAULT false;